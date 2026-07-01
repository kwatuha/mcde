const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { computeFrontLoadRisk, groupLinesByMilestone } = require('../services/procurementFrontLoadService');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

/** Canonical procurement stage labels (sync / gates / seeds). */
const STAGE_BIDDER_REGISTRY = 'Bidder Registry';
const STAGE_PRE_QUALIFICATION = 'Bidder Pre-Qualification';
const STAGE_BID_EVALUATION = 'Bid Evaluation';
const STAGE_AWARD_DECISION = 'Award Decision';
const STAGE_CONTRACT_SIGNING = 'Contract Signing';
const STAGE_PURCHASE_ORDER_ISSUED = 'Purchase Order Issued';
/** Terminal workflow stage: no further procurement (no award). Gates skipped when transitioning here. */
const STAGE_PROCUREMENT_TERMINATED = 'Procurement Terminated';

/** Default workflow stage labels (seed once into procurement_stages). Matches legacy Procurement UI. */
const PROCUREMENT_STAGE_SEED_LABELS = [
  'Needs Identification',
  'Requisition Approved',
  'Tender Published',
  STAGE_BIDDER_REGISTRY,
  STAGE_BID_EVALUATION,
  'Award Decision',
  STAGE_CONTRACT_SIGNING,
  STAGE_PURCHASE_ORDER_ISSUED,
  STAGE_PROCUREMENT_TERMINATED,
];

function stageNorm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Older workflow rows only recorded stage transitions; decisions live on subject assessments.
 * For exports, prefer an explicit workflow decision when set (and not Pending); otherwise use latest assessment.
 */
function mergeWorkflowExportRows(workflowRows, assessmentRows) {
  const latestByProjectStage = new Map();
  for (const a of assessmentRows || []) {
    const pid = a.projectId;
    const st = stageNorm(a.stage);
    if (!Number.isFinite(Number(pid)) || !st) continue;
    const key = `${pid}|${st}`;
    const prev = latestByProjectStage.get(key);
    const t = new Date(a.updatedAt || 0).getTime();
    const pt = prev ? new Date(prev.updatedAt || 0).getTime() : -Infinity;
    if (!prev || t >= pt) latestByProjectStage.set(key, a);
  }
  const mergeDecision = (wfDecision, assessmentDecision) => {
    const w = String(wfDecision ?? '').trim();
    const a = String(assessmentDecision ?? '').trim();
    if (w && !/^pending$/i.test(w)) return w;
    if (a) return a;
    return w || '';
  };
  const mergeNotes = (wfNotes, assessmentNotes) => {
    const w = String(wfNotes ?? '').trim();
    const a = String(assessmentNotes ?? '').trim();
    if (w) return w;
    return a || '';
  };
  return (workflowRows || []).map((w) => {
    const key = `${w.projectId}|${stageNorm(w.stage)}`;
    const ass = latestByProjectStage.get(key);
    return {
      ...w,
      decision: mergeDecision(w.decision, ass?.decision),
      notes: mergeNotes(w.notes, ass?.notes),
    };
  });
}

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtHtmlDate(v) {
  if (v === undefined || v === null || v === '') return '';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return escapeHtml(String(v));
    return escapeHtml(d.toISOString());
  } catch {
    return escapeHtml(String(v));
  }
}

function fmtHtmlBool(v) {
  if (v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true') return 'Yes';
  if (v === false || v === 0 || v === '0' || String(v).toLowerCase() === 'false') return 'No';
  return escapeHtml(v === undefined || v === null ? '' : String(v));
}

function normalizeJsonObject(meta) {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) return meta;
  if (typeof meta === 'string') {
    try {
      const o = JSON.parse(meta || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Short, readable line from bidder/registry metadata (HTML report only). */
function summarizeSubjectMetadataForHtml(meta) {
  const m = normalizeJsonObject(meta);
  const parts = [];
  const company = String(m.companyName || m.company || '').trim();
  const contact = String(m.contactName || '').trim();
  const phone = String(m.contactPhone || '').trim();
  const email = String(m.contactEmail || '').trim();
  const reg = String(m.registrationNo || '').trim();
  const kra = String(m.kraPin || '').trim();
  if (company) parts.push(`Company: ${escapeHtml(company)}`);
  if (contact) parts.push(`Contact: ${escapeHtml(contact)}`);
  if (phone) parts.push(escapeHtml(phone));
  if (email) parts.push(escapeHtml(email));
  if (reg) parts.push(`Reg.: ${escapeHtml(reg)}`);
  if (kra) parts.push(`PIN: ${escapeHtml(kra)}`);
  if (parts.length) return parts.join(' · ');
  return '—';
}

/** Non-technical summary instead of raw assessment JSON. */
function summarizeAssessmentResponsesForHtml(responses) {
  const r = normalizeJsonObject(responses);
  let filled = 0;
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'boolean') {
      filled += 1;
      continue;
    }
    const s = String(v).trim();
    if (s !== '') filled += 1;
  }
  if (filled === 0) return '—';
  return escapeHtml(`${filled} field${filled === 1 ? '' : 's'} with answers`);
}

function isTemplateRowActive(t) {
  const v = t?.active;
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function templateRowUpdatedMs(t) {
  const raw = t?.updatedAt ?? t?.updated_at;
  const x = new Date(raw || 0).getTime();
  return Number.isNaN(x) ? 0 : x;
}

/** Pick one row when several DB templates share stage + name + subject type (history / duplicates). */
function pickBetterTemplateRow(a, b) {
  const aa = isTemplateRowActive(a);
  const ba = isTemplateRowActive(b);
  if (aa !== ba) return ba ? b : a;
  const ida = Number(a.id) || 0;
  const idb = Number(b.id) || 0;
  if (idb !== ida) return idb >= ida ? b : a;
  return templateRowUpdatedMs(b) >= templateRowUpdatedMs(a) ? b : a;
}

/** One row per distinct stage + template name + subject type for HTML workbook (avoids repeated lines). */
function dedupeTemplatesForHtmlReport(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const map = new Map();
  for (const t of list) {
    const stage = String(t.stage || '').trim().toLowerCase();
    const name = String(t.name || '').trim().toLowerCase();
    const st = String(t.subjectType || t.subject_type || '').trim().toLowerCase();
    const key = `${stage}|${name}|${st}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, t);
      continue;
    }
    map.set(key, pickBetterTemplateRow(prev, t));
  }
  return Array.from(map.values()).sort((a, b) => {
    const c = String(a.stage || '').localeCompare(String(b.stage || ''), undefined, { sensitivity: 'base' });
    if (c !== 0) return c;
    const n = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    if (n !== 0) return n;
    return String(a.subjectType || a.subject_type || '').localeCompare(
      String(b.subjectType || b.subject_type || ''),
      undefined,
      { sensitivity: 'base' }
    );
  });
}

/** Printable / in-browser report mirroring the comprehensive Excel workbook. */
function renderProcurementComprehensiveHtml(payload) {
  const {
    schemaReady,
    hasProjectFilter,
    projectId,
    workflowsForExport,
    subjects,
    assessments,
    checklist,
    attachments,
    templates,
  } = payload;
  const iso = new Date().toISOString();
  const generatedEsc = escapeHtml(iso);

  if (!schemaReady) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Procurement export</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:1.75rem;line-height:1.5;color:#1a1a1a;max-width:960px}
</style>
</head>
<body>
<h1>Procurement export</h1>
<p>Procurement schema is not ready on this server. Run migrations or use the Excel export.</p>
<p><small>Generated ${generatedEsc}</small></p>
</body>
</html>`;
  }

  const wf = workflowsForExport || [];
  const sub = subjects || [];
  const ass = assessments || [];
  const chk = checklist || [];
  const att = attachments || [];
  const tpl = dedupeTemplatesForHtmlReport(templates || []);

  const titleHead = hasProjectFilter && projectId != null
    ? `Procurement workbook — project ${escapeHtml(projectId)}`
    : 'Procurement workbook — all projects';
  const scopeLabel = hasProjectFilter && projectId != null ? escapeHtml(projectId) : 'All projects';

  const wfRows = wf.length
    ? wf.map((w) => `<tr><td>${escapeHtml(w.projectId)}</td><td>${escapeHtml(w.stage)}</td><td>${escapeHtml(w.decision)}</td><td>${escapeHtml(w.notes)}</td><td>${escapeHtml(w.actorId)}</td><td>${fmtHtmlDate(w.updatedAt)}</td></tr>`).join('')
    : '<tr><td colspan="6">No workflow rows</td></tr>';

  const subRows = sub.length
    ? sub.map((s) => `<tr><td>${escapeHtml(s.projectId)}</td><td>${escapeHtml(s.stage)}</td><td>${escapeHtml(s.subjectType)}</td><td>${escapeHtml(s.subjectName)}</td><td>${fmtHtmlBool(s.qualified)}</td><td>${escapeHtml(s.latestScore)}</td><td>${escapeHtml(s.latestDecision)}</td><td>${summarizeSubjectMetadataForHtml(s.metadata)}</td></tr>`).join('')
    : '<tr><td colspan="8">No subjects</td></tr>';

  const assRows = ass.length
    ? ass.map((a) => `<tr><td>${escapeHtml(a.projectId)}</td><td>${escapeHtml(a.stage)}</td><td>${escapeHtml(a.subjectName)}</td><td>${escapeHtml(a.score)}</td><td>${escapeHtml(a.maxScore)}</td><td>${fmtHtmlBool(a.qualified)}</td><td>${escapeHtml(a.decision)}</td><td>${escapeHtml(a.notes)}</td><td>${summarizeAssessmentResponsesForHtml(a.responses)}</td><td>${fmtHtmlDate(a.updatedAt)}</td></tr>`).join('')
    : '<tr><td colspan="10">No assessments</td></tr>';

  const chkRows = chk.length
    ? chk.map((c) => `<tr><td>${escapeHtml(c.projectId)}</td><td>${escapeHtml(c.stage)}</td><td>${escapeHtml(c.label)}</td><td>${fmtHtmlBool(c.completed)}</td><td>${fmtHtmlDate(c.completedAt)}</td><td>${escapeHtml(c.notes)}</td></tr>`).join('')
    : '<tr><td colspan="6">No checklist items</td></tr>';

  const attRows = att.length
    ? att.map((x) => `<tr><td>${escapeHtml(x.projectId)}</td><td>${escapeHtml(x.stage)}</td><td>${escapeHtml(x.title)}</td><td>${escapeHtml(x.fileName)}</td><td>${fmtHtmlDate(x.createdAt)}</td></tr>`).join('')
    : '<tr><td colspan="5">No attachments</td></tr>';

  const tplRows = tpl.length
    ? tpl.map((t) => `<tr><td>${escapeHtml(t.stage)}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.subjectType)}</td><td>${fmtHtmlBool(t.active)}</td></tr>`).join('')
    : '<tr><td colspan="4">No templates</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${titleHead}</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:1.25rem 1.5rem 2rem;line-height:1.45;color:#1a1a1a;background:#fafafa}
.wrap{max-width:1280px;margin:0 auto;background:#fff;padding:1.25rem 1.5rem 2rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:1.35rem;margin:0 0 .35rem}
.meta{color:#444;font-size:.9rem;margin:0 0 1rem}
p.section-overview{margin:0 0 1.25rem;padding:.65rem .85rem;background:#f0f4f8;border-radius:6px;font-size:.88rem;color:#333;line-height:1.5}
h2{font-size:1.08rem;margin:1.75rem 0 .5rem;padding-bottom:.25rem;border-bottom:1px solid #ddd}
table.data{border-collapse:collapse;width:100%;font-size:.82rem;margin-top:.35rem}
table.data th,table.data td{border:1px solid #ccc;padding:.35rem .45rem;text-align:left;vertical-align:top}
table.data th{background:#e8eef4;font-weight:600}
table.data tbody tr:nth-child(even){background:#f9f9f9}
@media print{
body{background:#fff}
.wrap{box-shadow:none}
p.section-overview{display:none}
table.data{font-size:.72rem}
}
</style>
</head>
<body>
<div class="wrap">
<h1>${hasProjectFilter && projectId != null ? `Project ${escapeHtml(projectId)}` : 'All projects'} — procurement workbook</h1>
<p class="meta">Generated <time datetime="${escapeHtml(iso)}">${generatedEsc}</time> · Scope: ${scopeLabel}</p>
<p class="section-overview" role="note">This report is organized in sections below: <strong>Summary</strong>, <strong>Workflow</strong>, <strong>Subjects</strong>, <strong>Assessments</strong>, <strong>Checklist</strong>, <strong>Attachments</strong>, and <strong>Templates</strong>. Scroll to review each part.</p>

<section id="summary"><h2>Summary</h2>
<table class="data">
<tbody>
<tr><th scope="row">Generated At</th><td>${generatedEsc}</td></tr>
<tr><th scope="row">Scope</th><td>${scopeLabel}</td></tr>
<tr><th scope="row">Schema Ready</th><td>Yes</td></tr>
</tbody>
</table>
</section>

<section id="workflow"><h2>Workflow</h2>
<table class="data">
<thead><tr><th>Project ID</th><th>Stage</th><th>Decision</th><th>Notes</th><th>Actor ID</th><th>Updated At</th></tr></thead>
<tbody>${wfRows}</tbody>
</table>
</section>

<section id="subjects"><h2>Subjects</h2>
<table class="data">
<thead><tr><th>Project ID</th><th>Stage</th><th>Subject Type</th><th>Subject Name</th><th>Qualified</th><th>Latest Score</th><th>Latest Decision</th><th>Contact / company details</th></tr></thead>
<tbody>${subRows}</tbody>
</table>
</section>

<section id="assessments"><h2>Assessments</h2>
<table class="data">
<thead><tr><th>Project ID</th><th>Stage</th><th>Subject Name</th><th>Score</th><th>Max Score</th><th>Qualified</th><th>Decision</th><th>Notes</th><th>Form answers</th><th>Updated At</th></tr></thead>
<tbody>${assRows}</tbody>
</table>
</section>

<section id="checklist"><h2>Checklist</h2>
<table class="data">
<thead><tr><th>Project ID</th><th>Stage</th><th>Item</th><th>Completed</th><th>Completed At</th><th>Notes</th></tr></thead>
<tbody>${chkRows}</tbody>
</table>
</section>

<section id="attachments"><h2>Attachments</h2>
<table class="data">
<thead><tr><th>Project ID</th><th>Stage</th><th>Title</th><th>File Name</th><th>Uploaded At</th></tr></thead>
<tbody>${attRows}</tbody>
</table>
</section>

<section id="templates"><h2>Templates</h2>
<table class="data">
<thead><tr><th>Stage</th><th>Template Name</th><th>Subject Type</th><th>Active</th></tr></thead>
<tbody>${tplRows}</tbody>
</table>
</section>

</div>
</body>
</html>`;
}

function decisionIsAwarded(d) {
  const x = String(d || '').trim().toLowerCase();
  return x === 'awarded';
}

/** Seed default name; when several active templates share a stage+subject_type, assessments prefer this row. */
const NEEDS_IDENTIFICATION_DEFAULT_TEMPLATE_NAME = 'Strategic need & feasibility';
const PURCHASE_ORDER_DEFAULT_TEMPLATE_NAME = 'LPO / commitment register';

function preferredTemplateNameForAssessment(stageLabel) {
  const n = stageNorm(stageLabel);
  if (n === stageNorm('Needs Identification')) return NEEDS_IDENTIFICATION_DEFAULT_TEMPLATE_NAME;
  if (n === stageNorm(STAGE_BIDDER_REGISTRY)) return 'Bidder registry (master list)';
  if (n === stageNorm('Purchase Order Issued')) return PURCHASE_ORDER_DEFAULT_TEMPLATE_NAME;
  return '';
}

function alternateSubjectType(subjectType) {
  const t = String(subjectType || '').trim().toLowerCase();
  if (t === 'bidder') return 'generic';
  if (t === 'generic') return 'bidder';
  return 'generic';
}

function pickBidderRegistryMetadata(responses) {
  const r = responses && typeof responses === 'object' ? responses : {};
  const pick = (k) => {
    const v = r[k];
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s ? s : undefined;
  };
  const out = {};
  for (const k of ['companyName', 'contactName', 'contactPhone', 'contactEmail', 'registrationNo', 'kraPin', 'agpoCategory']) {
    const v = pick(k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const rowsOf = (result) => {
  if (Array.isArray(result)) return result[0] || [];
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};
const runProcurementSafeDdl = async (sql) => {
  try {
    await pool.query(sql);
  } catch (err) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '').toLowerCase();
    if (
      code === '42P07' ||
      code === '42710' ||
      code === '23505' ||
      code === 'ER_DUP_FIELDNAME' ||
      msg.includes('duplicate column') ||
      msg.includes('already exists')
    ) {
      return;
    }
    throw err;
  }
};
const isSchemaError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes('operator does not exist') ||
    msg.includes('invalid input syntax')
  );
};

let procurementSchemaEnsured = false;
const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${String(file.originalname || 'file').replace(/\s+/g, '_')}`),
  }),
});
const scopeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function ensureProcurementWorkflowTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_procurement_workflow (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(100) NOT NULL,
        decision VARCHAR(100) NULL,
        notes TEXT NULL,
        actor_id BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_project_procurement_workflow_project
       ON project_procurement_workflow(project_id)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_procurement_workflow (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(100) NOT NULL,
        decision VARCHAR(100) NULL,
        notes TEXT NULL,
        actor_id BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_project_procurement_workflow_project (project_id)
      )
    `);
  }
}

async function ensureProcurementStagesTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stages (
        id BIGSERIAL PRIMARY KEY,
        label VARCHAR(200) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_stages_sort
       ON procurement_stages (voided, active, sort_order)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stages (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(200) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_stages_sort (voided, active, sort_order)
      )
    `);
  }
}

async function ensureProcurementAttachmentsTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_attachments (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        mime_type VARCHAR(120) NULL,
        file_size BIGINT NULL,
        title VARCHAR(255) NULL,
        notes TEXT NULL,
        uploaded_by BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_attachments_project_stage
       ON procurement_attachments(project_id, stage, voided, created_at DESC)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_attachments (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        mime_type VARCHAR(120) NULL,
        file_size BIGINT NULL,
        title VARCHAR(255) NULL,
        notes TEXT NULL,
        uploaded_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_attachments_project_stage (project_id, stage, voided, created_at)
      )
    `);
  }
}

async function ensureProcurementAttachmentsSubjectIdColumn() {
  try {
    if (isPostgres) {
      await pool.query(`ALTER TABLE procurement_attachments ADD COLUMN IF NOT EXISTS subject_id BIGINT NULL`);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_procurement_attachments_project_subject
         ON procurement_attachments(project_id, subject_id, voided, created_at DESC)`
      );
    } else {
      const cols = rowsOf(
        await pool.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'procurement_attachments' AND COLUMN_NAME = 'subject_id'`
        )
      );
      if (!cols.length) {
        await pool.query(`ALTER TABLE procurement_attachments ADD COLUMN subject_id BIGINT NULL`);
      }
      // Ensure index exists (ignore error if already present)
      try {
        await pool.query(
          `CREATE INDEX idx_procurement_attachments_project_subject
           ON procurement_attachments(project_id, subject_id, voided, created_at)`
        );
      } catch {
        // likely already exists
      }
    }
  } catch (e) {
    if (!isSchemaError(e)) throw e;
  }
}

async function ensureProcurementChecklistTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_checklist_items (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        label VARCHAR(255) NOT NULL,
        notes TEXT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMP WITHOUT TIME ZONE NULL,
        completed_by BIGINT NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_checklist_project_stage
       ON procurement_checklist_items(project_id, stage, voided, created_at DESC)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_checklist_items (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        label VARCHAR(255) NOT NULL,
        notes TEXT NULL,
        completed TINYINT(1) NOT NULL DEFAULT 0,
        completed_at DATETIME NULL,
        completed_by BIGINT NULL,
        created_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_checklist_project_stage (project_id, stage, voided, created_at)
      )
    `);
  }
}

async function ensureProcurementTemplatesTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stage_templates (
        id BIGSERIAL PRIMARY KEY,
        stage VARCHAR(200) NOT NULL,
        name VARCHAR(255) NOT NULL,
        subject_type VARCHAR(80) NOT NULL DEFAULT 'generic',
        fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_templates_stage
       ON procurement_stage_templates(stage, active, voided)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stage_templates (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        stage VARCHAR(200) NOT NULL,
        name VARCHAR(255) NOT NULL,
        subject_type VARCHAR(80) NOT NULL DEFAULT 'generic',
        fields JSON NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_templates_stage (stage, active, voided)
      )
    `);
  }
}

async function ensureProcurementSubjectsTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stage_subjects (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NOT NULL,
        subject_type VARCHAR(80) NOT NULL DEFAULT 'generic',
        subject_name VARCHAR(255) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        qualified BOOLEAN NULL,
        latest_score NUMERIC(12,2) NULL,
        latest_decision VARCHAR(80) NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_subjects_project_stage
       ON procurement_stage_subjects(project_id, stage, subject_type, voided, created_at DESC)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stage_subjects (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NOT NULL,
        subject_type VARCHAR(80) NOT NULL DEFAULT 'generic',
        subject_name VARCHAR(255) NOT NULL,
        metadata JSON NOT NULL,
        qualified TINYINT(1) NULL,
        latest_score DECIMAL(12,2) NULL,
        latest_decision VARCHAR(80) NULL,
        created_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_subjects_project_stage (project_id, stage, subject_type, voided, created_at)
      )
    `);
  }
}

async function ensureProcurementAssessmentsTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_subject_assessments (
        id BIGSERIAL PRIMARY KEY,
        subject_id BIGINT NOT NULL,
        template_id BIGINT NULL,
        responses JSONB NOT NULL DEFAULT '{}'::jsonb,
        score NUMERIC(12,2) NULL,
        max_score NUMERIC(12,2) NULL,
        qualified BOOLEAN NULL,
        decision VARCHAR(80) NULL,
        notes TEXT NULL,
        submitted_by BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_assessments_subject
       ON procurement_subject_assessments(subject_id, voided, updated_at DESC)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_subject_assessments (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        subject_id BIGINT NOT NULL,
        template_id BIGINT NULL,
        responses JSON NOT NULL,
        score DECIMAL(12,2) NULL,
        max_score DECIMAL(12,2) NULL,
        qualified TINYINT(1) NULL,
        decision VARCHAR(80) NULL,
        notes TEXT NULL,
        submitted_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_assessments_subject (subject_id, voided, updated_at)
      )
    `);
  }
}

async function ensureProcurementGateRulesTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stage_gate_rules (
        id BIGSERIAL PRIMARY KEY,
        stage VARCHAR(200) NOT NULL UNIQUE,
        min_qualified_subjects INT NOT NULL DEFAULT 0,
        min_score NUMERIC(12,2) NULL,
        subject_type VARCHAR(80) NOT NULL DEFAULT 'bidder',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stage_gate_rules (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        stage VARCHAR(200) NOT NULL UNIQUE,
        min_qualified_subjects INT NOT NULL DEFAULT 0,
        min_score DECIMAL(12,2) NULL,
        subject_type VARCHAR(80) NOT NULL DEFAULT 'bidder',
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0
      )
    `);
  }
}

/** Adds min_score on older DBs created before weighted gate thresholds. */
async function ensureProcurementGateRulesMinScoreColumn() {
  try {
    if (isPostgres) {
      await pool.query(
        `ALTER TABLE procurement_stage_gate_rules ADD COLUMN IF NOT EXISTS min_score NUMERIC(12,2) NULL`
      );
    } else {
      const cols = rowsOf(
        await pool.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'procurement_stage_gate_rules' AND COLUMN_NAME = 'min_score'`
        )
      );
      if (!cols.length) {
        await pool.query(`ALTER TABLE procurement_stage_gate_rules ADD COLUMN min_score DECIMAL(12,2) NULL`);
      }
    }
  } catch (e) {
    if (!isSchemaError(e)) throw e;
  }
}

/** Inserts Bidder Registry between Tender Published and Bidder Pre-Qualification (sort_order shift). */
async function ensureBidderRegistryStageInserted() {
  try {
    const label = STAGE_BIDDER_REGISTRY;
    const existing = rowsOf(
      await pool.query(
        isPostgres
          ? `SELECT id FROM procurement_stages
             WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) LIMIT 1`
          : `SELECT id FROM procurement_stages
             WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(TRIM(?)) LIMIT 1`,
        [label]
      )
    );
    if (existing.length) return;

    const anchorRow = rowsOf(
      await pool.query(
        isPostgres
          ? `SELECT sort_order FROM procurement_stages
             WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) LIMIT 1`
          : `SELECT sort_order AS sort_order FROM procurement_stages
             WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(TRIM(?)) LIMIT 1`,
        ['Tender Published']
      )
    )[0];
    const anchorOrd = Number(anchorRow?.sort_order);
    if (!Number.isFinite(anchorOrd)) return;

    const newOrd = anchorOrd + 1;
    if (isPostgres) {
      await pool.query(
        `UPDATE procurement_stages SET sort_order = sort_order + 1, updated_at = NOW()
         WHERE COALESCE(voided, false) = false AND sort_order >= $1`,
        [newOrd]
      );
      await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         VALUES ($1::varchar, $2::int, TRUE, FALSE, NOW(), NOW())`,
        [label, newOrd]
      );
    } else {
      await pool.query(
        `UPDATE procurement_stages SET sort_order = sort_order + 1, updated_at = NOW()
         WHERE COALESCE(voided, 0) = 0 AND sort_order >= ?`,
        [newOrd]
      );
      await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         VALUES (?, ?, 1, 0, NOW(), NOW())`,
        [label, newOrd]
      );
    }
  } catch (e) {
    if (!isSchemaError(e)) console.warn('ensureBidderRegistryStageInserted:', e.message);
  }
}

async function normalizeDefaultProcurementStageOrder() {
  const desired = [
    { label: 'Needs Identification', ord: 0 },
    { label: 'Requisition Approved', ord: 1 },
    { label: 'Tender Published', ord: 2 },
    { label: STAGE_BIDDER_REGISTRY, ord: 3 },
    { label: STAGE_PRE_QUALIFICATION, ord: 4 },
    { label: STAGE_BID_EVALUATION, ord: 5 },
    { label: STAGE_AWARD_DECISION, ord: 6 },
    { label: STAGE_CONTRACT_SIGNING, ord: 7 },
    { label: 'Purchase Order Issued', ord: 8 },
    { label: STAGE_PROCUREMENT_TERMINATED, ord: 100 },
  ];
  try {
    await ensureProcurementStagesTable();
    for (const row of desired) {
      if (isPostgres) {
        await pool.query(
          `UPDATE procurement_stages
           SET sort_order = $1, updated_at = NOW()
           WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($2))`,
          [row.ord, row.label]
        );
      } else {
        await pool.query(
          `UPDATE procurement_stages
           SET sort_order = ?, updated_at = NOW()
           WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(TRIM(?))`,
          [row.ord, row.label]
        );
      }
    }
  } catch (e) {
    if (!isSchemaError(e)) console.warn('normalizeDefaultProcurementStageOrder:', e.message);
  }
}

/**
 * Inserts Bidder Pre-Qualification between Tender Published and Bid Evaluation (sort_order shift).
 * Safe if stage already exists or Tender Published is missing.
 */
async function ensureBidderPreQualStageInserted() {
  try {
    const label = STAGE_PRE_QUALIFICATION;
    const existing = rowsOf(
      await pool.query(
        isPostgres
          ? `SELECT id FROM procurement_stages
             WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) LIMIT 1`
          : `SELECT id FROM procurement_stages
             WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(TRIM(?)) LIMIT 1`,
        [label]
      )
    );
    if (existing.length) return;

    const anchorLabel = (await (async () => {
      const hasRegistry = rowsOf(
        await pool.query(
          isPostgres
            ? `SELECT 1 FROM procurement_stages WHERE COALESCE(voided,false)=false AND LOWER(TRIM(label))=LOWER(TRIM($1)) LIMIT 1`
            : `SELECT 1 FROM procurement_stages WHERE COALESCE(voided,0)=0 AND LOWER(TRIM(label))=LOWER(TRIM(?)) LIMIT 1`,
          [STAGE_BIDDER_REGISTRY]
        )
      ).length > 0;
      return hasRegistry ? STAGE_BIDDER_REGISTRY : 'Tender Published';
    })());

    const tenderRow = rowsOf(
      await pool.query(
        isPostgres
          ? `SELECT sort_order FROM procurement_stages
             WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) LIMIT 1`
          : `SELECT sort_order AS sort_order FROM procurement_stages
             WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(TRIM(?)) LIMIT 1`,
        [anchorLabel]
      )
    )[0];
    const tenderOrd = Number(tenderRow?.sort_order);
    if (!Number.isFinite(tenderOrd)) return;

    const newOrd = tenderOrd + 1;
    if (isPostgres) {
      await pool.query(
        `UPDATE procurement_stages SET sort_order = sort_order + 1, updated_at = NOW()
         WHERE COALESCE(voided, false) = false AND sort_order >= $1`,
        [newOrd]
      );
      await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         VALUES ($1::varchar, $2::int, TRUE, FALSE, NOW(), NOW())`,
        [label, newOrd]
      );
    } else {
      await pool.query(
        `UPDATE procurement_stages SET sort_order = sort_order + 1, updated_at = NOW()
         WHERE COALESCE(voided, 0) = 0 AND sort_order >= ?`,
        [newOrd]
      );
      await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         VALUES (?, ?, 1, 0, NOW(), NOW())`,
        [label, newOrd]
      );
    }
  } catch (e) {
    if (!isSchemaError(e)) console.warn('ensureBidderPreQualStageInserted:', e.message);
  }
}

function getDefaultBidEvaluationFields() {
  return [
    { key: 'companyProfile', label: 'Company profile submitted', type: 'checkbox', required: true, weight: 10 },
    { key: 'taxCompliance', label: 'Valid tax compliance certificate', type: 'checkbox', required: true, weight: 15 },
    { key: 'businessPermit', label: 'Valid business permit', type: 'checkbox', required: true, weight: 10 },
    { key: 'similarWorks', label: 'Similar works experience', type: 'checkbox', required: true, weight: 15 },
    { key: 'technicalCapacity', label: 'Technical capacity adequate', type: 'checkbox', required: true, weight: 15 },
    { key: 'financialCapacity', label: 'Financial capacity adequate', type: 'checkbox', required: true, weight: 15 },
    { key: 'bidPriceScore', label: 'Bid price score (0-20)', type: 'number', min: 0, max: 20, required: false, weight: 20 },
    { key: 'recommendedForAward', label: 'Recommended for award (proceeds to Award Decision)', type: 'checkbox', required: true, weight: 0 },
    { key: 'reviewNotes', label: 'Reviewer notes', type: 'textarea', required: false, weight: 0 },
  ];
}

/** Subject type `bidder` matches existing Procurement UI subjects across all stages. */
function getDefaultNeedsIdentificationFields() {
  return [
    {
      key: 'needProblemEvidence',
      label: 'Need / problem statement documented (baseline, gap, or service demand)',
      type: 'checkbox',
      required: true,
      weight: 18,
    },
    {
      key: 'alignmentStrategicPlans',
      label: 'Alignment with ADP / CIDP, sector programme & county development priorities',
      type: 'checkbox',
      required: true,
      weight: 18,
    },
    {
      key: 'scopeObjectivesOutputs',
      label: 'Scope, objectives & expected outputs/deliverables defined (incl. exclusions)',
      type: 'checkbox',
      required: true,
      weight: 18,
    },
    {
      key: 'beneficiariesAccountability',
      label: 'Beneficiaries / user unit & accountable department / ward identified',
      type: 'checkbox',
      required: true,
      weight: 14,
    },
    {
      key: 'siteLocationReadiness',
      label: 'Location / site or logistics constraints known (land, access, utilities)',
      type: 'checkbox',
      required: true,
      weight: 12,
    },
    {
      key: 'indicativeCostFunding',
      label: 'Indicative cost class, budget head & funding source contour (vote / donor / partner)',
      type: 'checkbox',
      required: true,
      weight: 16,
    },
    {
      key: 'timelineMilestones',
      label: 'Implementation timeline & critical milestones / dependencies outlined',
      type: 'checkbox',
      required: true,
      weight: 12,
    },
    {
      key: 'procurementMethodPPDA',
      label: 'Likely PPDA procurement method & threshold class pre-identified',
      type: 'checkbox',
      required: true,
      weight: 14,
    },
    {
      key: 'stakeholderEngagement',
      label: 'Relevant stakeholders engaged; technical owner / sponsor recorded',
      type: 'checkbox',
      required: true,
      weight: 12,
    },
    {
      key: 'risksAlternatives',
      label: 'Material risks, mitigations & alternatives (in-house, lease, PPP) considered',
      type: 'checkbox',
      required: false,
      weight: 10,
    },
    {
      key: 'esgGenderSafetyScreen',
      label: 'Preliminary environmental, social, gender & safety impacts screened',
      type: 'checkbox',
      required: false,
      weight: 10,
    },
    { key: 'notes', label: 'Needs identification notes & references', type: 'textarea', required: false, weight: 0 },
  ];
}

function getDefaultRequisitionApprovedFields() {
  return [
    { key: 'formalRequisition', label: 'Formal requisition / AIE reference captured', type: 'checkbox', required: true, weight: 22 },
    { key: 'budgetCommitted', label: 'Budget committed / votebook availability confirmed', type: 'checkbox', required: true, weight: 26 },
    { key: 'delegatedApproval', label: 'Approval within delegated procurement authority', type: 'checkbox', required: true, weight: 18 },
    { key: 'specificationsAttached', label: 'Technical specifications / TOR attached', type: 'checkbox', required: true, weight: 18 },
    { key: 'ppdaThreshold', label: 'Estimated value vs PPDA threshold verified', type: 'checkbox', required: true, weight: 16 },
    { key: 'notes', label: 'Approval remarks', type: 'textarea', required: false, weight: 0 },
  ];
}

function getDefaultTenderPublishedFields() {
  return [
    { key: 'invitationApproved', label: 'Invitation for tenders / RFP approved for publication', type: 'checkbox', required: true, weight: 22 },
    { key: 'openingClosingDates', label: 'Opening & closing dates valid (calendar days)', type: 'checkbox', required: true, weight: 22 },
    { key: 'advertisementMedium', label: 'Advertisement placed (portal / press) per PPDA rules', type: 'checkbox', required: true, weight: 20 },
    { key: 'bidSecurityCorrect', label: 'Bid security / tender fee requirements stated correctly', type: 'checkbox', required: true, weight: 18 },
    { key: 'clarificationsProcess', label: 'Clarification / site visit process communicated', type: 'checkbox', required: false, weight: 18 },
    { key: 'notes', label: 'Publication notes', type: 'textarea', required: false, weight: 0 },
  ];
}

/** Master list of bidders who picked/received the tender for a project. */
function getDefaultBidderRegistryFields() {
  return [
    { key: 'contactName', label: 'Contact person name', type: 'text', required: false, weight: 0 },
    { key: 'contactPhone', label: 'Contact phone number', type: 'text', required: false, weight: 0 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', required: false, weight: 0 },
    { key: 'companyName', label: 'Company / bidder name', type: 'text', required: true, weight: 0 },
    { key: 'registrationNo', label: 'Company registration number', type: 'text', required: false, weight: 0 },
    { key: 'kraPin', label: 'KRA PIN / Tax ID', type: 'text', required: false, weight: 0 },
    { key: 'agpoCategory', label: 'AGPO category (if applicable)', type: 'text', required: false, weight: 0 },
    { key: 'notes', label: 'Bidder registry notes / documents reference', type: 'textarea', required: false, weight: 0 },
  ];
}

/** Minimum eligibility before full bid evaluation (responsive / mandatory criteria). */
function getDefaultPreQualificationFields() {
  return [
    { key: 'registrationValid', label: 'Bidder registration / company profile complete', type: 'checkbox', required: true, weight: 20 },
    { key: 'mandatoryCerts', label: 'Mandatory certificates attached (tax, AGPO where applicable)', type: 'checkbox', required: true, weight: 25 },
    { key: 'experienceThreshold', label: 'Minimum similar experience threshold met', type: 'checkbox', required: true, weight: 25 },
    { key: 'financialMinimum', label: 'Minimum financial capacity / turnover threshold met', type: 'checkbox', required: true, weight: 20 },
    { key: 'nonResponsiveExcluded', label: 'Bid is responsive (non-responsive bids excluded)', type: 'checkbox', required: true, weight: 10 },
    { key: 'notes', label: 'Pre-qualification notes', type: 'textarea', required: false, weight: 0 },
  ];
}

function getDefaultAwardDecisionFields() {
  return [
    { key: 'evaluationReportFinal', label: 'Technical & financial evaluation report finalized', type: 'checkbox', required: true, weight: 22 },
    { key: 'standstillObserved', label: 'Standstill / aggrieved period observed where applicable', type: 'checkbox', required: true, weight: 22 },
    { key: 'awardWithinBudget', label: 'Recommended award within approved budget envelope', type: 'checkbox', required: true, weight: 20 },
    { key: 'conflictInterestChecked', label: 'Conflict of interest / ethics declaration reviewed', type: 'checkbox', required: true, weight: 16 },
    { key: 'awardLetterReady', label: 'Notification of award / regret letters prepared', type: 'checkbox', required: true, weight: 20 },
    { key: 'notes', label: 'Award decision notes', type: 'textarea', required: false, weight: 0 },
  ];
}

function getDefaultContractSigningFields() {
  return [
    { key: 'draftContractReviewed', label: 'Contract draft legally reviewed', type: 'checkbox', required: true, weight: 18 },
    { key: 'signatoriesAuthorized', label: 'Signatories hold valid delegations / resolutions', type: 'checkbox', required: true, weight: 22 },
    { key: 'performanceSecurity', label: 'Performance bond / security clause agreed', type: 'checkbox', required: true, weight: 18 },
    { key: 'insuranceRequirements', label: 'Insurance / liability requirements captured', type: 'checkbox', required: true, weight: 14 },
    { key: 'commencementDate', label: 'Commencement / delivery milestones agreed', type: 'checkbox', required: true, weight: 14 },
    {
      key: 'contractProjectStartDate',
      label: 'Project / contract start date (optional)',
      type: 'date',
      required: false,
      weight: 0,
    },
    {
      key: 'contractDurationValue',
      label: 'Duration (optional — with unit below, end date is calculated)',
      type: 'number',
      required: false,
      weight: 0,
      min: 0,
    },
    {
      key: 'contractDurationUnit',
      label: 'Duration unit',
      type: 'select',
      required: false,
      weight: 0,
      options: ['', 'days', 'months'],
    },
    {
      key: 'contractProjectEndDate',
      label: 'Project / contract end date (optional — auto-filled when start + duration are set)',
      type: 'date',
      required: false,
      weight: 0,
    },
    { key: 'disputeResolution', label: 'Dispute resolution / governing law clause agreed', type: 'checkbox', required: false, weight: 14 },
    { key: 'notes', label: 'Contract remarks', type: 'textarea', required: false, weight: 0 },
  ];
}

function getDefaultPurchaseOrderIssuedFields() {
  return [
    { key: 'poRegistered', label: 'LPO / PO registered (IFMIS / procurement register)', type: 'checkbox', required: true, weight: 22 },
    {
      key: 'poReferenceNumber',
      label: 'LPO / PO reference number',
      type: 'text',
      required: false,
      weight: 0,
    },
    {
      key: 'poIssueDate',
      label: 'PO issue date',
      type: 'date',
      required: false,
      weight: 0,
    },
    {
      key: 'kenyaFyJune30LapseAck',
      label:
        'Acknowledged: Kenya financial year — unspent / unpaid PO commitments normally lapse after 30 June; further spend requires a new PO (fresh commitment), not an extension of the old PO.',
      type: 'checkbox',
      required: true,
      weight: 0,
    },
    {
      key: 'supersedesLapsedPo',
      label: 'This PO supersedes a prior PO that lapsed or was cancelled (e.g. after 30 June FY deadline)',
      type: 'checkbox',
      required: false,
      weight: 0,
    },
    {
      key: 'priorPoReference',
      label: 'Prior lapsed / cancelled PO reference (when superseding)',
      type: 'text',
      required: false,
      weight: 0,
    },
    { key: 'deliveryTerms', label: 'Delivery / completion schedule aligned with contract', type: 'checkbox', required: true, weight: 20 },
    { key: 'retentionAdvance', label: 'Retention / advance payment conditions reflected', type: 'checkbox', required: true, weight: 18 },
    { key: 'inspectionAcceptance', label: 'Inspection & acceptance criteria referenced', type: 'checkbox', required: true, weight: 18 },
    { key: 'reportingRequirements', label: 'Reporting / milestone certification requirements clear', type: 'checkbox', required: false, weight: 22 },
    {
      key: 'notes',
      label: 'PO remarks (re-issue reason, IFMIS cancellation, linkage to new tender if applicable)',
      type: 'textarea',
      required: false,
      weight: 0,
    },
  ];
}

function getDefaultProcurementTerminatedFields() {
  return [
    {
      key: 'closureReasonCategory',
      label: 'Closure category',
      type: 'select',
      required: true,
      weight: 0,
      options: ['', 'No qualified bidders', 'Budget withdrawn', 'Policy / legal stop', 'Other'],
    },
    {
      key: 'closureReason',
      label: 'Details (reference PPDA / county approvals where applicable)',
      type: 'textarea',
      required: true,
      weight: 0,
    },
    { key: 'closureEffectiveDate', label: 'Effective date', type: 'date', required: false, weight: 0 },
    { key: 'authorityReference', label: 'Approval / minute reference', type: 'text', required: false, weight: 0 },
  ];
}

function getProcurementStageTemplateSeeds() {
  return [
    {
      stage: 'Needs Identification',
      name: NEEDS_IDENTIFICATION_DEFAULT_TEMPLATE_NAME,
      subjectType: 'generic',
      fields: getDefaultNeedsIdentificationFields(),
    },
    { stage: 'Requisition Approved', name: 'Requisition & budget gate', subjectType: 'generic', fields: getDefaultRequisitionApprovedFields() },
    { stage: 'Tender Published', name: 'Tender launch & notice compliance', subjectType: 'generic', fields: getDefaultTenderPublishedFields() },
    {
      stage: STAGE_BIDDER_REGISTRY,
      name: 'Bidder registry (master list)',
      subjectType: 'bidder',
      fields: getDefaultBidderRegistryFields(),
    },
    {
      stage: STAGE_PRE_QUALIFICATION,
      name: 'Minimum eligibility (pre-bid screening)',
      subjectType: 'bidder',
      fields: getDefaultPreQualificationFields(),
    },
    { stage: STAGE_BID_EVALUATION, name: 'Bidder Suitability Checklist', subjectType: 'bidder', fields: getDefaultBidEvaluationFields() },
    { stage: STAGE_AWARD_DECISION, name: 'Award & compliance checklist', subjectType: 'bidder', fields: getDefaultAwardDecisionFields() },
    { stage: STAGE_CONTRACT_SIGNING, name: 'Contract execution readiness', subjectType: 'bidder', fields: getDefaultContractSigningFields() },
    { stage: 'Purchase Order Issued', name: 'LPO / commitment register', subjectType: 'bidder', fields: getDefaultPurchaseOrderIssuedFields() },
    {
      stage: STAGE_PROCUREMENT_TERMINATED,
      name: 'Procurement closure (no award)',
      subjectType: 'generic',
      fields: getDefaultProcurementTerminatedFields(),
    },
  ];
}

async function insertProcurementTemplateIfNotExists(stage, name, subjectType, fields) {
  const fieldsJson = JSON.stringify(fields);
  if (isPostgres) {
    await pool.query(
      `INSERT INTO procurement_stage_templates (stage, name, subject_type, fields, active, voided, created_at, updated_at)
       SELECT $1::varchar, $2::varchar, $3::varchar, $4::jsonb, true, false, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM procurement_stage_templates
         WHERE COALESCE(voided, false) = false
           AND LOWER(TRIM(stage)) = LOWER(TRIM($1::text))
           AND LOWER(TRIM(name)) = LOWER(TRIM($2::text))
       )`,
      [stage, name, subjectType, fieldsJson]
    );
  } else {
    const exists = await pool.query(
      `SELECT id FROM procurement_stage_templates
       WHERE COALESCE(voided, 0) = 0
         AND LOWER(TRIM(stage)) = LOWER(?)
         AND LOWER(TRIM(name)) = LOWER(?)
       LIMIT 1`,
      [stage, name]
    );
    if (!rowsOf(exists).length) {
      await pool.query(
        `INSERT INTO procurement_stage_templates
         (stage, name, subject_type, fields, active, voided, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 0, NOW(), NOW())`,
        [stage, name, subjectType, fieldsJson]
      );
    }
  }
}

async function seedProcurementStageTemplatesIfNeeded() {
  for (const seed of getProcurementStageTemplateSeeds()) {
    await insertProcurementTemplateIfNotExists(seed.stage, seed.name, seed.subjectType, seed.fields);
  }
}

/** Push latest Needs Identification checklist to every active template for that stage (name-agnostic). */
async function refreshNeedsIdentificationDefaultTemplate() {
  const stage = 'Needs Identification';
  const fieldsJson = JSON.stringify(getDefaultNeedsIdentificationFields());
  if (isPostgres) {
    await pool.query(
      `UPDATE procurement_stage_templates
       SET fields = $1::jsonb, updated_at = NOW()
       WHERE COALESCE(voided, false) = false
         AND LOWER(TRIM(stage)) = LOWER(TRIM($2::text))`,
      [fieldsJson, stage]
    );
  } else {
    await pool.query(
      `UPDATE procurement_stage_templates
       SET fields = ?, updated_at = NOW()
       WHERE COALESCE(voided, 0) = 0
         AND LOWER(TRIM(stage)) = LOWER(TRIM(?))`,
      [fieldsJson, stage]
    );
  }
}

async function seedBidEvaluationGateRuleIfNeeded() {
  const stage = STAGE_BID_EVALUATION;
  const minQualified = 1;
  const subjectType = 'bidder';
  if (isPostgres) {
    await pool.query(
      `INSERT INTO procurement_stage_gate_rules
       (stage, min_qualified_subjects, min_score, subject_type, active, voided, created_at, updated_at)
       SELECT $1::varchar, $2::int, NULL::numeric, $3::varchar, true, false, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM procurement_stage_gate_rules
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM($1::text))
           AND COALESCE(voided, false) = false
       )`,
      [stage, minQualified, subjectType]
    );
  } else {
    const exists = await pool.query(
      `SELECT id FROM procurement_stage_gate_rules
       WHERE LOWER(TRIM(stage)) = LOWER(TRIM(?)) AND COALESCE(voided,0)=0 LIMIT 1`,
      [stage]
    );
    if (!rowsOf(exists).length) {
      await pool.query(
        `INSERT INTO procurement_stage_gate_rules
         (stage, min_qualified_subjects, min_score, subject_type, active, voided, created_at, updated_at)
         VALUES (?, ?, NULL, ?, 1, 0, NOW(), NOW())`,
        [stage, minQualified, subjectType]
      );
    }
  }
}

/** Minimum eligible bidders before leaving pre-qualification (set min_score on the rule row for weighted pass mark). */
async function seedPreQualificationGateRuleIfNeeded() {
  const stage = STAGE_PRE_QUALIFICATION;
  const minQualified = 1;
  const subjectType = 'bidder';
  if (isPostgres) {
    await pool.query(
      `INSERT INTO procurement_stage_gate_rules
       (stage, min_qualified_subjects, min_score, subject_type, active, voided, created_at, updated_at)
       SELECT $1::varchar, $2::int, NULL::numeric, $3::varchar, true, false, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM procurement_stage_gate_rules
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM($1::text))
           AND COALESCE(voided, false) = false
       )`,
      [stage, minQualified, subjectType]
    );
  } else {
    const exists = await pool.query(
      `SELECT id FROM procurement_stage_gate_rules
       WHERE LOWER(TRIM(stage)) = LOWER(TRIM(?)) AND COALESCE(voided,0)=0 LIMIT 1`,
      [stage]
    );
    if (!rowsOf(exists).length) {
      await pool.query(
        `INSERT INTO procurement_stage_gate_rules
         (stage, min_qualified_subjects, min_score, subject_type, active, voided, created_at, updated_at)
         VALUES (?, ?, NULL, ?, 1, 0, NOW(), NOW())`,
        [stage, minQualified, subjectType]
      );
    }
  }
}

async function getStageSortOrder(stage) {
  const s = String(stage || '').trim();
  if (!s) return null;
  const sql = isPostgres
    ? `SELECT sort_order FROM procurement_stages WHERE COALESCE(voided,false)=false AND LOWER(TRIM(label))=LOWER(TRIM($1)) LIMIT 1`
    : `SELECT sort_order FROM procurement_stages WHERE COALESCE(voided,0)=0 AND LOWER(TRIM(label))=LOWER(TRIM(?)) LIMIT 1`;
  const r = await pool.query(sql, [s]);
  const row = rowsOf(r)[0];
  return row?.sort_order != null ? Number(row.sort_order) : null;
}

async function latestWorkflowStage(projectId) {
  const sql = isPostgres
    ? `SELECT stage FROM project_procurement_workflow
       WHERE project_id = $1 AND COALESCE(voided,false)=false
       ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`
    : `SELECT stage FROM project_procurement_workflow
       WHERE project_id = ? AND COALESCE(voided,0)=0
       ORDER BY updated_at DESC, id DESC LIMIT 1`;
  const r = await pool.query(sql, [projectId]);
  return rowsOf(r)[0]?.stage || null;
}

async function validateStageGateForTransition(projectId, fromStage, toStage) {
  if (stageNorm(toStage) === stageNorm(STAGE_PROCUREMENT_TERMINATED)) {
    return { ok: true };
  }
  const fromOrder = await getStageSortOrder(fromStage);
  const toOrder = await getStageSortOrder(toStage);
  if (!Number.isFinite(fromOrder) || !Number.isFinite(toOrder) || toOrder <= fromOrder) {
    return { ok: true };
  }
  const rules = isPostgres
    ? rowsOf(await pool.query(
        `SELECT r.stage, r.min_qualified_subjects AS "minQualified", r.min_score AS "minScore",
                r.subject_type AS "subjectType", s.sort_order
         FROM procurement_stage_gate_rules r
         JOIN procurement_stages s ON LOWER(TRIM(s.label)) = LOWER(TRIM(r.stage))
         WHERE COALESCE(r.voided,false)=false AND COALESCE(r.active,true)=true
           AND s.sort_order >= $1 AND s.sort_order < $2
         ORDER BY s.sort_order ASC`,
        [fromOrder, toOrder]
      ))
    : rowsOf(await pool.query(
        `SELECT r.stage, r.min_qualified_subjects AS minQualified, r.min_score AS minScore,
                r.subject_type AS subjectType, s.sort_order
         FROM procurement_stage_gate_rules r
         JOIN procurement_stages s ON LOWER(TRIM(s.label)) = LOWER(TRIM(r.stage))
         WHERE COALESCE(r.voided,0)=0 AND COALESCE(r.active,1)=1
           AND s.sort_order >= ? AND s.sort_order < ?
         ORDER BY s.sort_order ASC`,
        [fromOrder, toOrder]
      ));
  for (const rule of rules) {
    const minQualified = Number(rule.minQualified || 0);
    if (minQualified <= 0) continue;
    const subjectType = String(rule.subjectType || 'bidder').trim();
    const minScore =
      rule.minScore != null && Number.isFinite(Number(rule.minScore)) ? Number(rule.minScore) : null;
    const countSql = isPostgres
      ? minScore == null
        ? `SELECT COUNT(*)::int AS c
           FROM procurement_stage_subjects
           WHERE project_id = $1
             AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
             AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
             AND COALESCE(voided,false)=false
             AND COALESCE(qualified,false)=true`
        : `SELECT COUNT(*)::int AS c
           FROM procurement_stage_subjects
           WHERE project_id = $1
             AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
             AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
             AND COALESCE(voided,false)=false
             AND COALESCE(qualified,false)=true
             AND COALESCE(latest_score, 0) >= $4`
      : minScore == null
        ? `SELECT COUNT(*) AS c
           FROM procurement_stage_subjects
           WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
             AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
             AND COALESCE(voided,0)=0 AND COALESCE(qualified,0)=1`
        : `SELECT COUNT(*) AS c
           FROM procurement_stage_subjects
           WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
             AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
             AND COALESCE(voided,0)=0 AND COALESCE(qualified,0)=1
             AND COALESCE(latest_score, 0) >= ?`;
    const countParams =
      minScore == null ? [projectId, rule.stage, subjectType] : [projectId, rule.stage, subjectType, minScore];
    const cr = await pool.query(countSql, countParams);
    const c = Number(rowsOf(cr)[0]?.c || 0);
    if (c < minQualified) {
      const scoreHint = minScore != null ? ` with score ≥ ${minScore}` : '';
      return {
        ok: false,
        message: `Stage gate failed: ${rule.stage} requires at least ${minQualified} qualified ${subjectType}(s)${scoreHint}. Current: ${c}. Options: record closure under assessment (e.g. Terminated at pre-qual/bid eval), add Save Workflow Step → "${STAGE_PROCUREMENT_TERMINATED}", or move stage back to Tender Published to readvertise (backward moves skip gates).`,
      };
    }
  }
  return { ok: true };
}

function coerceSubjectMetadata(meta) {
  if (meta == null) return {};
  if (typeof meta === 'object' && !Array.isArray(meta)) return meta;
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
}

function mergeUpstreamMetadata(existingMeta, upstreamStage, upstreamSubjectId) {
  const base = coerceSubjectMetadata(existingMeta);
  return {
    ...base,
    upstreamStage,
    upstreamSubjectId,
  };
}

async function countSubjectsForProjectStage(projectId, stageLabel) {
  const sql = isPostgres
    ? `SELECT COUNT(*)::int AS c FROM procurement_stage_subjects
       WHERE project_id = $1 AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
         AND COALESCE(voided, false) = false`
    : `SELECT COUNT(*) AS c FROM procurement_stage_subjects
       WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
         AND COALESCE(voided, 0) = 0`;
  const r = await pool.query(sql, [projectId, stageLabel]);
  return Number(rowsOf(r)[0]?.c || 0);
}

async function subjectRowExists(projectId, stageLabel, subjectName, subjectType = 'bidder') {
  const sql = isPostgres
    ? `SELECT id FROM procurement_stage_subjects
       WHERE project_id = $1 AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
         AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
         AND LOWER(TRIM(subject_name)) = LOWER(TRIM($4))
         AND COALESCE(voided, false) = false LIMIT 1`
    : `SELECT id FROM procurement_stage_subjects
       WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
         AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
         AND LOWER(TRIM(subject_name)) = LOWER(TRIM(?))
         AND COALESCE(voided, 0) = 0 LIMIT 1`;
  const r = await pool.query(sql, [projectId, stageLabel, subjectType, subjectName]);
  return rowsOf(r).length > 0;
}

/**
 * Ensures downstream bidder rows exist so assessments attach to the correct stage:
 * Pre-Qual (qualified) → Bid Evaluation; Bid Evaluation (qualified) → Award; Award (Awarded) → Contract.
 */
async function syncBidderSubjectsForList(projectId, targetStage) {
  const st = stageNorm(targetStage);
  const subjType = 'bidder';

  const registryCount = await countSubjectsForProjectStage(projectId, STAGE_BIDDER_REGISTRY);
  const preQualCount = await countSubjectsForProjectStage(projectId, STAGE_PRE_QUALIFICATION);

  // Pre-Qualification starts from Bidder Registry (master list).
  if (st === stageNorm(STAGE_PRE_QUALIFICATION) && registryCount > 0) {
    const q = isPostgres
      ? `SELECT id, subject_name AS "subjectName", metadata
         FROM procurement_stage_subjects
         WHERE project_id = $1
           AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
           AND COALESCE(voided, false) = false`
      : `SELECT id, subject_name AS subjectName, metadata
         FROM procurement_stage_subjects
         WHERE project_id = ?
           AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided, 0) = 0`;
    const src = rowsOf(await pool.query(q, [projectId, STAGE_BIDDER_REGISTRY, subjType]));
    for (const row of src) {
      const name = String(row.subjectName || '').trim();
      if (!name) continue;
      if (await subjectRowExists(projectId, STAGE_PRE_QUALIFICATION, name, subjType)) continue;
      const meta = mergeUpstreamMetadata(row.metadata, STAGE_BIDDER_REGISTRY, row.id);
      if (isPostgres) {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),NOW(),false)`,
          [projectId, STAGE_PRE_QUALIFICATION, subjType, name, JSON.stringify(meta)]
        );
      } else {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
          [projectId, STAGE_PRE_QUALIFICATION, subjType, name, JSON.stringify(meta)]
        );
      }
    }
    return;
  }

  if (st === stageNorm(STAGE_BID_EVALUATION) && preQualCount > 0) {
    const q = isPostgres
      ? `SELECT s.id, s.subject_name AS "subjectName", s.metadata
         FROM procurement_stage_subjects s
         LEFT JOIN LATERAL (
           SELECT responses
           FROM procurement_subject_assessments a
           WHERE a.subject_id = s.id AND COALESCE(a.voided, false) = false
           ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
           LIMIT 1
         ) a ON true
         WHERE s.project_id = $1
           AND LOWER(TRIM(s.stage)) = LOWER(TRIM($2))
           AND LOWER(TRIM(s.subject_type)) = LOWER(TRIM($3))
           AND COALESCE(s.voided, false) = false
           AND COALESCE(s.qualified, false) = true
           AND COALESCE(NULLIF(TRIM(a.responses->>'nonResponsiveExcluded'), ''), 'false')::boolean = true`
      : `SELECT s.id, s.subject_name AS subjectName, s.metadata
         FROM procurement_stage_subjects s
         WHERE s.project_id = ?
           AND LOWER(TRIM(s.stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(s.subject_type)) = LOWER(TRIM(?))
           AND COALESCE(s.voided, 0) = 0
           AND COALESCE(s.qualified, 0) = 1`;
    const src = rowsOf(await pool.query(q, [projectId, STAGE_PRE_QUALIFICATION, subjType]));
    for (const row of src) {
      const name = String(row.subjectName || '').trim();
      if (!name) continue;
      if (await subjectRowExists(projectId, STAGE_BID_EVALUATION, name, subjType)) continue;
      const meta = mergeUpstreamMetadata(row.metadata, STAGE_PRE_QUALIFICATION, row.id);
      if (isPostgres) {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),NOW(),false)`,
          [projectId, STAGE_BID_EVALUATION, subjType, name, JSON.stringify(meta)]
        );
      } else {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
          [projectId, STAGE_BID_EVALUATION, subjType, name, JSON.stringify(meta)]
        );
      }
    }
    return;
  }

  if (st === stageNorm(STAGE_AWARD_DECISION)) {
    const q = isPostgres
      ? `SELECT id, subject_name AS "subjectName", metadata
         FROM procurement_stage_subjects
         WHERE project_id = $1
           AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
           AND COALESCE(voided, false) = false
           AND COALESCE(qualified, false) = true`
      : `SELECT id, subject_name AS subjectName, metadata
         FROM procurement_stage_subjects
         WHERE project_id = ?
           AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided, 0) = 0
           AND COALESCE(qualified, 0) = 1`;
    const src = rowsOf(await pool.query(q, [projectId, STAGE_BID_EVALUATION, subjType]));
    for (const row of src) {
      const name = String(row.subjectName || '').trim();
      if (!name) continue;
      if (await subjectRowExists(projectId, STAGE_AWARD_DECISION, name, subjType)) continue;
      const meta = mergeUpstreamMetadata(row.metadata, STAGE_BID_EVALUATION, row.id);
      if (isPostgres) {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),NOW(),false)`,
          [projectId, STAGE_AWARD_DECISION, subjType, name, JSON.stringify(meta)]
        );
      } else {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
          [projectId, STAGE_AWARD_DECISION, subjType, name, JSON.stringify(meta)]
        );
      }
    }
    return;
  }

  if (st === stageNorm(STAGE_CONTRACT_SIGNING)) {
    const qAward = isPostgres
      ? `SELECT id, subject_name AS "subjectName", metadata, latest_decision AS "latestDecision"
         FROM procurement_stage_subjects
         WHERE project_id = $1
           AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
           AND COALESCE(voided, false) = false`
      : `SELECT id, subject_name AS subjectName, metadata, latest_decision AS latestDecision
         FROM procurement_stage_subjects
         WHERE project_id = ?
           AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided, 0) = 0`;
    const awardRows = rowsOf(await pool.query(qAward, [projectId, STAGE_AWARD_DECISION, subjType]));
    const src = awardRows.filter((row) =>
      decisionIsAwarded(row.latestDecision != null ? row.latestDecision : row.latest_decision)
    );

    for (const row of src) {
      const name = String(row.subjectName || '').trim();
      if (!name) continue;
      if (await subjectRowExists(projectId, STAGE_CONTRACT_SIGNING, name, subjType)) continue;
      const meta = mergeUpstreamMetadata(row.metadata, STAGE_AWARD_DECISION, row.id);
      if (isPostgres) {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),NOW(),false)`,
          [projectId, STAGE_CONTRACT_SIGNING, subjType, name, JSON.stringify(meta)]
        );
      } else {
        await pool.query(
          `INSERT INTO procurement_stage_subjects
            (project_id, stage, subject_type, subject_name, metadata, created_at, updated_at, voided)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
          [projectId, STAGE_CONTRACT_SIGNING, subjType, name, JSON.stringify(meta)]
        );
      }
    }
  }
}

// --- After contract signing (workflow): contractor + project handoff (PostgreSQL) ---
let procurementContractorsTableEnsured = false;
let procurementPcaTableEnsured = false;

async function ensureContractorsTableForProcurementClosure() {
  if (!isPostgres || procurementContractorsTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractors (
      "contractorId" SERIAL PRIMARY KEY,
      "companyName" VARCHAR(255) NOT NULL,
      "contactPerson" VARCHAR(255) NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(100) NULL,
      "userId" INTEGER NULL,
      voided BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS "contractorTypeId" INTEGER NULL`);
  procurementContractorsTableEnsured = true;
}

async function ensureProjectContractorAssignmentsForProcurementClosure() {
  if (!isPostgres || procurementPcaTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "project_contractor_assignments" (
      "projectId" INTEGER NOT NULL,
      "contractorId" INTEGER NOT NULL,
      "assignmentDate" TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      voided BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY ("projectId", "contractorId"),
      CONSTRAINT fk_project_contractor_assignments_project
        FOREIGN KEY ("projectId") REFERENCES projects (project_id) ON DELETE CASCADE,
      CONSTRAINT fk_project_contractor_assignments_contractor
        FOREIGN KEY ("contractorId") REFERENCES contractors ("contractorId") ON DELETE CASCADE
    )
  `);
  procurementPcaTableEnsured = true;
}

async function findContractorIdByCompanyOrEmailPG(companyName, email) {
  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const r = rowsOf(await pool.query(
      `SELECT "contractorId" FROM contractors
       WHERE COALESCE(voided, false) = false AND LOWER(TRIM(email)) = $1
       LIMIT 1`,
      [em]
    ))[0];
    if (r?.contractorId != null) return Number(r.contractorId);
  }
  const cn = String(companyName || '').trim();
  if (cn) {
    const r2 = rowsOf(await pool.query(
      `SELECT "contractorId" FROM contractors
       WHERE COALESCE(voided, false) = false
         AND LOWER(TRIM("companyName")) = LOWER(TRIM($1))
       LIMIT 1`,
      [cn]
    ))[0];
    if (r2?.contractorId != null) return Number(r2.contractorId);
  }
  return null;
}

async function createContractorFromBidderPG({ companyName, contactPerson, email, phone }) {
  const result = await pool.query(
    `INSERT INTO contractors ("companyName", "contactPerson", email, phone, voided)
     VALUES ($1, $2, $3, $4, false)
     RETURNING "contractorId"`,
    [companyName, contactPerson || null, email, phone || null]
  );
  return Number(rowsOf(result)[0]?.contractorId) || null;
}

async function assignContractorToProjectPG(projectId, contractorId) {
  await ensureProjectContractorAssignmentsForProcurementClosure();
  await pool.query(
    `INSERT INTO "project_contractor_assignments" ("projectId", "contractorId")
     VALUES ($1, $2)
     ON CONFLICT ("projectId", "contractorId") DO NOTHING`,
    [projectId, contractorId]
  );
}

async function loadRegistryMetadataForBidderName(projectId, subjectName) {
  const name = String(subjectName || '').trim();
  if (!name) return {};
  const r = rowsOf(await pool.query(
    `SELECT metadata FROM procurement_stage_subjects
     WHERE project_id = $1
       AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
       AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
       AND LOWER(TRIM(subject_name)) = LOWER(TRIM($4))
       AND COALESCE(voided, false) = false
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [projectId, STAGE_BIDDER_REGISTRY, 'bidder', name]
  ))[0];
  return coerceSubjectMetadata(r?.metadata);
}

async function loadLatestAssessmentResponsesForSubjectPG(subjectId) {
  const sid = Number(subjectId);
  if (!Number.isFinite(sid)) return {};
  const row = rowsOf(await pool.query(
    `SELECT responses FROM procurement_subject_assessments
     WHERE subject_id = $1 AND COALESCE(voided,false)=false
     ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`,
    [sid]
  ))[0];
  const raw = row?.responses;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

function extractIsoContractDatesFromResponses(responses) {
  const obj = responses && typeof responses === 'object' ? responses : {};
  const start = String(obj.contractProjectStartDate || '').trim().slice(0, 10);
  const end = String(obj.contractProjectEndDate || '').trim().slice(0, 10);
  const out = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) out.start = start;
  if (/^\d{4}-\d{2}-\d{2}$/.test(end)) out.end = end;
  return out;
}

async function resolveBidderForContractClosure(projectId) {
  const cs = rowsOf(await pool.query(
    `SELECT id, subject_name AS "subjectName", metadata
     FROM procurement_stage_subjects
     WHERE project_id = $1
       AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
       AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
       AND COALESCE(voided, false) = false
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [projectId, STAGE_CONTRACT_SIGNING, 'bidder']
  ))[0];
  if (cs) {
    const reg = await loadRegistryMetadataForBidderName(projectId, cs.subjectName);
    const meta = { ...reg, ...coerceSubjectMetadata(cs.metadata) };
    return {
      subjectId: cs.id,
      subjectName: String(cs.subjectName || '').trim(),
      metadata: meta,
    };
  }
  const aw = rowsOf(await pool.query(
    `SELECT id, subject_name AS "subjectName", metadata
     FROM procurement_stage_subjects
     WHERE project_id = $1
       AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
       AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
       AND COALESCE(voided, false) = false
       AND LOWER(TRIM(COALESCE(latest_decision, ''))) = 'awarded'
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [projectId, STAGE_AWARD_DECISION, 'bidder']
  ))[0];
  if (!aw) return null;
  const reg = await loadRegistryMetadataForBidderName(projectId, aw.subjectName);
  const meta = { ...reg, ...coerceSubjectMetadata(aw.metadata) };
  return {
    subjectId: aw.id,
    subjectName: String(aw.subjectName || '').trim(),
    metadata: meta,
  };
}

/**
 * When Contract Signing workflow step is Approved: create contractor if missing, assign project,
 * set project status to Not Started (exit procurement), stamp completion metadata for historical queries.
 */
async function finalizeProcurementContractClosure(projectId, stage, decision) {
  if (!Number.isFinite(projectId)) return { skipped: true, reason: 'invalid_project' };
  if (!isPostgres) return { skipped: true, reason: 'not_postgres' };
  if (stageNorm(stage) !== stageNorm(STAGE_CONTRACT_SIGNING)) return { skipped: true, reason: 'wrong_stage' };
  const dec = String(decision || '').trim().toLowerCase();
  if (dec !== 'approved') return { skipped: true, reason: 'decision_not_approved' };

  const projRow = rowsOf(await pool.query(
    `SELECT project_id, progress FROM projects WHERE project_id = $1 AND COALESCE(voided, false) = false`,
    [projectId]
  ))[0];
  if (!projRow) return { ok: false, message: 'Project not found.' };

  let progressObj = {};
  try {
    progressObj =
      projRow.progress && typeof projRow.progress === 'object'
        ? projRow.progress
        : JSON.parse(projRow.progress || '{}');
  } catch {
    progressObj = {};
  }
  if (progressObj.procurement_completed_at) {
    return { skipped: true, reason: 'already_finalized' };
  }

  const bidder = await resolveBidderForContractClosure(projectId);
  if (!bidder || !bidder.subjectName) {
    return {
      ok: false,
      message:
        'No Contract Signing bidder (or awarded bidder) found. Complete Award and Contract Signing subjects first.',
    };
  }

  const meta = bidder.metadata || {};
  const companyName = String(meta.companyName || bidder.subjectName || '').trim();
  const contactPerson = String(meta.contactName || '').trim();
  let email = String(meta.contactEmail || '').trim().toLowerCase();
  const phone = String(meta.contactPhone || '').trim();
  if (!email) {
    const slug = String(companyName || 'bidder')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    email = `procurement.${projectId}.${slug || 'bidder'}@local.placeholder`;
  }

  await ensureContractorsTableForProcurementClosure();

  let contractorId = await findContractorIdByCompanyOrEmailPG(companyName, meta.contactEmail || email);
  if (contractorId == null) {
    try {
      contractorId = await createContractorFromBidderPG({
        companyName,
        contactPerson,
        email,
        phone,
      });
    } catch (e) {
      if (e?.code === '23505') {
        contractorId = await findContractorIdByCompanyOrEmailPG(companyName, meta.contactEmail || email);
      }
      if (contractorId == null) throw e;
    }
  }
  if (contractorId == null) {
    return { ok: false, message: 'Could not create or resolve contractor.' };
  }

  await assignContractorToProjectPG(projectId, contractorId);

  const prevStatus = progressObj.status != null ? String(progressObj.status) : '';

  const responseMap = await loadLatestAssessmentResponsesForSubjectPG(bidder.subjectId);
  const contractDates = extractIsoContractDatesFromResponses(responseMap);

  const completedAt = new Date().toISOString();
  const progressPatch = {
    status: 'Not Started',
    procurement_completed_at: completedAt,
    procurement_previous_status: prevStatus,
    procurement_awarded_contractor_id: contractorId,
  };
  if (contractDates.start) progressPatch.procurement_contract_start_date = contractDates.start;
  if (contractDates.end) progressPatch.procurement_contract_end_date = contractDates.end;

  await pool.query(
    `UPDATE projects
     SET progress = COALESCE(progress, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE project_id = $1 AND COALESCE(voided, false) = false`,
    [projectId, JSON.stringify(progressPatch)]
  );

  const dateNote =
    contractDates.start || contractDates.end
      ? ` Contract dates saved (${[contractDates.start && `start ${contractDates.start}`, contractDates.end && `end ${contractDates.end}`].filter(Boolean).join('; ')}).`
      : '';

  return {
    ok: true,
    contractorId,
    companyName,
    projectId,
    message: `Project handed off to contractors as Not Started; procurement history retained.${dateNote}`,
  };
}

async function ensureProcurementScopeTables() {
  if (isPostgres) {
    await runProcurementSafeDdl(`
      CREATE TABLE IF NOT EXISTS category_bq_templates (
        id BIGSERIAL PRIMARY KEY,
        category_id BIGINT NOT NULL,
        milestone_id BIGINT NULL,
        activity_name TEXT NOT NULL,
        description TEXT NULL,
        unit_of_measure TEXT NULL,
        quantity NUMERIC(18,4) NULL,
        unit_cost NUMERIC(18,2) NULL,
        budget_amount NUMERIC(18,2) NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await runProcurementSafeDdl(`CREATE INDEX IF NOT EXISTS idx_category_bq_templates_category ON category_bq_templates (category_id, voided, sort_order)`);
    await runProcurementSafeDdl(`
      CREATE TABLE IF NOT EXISTS project_milestones (
        milestone_id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        milestone_name TEXT NOT NULL,
        description TEXT NULL,
        due_date DATE NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        completed_date DATE NULL,
        sequence_order INTEGER NULL,
        progress NUMERIC(5,2) NOT NULL DEFAULT 0,
        weight NUMERIC(10,2) NOT NULL DEFAULT 1,
        status TEXT NULL DEFAULT 'pending',
        user_id BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS activity_code TEXT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS activity_name TEXT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS indicator_name TEXT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS milestone_value NUMERIC NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS milestone_period TEXT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS milestone_source TEXT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS remarks TEXT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS category_milestone_id BIGINT NULL`);
    await runProcurementSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_milestones_category_template ON project_milestones (project_id, category_milestone_id)`);
    await runProcurementSafeDdl(`
      CREATE TABLE IF NOT EXISTS project_bq_items (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        activity_name TEXT NOT NULL,
        milestone_name TEXT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        budget_amount NUMERIC(18,2) NULL,
        progress_percent NUMERIC(5,2) NULL DEFAULT 0,
        remarks TEXT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        completion_date DATE NULL,
        sort_order INTEGER NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN IF NOT EXISTS category_bq_template_id BIGINT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN IF NOT EXISTS unit_of_measure TEXT NULL`);
    await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,2) NULL`);
    await runProcurementSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_bq_items_category_template ON project_bq_items (project_id, category_bq_template_id)`);
    return;
  }

  await runProcurementSafeDdl(`
    CREATE TABLE IF NOT EXISTS category_bq_templates (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      category_id BIGINT NOT NULL,
      milestone_id BIGINT NULL,
      activity_name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      unit_of_measure VARCHAR(100) NULL,
      quantity DECIMAL(18,4) NULL,
      unit_cost DECIMAL(18,2) NULL,
      budget_amount DECIMAL(18,2) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      voided TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_category_bq_templates_category (category_id, voided, sort_order)
    )
  `);
  await runProcurementSafeDdl(`ALTER TABLE project_milestones ADD COLUMN category_milestone_id BIGINT NULL`);
  await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN category_bq_template_id BIGINT NULL`);
  await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN quantity DECIMAL(18,4) NULL`);
  await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN unit_of_measure VARCHAR(100) NULL`);
  await runProcurementSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN unit_cost DECIMAL(18,2) NULL`);
}

async function getProjectForProcurementScope(projectId) {
  if (isPostgres) {
    const queries = [
      {
        sql: `SELECT
                p.project_id AS "projectId",
                p.name AS "projectName",
                p.category_id AS "categoryId",
                c."categoryName" AS "categoryName"
              FROM projects p
              LEFT JOIN categories c ON c."categoryId" = p.category_id AND COALESCE(c.voided, false) = false
              WHERE p.project_id = $1 AND COALESCE(p.voided, false) = false
              LIMIT 1`,
        params: [projectId],
      },
      {
        sql: `SELECT
                p.id AS "projectId",
                p."projectName" AS "projectName",
                p."categoryId" AS "categoryId",
                c."categoryName" AS "categoryName"
              FROM projects p
              LEFT JOIN categories c ON c."categoryId" = p."categoryId" AND COALESCE(c.voided, false) = false
              WHERE p.id = $1 AND COALESCE(p.voided, false) = false
              LIMIT 1`,
        params: [projectId],
      },
    ];
    for (const q of queries) {
      try {
        const row = rowsOf(await pool.query(q.sql, q.params))[0];
        if (row) return row;
      } catch (e) {
        if (!isSchemaError(e)) throw e;
      }
    }
    return null;
  }
  const row = rowsOf(await pool.query(
    `SELECT
        p.id AS projectId,
        p.projectName,
        p.categoryId,
        c.categoryName
     FROM projects p
     LEFT JOIN project_milestone_implementations c ON c.categoryId = p.categoryId AND COALESCE(c.voided, 0) = 0
     WHERE p.id = ? AND COALESCE(p.voided, 0) = 0
     LIMIT 1`,
    [projectId]
  ))[0];
  return row || null;
}

async function applyProjectTypeScopeToProject(projectId, actorId = null, options = {}) {
  const dryRun = Boolean(options.dryRun);
  await ensureProcurementScopeTables();
  const project = await getProjectForProcurementScope(projectId);
  if (!project) {
    return { ok: false, status: 404, message: 'Project not found.' };
  }
  const categoryId = Number(project.categoryId);
  if (!Number.isFinite(categoryId)) {
    return { ok: false, status: 400, message: 'Select a project type/category on the project before preparing procurement scope.' };
  }

  const milestoneRows = rowsOf(await pool.query(
    isPostgres
      ? `SELECT
            "milestoneId" AS "milestoneId",
            "milestoneName" AS "milestoneName",
            description,
            "sequenceOrder" AS "sequenceOrder",
            "unit_of_measure" AS "unitOfMeasure",
            "achievement_value" AS "achievementValue"
         FROM category_milestones
         WHERE "categoryId" = $1 AND COALESCE(voided, false) = false
         ORDER BY "sequenceOrder" ASC, "milestoneId" ASC`
      : `SELECT
            milestoneId,
            milestoneName,
            description,
            sequenceOrder,
            unit_of_measure AS unitOfMeasure,
            achievement_value AS achievementValue
         FROM category_milestones
         WHERE categoryId = ? AND COALESCE(voided, 0) = 0
         ORDER BY sequenceOrder ASC, milestoneId ASC`,
    [categoryId]
  ));

  const bqRows = rowsOf(await pool.query(
    isPostgres
      ? `SELECT
            b.id AS "templateId",
            b.milestone_id AS "milestoneId",
            cm."milestoneName" AS "milestoneName",
            b.activity_name AS "activityName",
            b.description,
            b.unit_of_measure AS "unitOfMeasure",
            b.quantity,
            b.unit_cost AS "unitCost",
            b.budget_amount AS "budgetAmount",
            b.sort_order AS "sortOrder"
         FROM category_bq_templates b
         LEFT JOIN category_milestones cm
           ON cm."milestoneId" = b.milestone_id
          AND COALESCE(cm.voided, false) = false
         WHERE b.category_id = $1 AND COALESCE(b.voided, false) = false
         ORDER BY b.sort_order ASC, b.id ASC`
      : `SELECT
            b.id AS templateId,
            b.milestone_id AS milestoneId,
            cm.milestoneName AS milestoneName,
            b.activity_name AS activityName,
            b.description,
            b.unit_of_measure AS unitOfMeasure,
            b.quantity,
            b.unit_cost AS unitCost,
            b.budget_amount AS budgetAmount,
            b.sort_order AS sortOrder
         FROM category_bq_templates b
         LEFT JOIN category_milestones cm
           ON cm.milestoneId = b.milestone_id
          AND COALESCE(cm.voided, 0) = 0
         WHERE b.category_id = ? AND COALESCE(b.voided, 0) = 0
         ORDER BY b.sort_order ASC, b.id ASC`,
    [categoryId]
  ));

  let milestonesCreated = 0;
  let bqItemsCreated = 0;
  const preparedMilestones = [];
  const preparedBqItems = [];

  if (isPostgres) {
    for (const m of milestoneRows) {
      const exists = rowsOf(await pool.query(
        `SELECT milestone_id
         FROM project_milestones
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND (
             (category_milestone_id IS NOT NULL AND category_milestone_id = $2)
             OR LOWER(TRIM(milestone_name)) = LOWER(TRIM($3))
           )
         LIMIT 1`,
        [projectId, m.milestoneId, m.milestoneName]
      ))[0];
      if (exists) {
        preparedMilestones.push({
          templateId: m.milestoneId,
          name: m.milestoneName,
          description: m.description || '',
          sequenceOrder: m.sequenceOrder,
          unitOfMeasure: m.unitOfMeasure || '',
          achievementValue: m.achievementValue,
          status: 'existing',
        });
        continue;
      }
      if (!dryRun) {
        await pool.query(
          `INSERT INTO project_milestones (
              project_id, milestone_name, description, due_date, completed, completed_date,
              sequence_order, progress, weight, status, user_id, created_at, updated_at, voided,
              activity_name, milestone_value, milestone_source, remarks, category_milestone_id
           ) VALUES ($1,$2,$3,NULL,false,NULL,$4,0,1,'pending',$5,NOW(),NOW(),false,$6,$7,$8,$9,$10)`,
          [
            projectId,
            m.milestoneName,
            m.description || null,
            Number.isFinite(Number(m.sequenceOrder)) ? Number(m.sequenceOrder) : null,
            actorId,
            m.milestoneName,
            m.achievementValue == null ? null : Number(m.achievementValue),
            'Project type template',
            m.description || null,
            m.milestoneId,
          ]
        );
      }
      milestonesCreated += 1;
      preparedMilestones.push({
        templateId: m.milestoneId,
        name: m.milestoneName,
        description: m.description || '',
        sequenceOrder: m.sequenceOrder,
        unitOfMeasure: m.unitOfMeasure || '',
        achievementValue: m.achievementValue,
        status: dryRun ? 'will_create' : 'created',
      });
    }

    for (const bq of bqRows) {
      const exists = rowsOf(await pool.query(
        `SELECT id
         FROM project_bq_items
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND (
             (category_bq_template_id IS NOT NULL AND category_bq_template_id = $2)
             OR (
               LOWER(TRIM(activity_name)) = LOWER(TRIM($3))
               AND LOWER(TRIM(COALESCE(milestone_name, ''))) = LOWER(TRIM(COALESCE($4, '')))
             )
           )
         LIMIT 1`,
        [projectId, bq.templateId, bq.activityName, bq.milestoneName || null]
      ))[0];
      if (exists) {
        preparedBqItems.push({
          templateId: bq.templateId,
          activityName: bq.activityName,
          milestoneName: bq.milestoneName || '',
          description: bq.description || '',
          unitOfMeasure: bq.unitOfMeasure || '',
          quantity: bq.quantity,
          unitCost: bq.unitCost,
          budgetAmount: bq.budgetAmount,
          sortOrder: bq.sortOrder,
          status: 'existing',
        });
        continue;
      }
      if (!dryRun) {
        await pool.query(
          `INSERT INTO project_bq_items (
              project_id, activity_name, milestone_name, start_date, end_date,
              budget_amount, progress_percent, remarks, completed, completion_date, sort_order,
              quantity, unit_of_measure, unit_cost, category_bq_template_id
           ) VALUES ($1,$2,$3,NULL,NULL,$4,0,$5,false,NULL,$6,$7,$8,$9,$10)`,
          [
            projectId,
            bq.activityName,
            bq.milestoneName || null,
            bq.budgetAmount == null ? null : Number(bq.budgetAmount),
            bq.description || 'Generated from project type during procurement scope preparation',
            Number.isFinite(Number(bq.sortOrder)) ? Number(bq.sortOrder) : 0,
            bq.quantity == null ? null : Number(bq.quantity),
            bq.unitOfMeasure || null,
            bq.unitCost == null ? null : Number(bq.unitCost),
            bq.templateId,
          ]
        );
      }
      bqItemsCreated += 1;
      preparedBqItems.push({
        templateId: bq.templateId,
        activityName: bq.activityName,
        milestoneName: bq.milestoneName || '',
        description: bq.description || '',
        unitOfMeasure: bq.unitOfMeasure || '',
        quantity: bq.quantity,
        unitCost: bq.unitCost,
        budgetAmount: bq.budgetAmount,
        sortOrder: bq.sortOrder,
        status: dryRun ? 'will_create' : 'created',
      });
    }
  } else {
    for (const m of milestoneRows) {
      const exists = rowsOf(await pool.query(
        `SELECT milestoneId
         FROM project_milestones
         WHERE projectId = ?
           AND COALESCE(voided, 0) = 0
           AND (
             (category_milestone_id IS NOT NULL AND category_milestone_id = ?)
             OR LOWER(TRIM(milestoneName)) = LOWER(TRIM(?))
           )
         LIMIT 1`,
        [projectId, m.milestoneId, m.milestoneName]
      ))[0];
      if (exists) {
        preparedMilestones.push({
          templateId: m.milestoneId,
          name: m.milestoneName,
          description: m.description || '',
          sequenceOrder: m.sequenceOrder,
          unitOfMeasure: m.unitOfMeasure || '',
          achievementValue: m.achievementValue,
          status: 'existing',
        });
        continue;
      }
      if (!dryRun) {
        await pool.query(
          `INSERT INTO project_milestones
            (projectId, milestoneName, description, sequenceOrder, status, userId, createdAt, category_milestone_id)
           VALUES (?, ?, ?, ?, 'pending', ?, NOW(), ?)`,
          [projectId, m.milestoneName, m.description || null, m.sequenceOrder || null, actorId || 1, m.milestoneId]
        );
      }
      milestonesCreated += 1;
      preparedMilestones.push({
        templateId: m.milestoneId,
        name: m.milestoneName,
        description: m.description || '',
        sequenceOrder: m.sequenceOrder,
        unitOfMeasure: m.unitOfMeasure || '',
        achievementValue: m.achievementValue,
        status: dryRun ? 'will_create' : 'created',
      });
    }

    for (const bq of bqRows) {
      const exists = rowsOf(await pool.query(
        `SELECT id
         FROM project_bq_items
         WHERE project_id = ?
           AND COALESCE(voided, 0) = 0
           AND (
             (category_bq_template_id IS NOT NULL AND category_bq_template_id = ?)
             OR (
               LOWER(TRIM(activity_name)) = LOWER(TRIM(?))
               AND LOWER(TRIM(COALESCE(milestone_name, ''))) = LOWER(TRIM(COALESCE(?, '')))
             )
           )
         LIMIT 1`,
        [projectId, bq.templateId, bq.activityName, bq.milestoneName || null]
      ))[0];
      if (exists) {
        preparedBqItems.push({
          templateId: bq.templateId,
          activityName: bq.activityName,
          milestoneName: bq.milestoneName || '',
          description: bq.description || '',
          unitOfMeasure: bq.unitOfMeasure || '',
          quantity: bq.quantity,
          unitCost: bq.unitCost,
          budgetAmount: bq.budgetAmount,
          sortOrder: bq.sortOrder,
          status: 'existing',
        });
        continue;
      }
      if (!dryRun) {
        await pool.query(
          `INSERT INTO project_bq_items (
              project_id, activity_name, milestone_name, budget_amount, progress_percent,
              remarks, completed, sort_order, quantity, unit_of_measure, unit_cost, category_bq_template_id
           ) VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?)`,
          [
            projectId,
            bq.activityName,
            bq.milestoneName || null,
            bq.budgetAmount == null ? null : Number(bq.budgetAmount),
            bq.description || 'Generated from project type during procurement scope preparation',
            Number.isFinite(Number(bq.sortOrder)) ? Number(bq.sortOrder) : 0,
            bq.quantity == null ? null : Number(bq.quantity),
            bq.unitOfMeasure || null,
            bq.unitCost == null ? null : Number(bq.unitCost),
            bq.templateId,
          ]
        );
      }
      bqItemsCreated += 1;
      preparedBqItems.push({
        templateId: bq.templateId,
        activityName: bq.activityName,
        milestoneName: bq.milestoneName || '',
        description: bq.description || '',
        unitOfMeasure: bq.unitOfMeasure || '',
        quantity: bq.quantity,
        unitCost: bq.unitCost,
        budgetAmount: bq.budgetAmount,
        sortOrder: bq.sortOrder,
        status: dryRun ? 'will_create' : 'created',
      });
    }
  }

  return {
    ok: true,
    projectId,
    projectName: project.projectName,
    categoryId,
    categoryName: project.categoryName,
    templateMilestones: milestoneRows.length,
    templateBqItems: bqRows.length,
    milestonesCreated,
    bqItemsCreated,
    dryRun,
    preparedScope: {
      milestones: preparedMilestones,
      bqItems: preparedBqItems,
    },
  };
}

const ALLOCATED_KES_REGEX = '^-{0,1}[0-9]+(\\.[0-9]+){0,1}$';

function normHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pickRowValue(row, aliases) {
  if (!row || typeof row !== 'object') return '';
  const keys = Object.keys(row);
  const normalized = new Map(keys.map((k) => [normHeaderKey(k), row[k]]));
  for (const alias of aliases) {
    const hit = normalized.get(normHeaderKey(alias));
    if (hit !== undefined && hit !== null && String(hit).trim() !== '') {
      return String(hit).trim();
    }
  }
  return '';
}

function parseScopeNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function sheetRowsFromWorkbook(workbook, preferredNames = []) {
  const names = workbook.SheetNames || [];
  for (const preferred of preferredNames) {
    const hit = names.find((n) => normHeaderKey(n) === normHeaderKey(preferred));
    if (hit) {
      return { sheetName: hit, rows: XLSX.utils.sheet_to_json(workbook.Sheets[hit], { defval: '' }) };
    }
  }
  if (!names.length) return { sheetName: '', rows: [] };
  const sheetName = names[0];
  return { sheetName, rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) };
}

function parseScopeExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const milestoneSheet = sheetRowsFromWorkbook(workbook, ['Milestones', 'Milestone Templates', 'milestone_templates']);
  const bqSheet = sheetRowsFromWorkbook(workbook, ['BQ Lines', 'BQ', 'Sample BQ Templates', 'bq_lines', 'bill_of_quantities']);

  const milestones = [];
  const milestoneErrors = [];
  const seenMilestones = new Set();

  for (let i = 0; i < milestoneSheet.rows.length; i += 1) {
    const row = milestoneSheet.rows[i];
    const name = pickRowValue(row, ['milestone_name', 'milestone', 'name', 'milestone name']);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenMilestones.has(key)) {
      milestoneErrors.push(`Milestones row ${i + 2}: duplicate milestone "${name}".`);
      continue;
    }
    seenMilestones.add(key);
    milestones.push({
      milestoneName: name,
      description: pickRowValue(row, ['description', 'remarks', 'notes']),
      sequenceOrder: parseScopeNumber(pickRowValue(row, ['sequence_order', 'sequence', 'order', 'seq', 'no'])) ?? (milestones.length + 1),
      unitOfMeasure: pickRowValue(row, ['unit_of_measure', 'uom', 'unit']),
      achievementValue: parseScopeNumber(pickRowValue(row, ['achievement_value', 'value', 'target_value'])),
    });
  }

  const bqItems = [];
  const bqErrors = [];
  const bqRows = bqSheet.rows.length ? bqSheet.rows : milestoneSheet.rows;

  for (let i = 0; i < bqRows.length; i += 1) {
    const row = bqRows[i];
    const activityName = pickRowValue(row, ['activity_name', 'activity', 'item', 'description', 'work_item']);
    const milestoneName = pickRowValue(row, ['milestone_name', 'milestone', 'phase', 'stage']);
    if (!activityName && !milestoneName) continue;
    if (!activityName) {
      bqErrors.push(`BQ row ${i + 2}: activity_name is required.`);
      continue;
    }
    const quantity = parseScopeNumber(pickRowValue(row, ['quantity', 'qty', 'qnty']));
    const unitCost = parseScopeNumber(pickRowValue(row, ['unit_cost', 'rate', 'unit_rate', 'unit price']));
    let budgetAmount = parseScopeNumber(pickRowValue(row, ['budget_amount', 'amount', 'cost', 'total', 'line_total']));
    if (budgetAmount == null && quantity != null && unitCost != null) {
      budgetAmount = quantity * unitCost;
    }
    bqItems.push({
      milestoneName: milestoneName || null,
      activityName,
      description: pickRowValue(row, ['description', 'remarks', 'notes']),
      unitOfMeasure: pickRowValue(row, ['unit_of_measure', 'uom', 'unit']),
      quantity,
      unitCost,
      budgetAmount,
      sortOrder: parseScopeNumber(pickRowValue(row, ['sort_order', 'order', 'seq', 'no'])) ?? (bqItems.length + 1),
    });
  }

  if (!milestones.length && bqItems.length) {
    const derived = new Map();
    for (const item of bqItems) {
      const name = item.milestoneName || 'General';
      if (!derived.has(name.toLowerCase())) {
        derived.set(name.toLowerCase(), {
          milestoneName: name,
          description: '',
          sequenceOrder: derived.size + 1,
          unitOfMeasure: '',
          achievementValue: null,
        });
      }
    }
    milestones.push(...derived.values());
  }

  const errors = [...milestoneErrors, ...bqErrors];
  if (!milestones.length && !bqItems.length) {
    errors.push('No milestones or BQ lines found. Use sheets "Milestones" and "BQ Lines", or a single sheet with activity rows.');
  }

  const importTotal = bqItems.reduce((sum, row) => sum + Number(row.budgetAmount || 0), 0);
  return {
    milestones,
    bqItems,
    errors,
    importTotal,
    sheets: {
      milestones: milestoneSheet.sheetName || null,
      bq: bqSheet.sheetName || null,
    },
  };
}

function scaleScopeBqAmounts(bqItems, targetTotal) {
  const items = Array.isArray(bqItems) ? bqItems : [];
  const current = items.reduce((sum, row) => sum + Number(row.budgetAmount || 0), 0);
  const target = Number(targetTotal);
  if (!Number.isFinite(target) || target <= 0 || current <= 0) return items;
  const factor = target / current;
  return items.map((row) => {
    const budgetAmount = Number((Number(row.budgetAmount || 0) * factor).toFixed(2));
    const quantity = Number(row.quantity);
    if (Number.isFinite(quantity) && quantity > 0) {
      return { ...row, budgetAmount, unitCost: Number((budgetAmount / quantity).toFixed(2)) };
    }
    return { ...row, budgetAmount };
  });
}

async function getProjectBudgetContext(projectId) {
  if (!isPostgres) return null;
  const queries = [
    `SELECT
        p.project_id AS "projectId",
        p.name AS "projectName",
        p.category_id AS "categoryId",
        c."categoryName" AS "categoryName",
        COALESCE(
          CASE
            WHEN (p.budget->>'allocated_amount_kes') ~ '${ALLOCATED_KES_REGEX}'
              THEN (p.budget->>'allocated_amount_kes')::numeric
            ELSE NULL
          END,
          0
        ) AS "allocatedAmount",
        COALESCE(p.progress, '{}'::jsonb) AS progress
     FROM projects p
     LEFT JOIN categories c ON c."categoryId" = p.category_id AND COALESCE(c.voided, false) = false
     WHERE p.project_id = $1 AND COALESCE(p.voided, false) = false
     LIMIT 1`,
    `SELECT
        p.id AS "projectId",
        p."projectName" AS "projectName",
        p."categoryId" AS "categoryId",
        c."categoryName" AS "categoryName",
        COALESCE(p."costOfProject", 0) AS "allocatedAmount",
        '{}'::jsonb AS progress
     FROM projects p
     LEFT JOIN categories c ON c."categoryId" = p."categoryId" AND COALESCE(c.voided, false) = false
     WHERE p.id = $1 AND COALESCE(p.voided, false) = false
     LIMIT 1`,
  ];
  for (const sql of queries) {
    try {
      const row = rowsOf(await pool.query(sql, [projectId]))[0];
      if (row) return row;
    } catch (e) {
      if (!isSchemaError(e)) throw e;
    }
  }
  return null;
}

function readProcurementScopeMeta(progress) {
  const base = progress && typeof progress === 'object' ? progress : {};
  const scope = base.procurement_scope && typeof base.procurement_scope === 'object'
    ? base.procurement_scope
    : {};
  return {
    status: String(scope.status || '').trim() || null,
    source: String(scope.source || '').trim() || null,
    lockedAt: scope.lockedAt || scope.locked_at || null,
    bqTotal: scope.bqTotal != null ? Number(scope.bqTotal) : null,
  };
}

async function mergeProjectProcurementScopeMeta(projectId, patch = {}) {
  if (!isPostgres) return;
  const ctx = await getProjectBudgetContext(projectId);
  if (!ctx) return;
  const progress = ctx.progress && typeof ctx.progress === 'object' ? { ...ctx.progress } : {};
  const current = readProcurementScopeMeta(progress);
  progress.procurement_scope = {
    ...current,
    ...patch,
    status: patch.status || current.status || 'draft',
    updatedAt: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE projects SET progress = $2::jsonb, updated_at = NOW() WHERE project_id = $1`,
    [projectId, JSON.stringify(progress)]
  );
}

async function fetchProjectScopeStatus(projectId) {
  await ensureProcurementScopeTables();
  const ctx = await getProjectBudgetContext(projectId);
  if (!ctx) return null;

  const stats = rowsOf(await pool.query(
    `SELECT
        (SELECT COUNT(*)::int
         FROM project_milestones
         WHERE project_id = $1 AND COALESCE(voided, false) = false) AS "milestoneCount",
        (SELECT COUNT(*)::int
         FROM project_bq_items
         WHERE project_id = $1 AND COALESCE(voided, false) = false) AS "bqItemCount",
        (SELECT COALESCE(SUM(COALESCE(budget_amount, 0)), 0)
         FROM project_bq_items
         WHERE project_id = $1 AND COALESCE(voided, false) = false) AS "bqBudgetAmount"`,
    [projectId]
  ))[0] || {};

  const meta = readProcurementScopeMeta(ctx.progress);
  const milestoneCount = Number(stats.milestoneCount || 0);
  const bqItemCount = Number(stats.bqItemCount || 0);
  const bqBudgetAmount = Number(stats.bqBudgetAmount || 0);
  let scopeStatus = meta.status;
  if (!scopeStatus) {
    if (milestoneCount > 0 || bqItemCount > 0) scopeStatus = 'draft';
    else scopeStatus = 'none';
  }

  const allocatedAmount = Number(ctx.allocatedAmount || 0);
  const overBudget = allocatedAmount > 0 && bqBudgetAmount > allocatedAmount + 0.005;

  return {
    projectId: Number(ctx.projectId),
    projectName: ctx.projectName,
    categoryId: ctx.categoryId,
    categoryName: ctx.categoryName,
    allocatedAmount,
    milestoneCount,
    bqItemCount,
    bqBudgetAmount,
    scopeStatus,
    scopeSource: meta.source,
    scopeLockedAt: meta.lockedAt,
    overBudget,
    remainingBudget: allocatedAmount > 0 ? Math.max(0, allocatedAmount - bqBudgetAmount) : null,
  };
}

async function applyScopeImportToProject(projectId, payload, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const actorId = options.actorId || null;
  const source = options.source || 'excel';
  const lockBaseline = Boolean(options.lockBaseline);
  const scaleToBudget = Boolean(options.scaleToBudget);
  const confirmOverBudget = Boolean(options.confirmOverBudget);

  await ensureProcurementScopeTables();
  const ctx = await getProjectBudgetContext(projectId);
  if (!ctx) {
    return { ok: false, status: 404, message: 'Project not found.' };
  }

  let milestones = Array.isArray(payload?.milestones) ? payload.milestones : [];
  let bqItems = Array.isArray(payload?.bqItems) ? payload.bqItems : [];
  if (!milestones.length && !bqItems.length) {
    return { ok: false, status: 400, message: 'No milestones or BQ lines to import.' };
  }

  if (scaleToBudget && Number(ctx.allocatedAmount) > 0) {
    bqItems = scaleScopeBqAmounts(bqItems, ctx.allocatedAmount);
  }

  const importTotal = bqItems.reduce((sum, row) => sum + Number(row.budgetAmount || 0), 0);
  const allocatedAmount = Number(ctx.allocatedAmount || 0);
  if (allocatedAmount > 0 && importTotal > allocatedAmount + 0.005 && !confirmOverBudget) {
    return {
      ok: false,
      status: 400,
      code: 'OVER_BUDGET',
      message: 'Imported BQ total exceeds the project allocated amount. Scale to budget or confirm to proceed.',
      importTotal,
      allocatedAmount,
    };
  }

  let milestonesCreated = 0;
  let bqItemsCreated = 0;
  const preparedMilestones = [];
  const preparedBqItems = [];

  if (isPostgres) {
    for (const m of milestones) {
      const name = String(m.milestoneName || '').trim();
      if (!name) continue;
      const exists = rowsOf(await pool.query(
        `SELECT milestone_id
         FROM project_milestones
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND LOWER(TRIM(milestone_name)) = LOWER(TRIM($2))
         LIMIT 1`,
        [projectId, name]
      ))[0];
      if (exists) {
        preparedMilestones.push({ name, status: 'existing' });
        continue;
      }
      if (!dryRun) {
        await pool.query(
          `INSERT INTO project_milestones (
              project_id, milestone_name, description, due_date, completed, completed_date,
              sequence_order, progress, weight, status, user_id, created_at, updated_at, voided,
              activity_name, milestone_value, milestone_source, remarks
           ) VALUES ($1,$2,$3,NULL,false,NULL,$4,0,1,'pending',$5,NOW(),NOW(),false,$6,$7,$8,$9)`,
          [
            projectId,
            name,
            m.description || null,
            Number.isFinite(Number(m.sequenceOrder)) ? Number(m.sequenceOrder) : null,
            actorId,
            name,
            m.achievementValue == null ? null : Number(m.achievementValue),
            source === 'excel' ? 'Excel import' : 'Manual scope setup',
            m.description || null,
          ]
        );
      }
      milestonesCreated += 1;
      preparedMilestones.push({ name, status: dryRun ? 'will_create' : 'created' });
    }

    for (const bq of bqItems) {
      const activityName = String(bq.activityName || '').trim();
      if (!activityName) continue;
      const milestoneName = bq.milestoneName ? String(bq.milestoneName).trim() : null;
      const exists = rowsOf(await pool.query(
        `SELECT id
         FROM project_bq_items
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND LOWER(TRIM(activity_name)) = LOWER(TRIM($2))
           AND LOWER(TRIM(COALESCE(milestone_name, ''))) = LOWER(TRIM(COALESCE($3, '')))
         LIMIT 1`,
        [projectId, activityName, milestoneName]
      ))[0];
      if (exists) {
        preparedBqItems.push({ activityName, milestoneName, status: 'existing' });
        continue;
      }
      if (!dryRun) {
        await pool.query(
          `INSERT INTO project_bq_items (
              project_id, activity_name, milestone_name, start_date, end_date,
              budget_amount, progress_percent, remarks, completed, completion_date, sort_order,
              quantity, unit_of_measure, unit_cost
           ) VALUES ($1,$2,$3,NULL,NULL,$4,0,$5,false,NULL,$6,$7,$8,$9)`,
          [
            projectId,
            activityName,
            milestoneName,
            bq.budgetAmount == null ? null : Number(bq.budgetAmount),
            bq.description || `Imported from ${source}`,
            Number.isFinite(Number(bq.sortOrder)) ? Number(bq.sortOrder) : 0,
            bq.quantity == null ? null : Number(bq.quantity),
            bq.unitOfMeasure || null,
            bq.unitCost == null ? null : Number(bq.unitCost),
          ]
        );
      }
      bqItemsCreated += 1;
      preparedBqItems.push({
        activityName,
        milestoneName,
        budgetAmount: bq.budgetAmount,
        status: dryRun ? 'will_create' : 'created',
      });
    }
  }

  if (!dryRun && (milestonesCreated > 0 || bqItemsCreated > 0)) {
    await mergeProjectProcurementScopeMeta(projectId, {
      status: lockBaseline ? 'planned' : 'draft',
      source,
      lockedAt: lockBaseline ? new Date().toISOString() : null,
      bqTotal: importTotal,
    });
  }

  return {
    ok: true,
    projectId,
    projectName: ctx.projectName,
    milestonesCreated,
    bqItemsCreated,
    importTotal,
    allocatedAmount,
    scaled: scaleToBudget,
    dryRun,
    preparedScope: {
      milestones: preparedMilestones,
      bqItems: preparedBqItems,
    },
  };
}

async function ensureProcurementQuotationTables() {
  if (!isPostgres) return;
  await runProcurementSafeDdl(`
    CREATE TABLE IF NOT EXISTS procurement_quotations (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      contractor_id BIGINT NULL,
      quotation_type VARCHAR(32) NOT NULL DEFAULT 'awarded',
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      title TEXT NULL,
      supplier_name TEXT NULL,
      reference_no TEXT NULL,
      total_amount NUMERIC(18,2) NULL,
      notes TEXT NULL,
      created_by BIGINT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await runProcurementSafeDdl(`CREATE INDEX IF NOT EXISTS idx_procurement_quotations_project ON procurement_quotations (project_id, voided, status)`);
  await runProcurementSafeDdl(`
    CREATE TABLE IF NOT EXISTS procurement_quotation_lines (
      id BIGSERIAL PRIMARY KEY,
      quotation_id BIGINT NOT NULL REFERENCES procurement_quotations(id) ON DELETE CASCADE,
      planned_bq_item_id BIGINT NULL,
      milestone_name TEXT NULL,
      activity_name TEXT NOT NULL,
      description TEXT NULL,
      unit_of_measure TEXT NULL,
      quantity NUMERIC(18,4) NULL,
      unit_cost NUMERIC(18,2) NULL,
      amount NUMERIC(18,2) NULL,
      sequence_order INTEGER NULL DEFAULT 0,
      sort_order INTEGER NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await runProcurementSafeDdl(`CREATE INDEX IF NOT EXISTS idx_procurement_quotation_lines_quote ON procurement_quotation_lines (quotation_id, voided, sort_order)`);
  await runProcurementSafeDdl(`ALTER TABLE procurement_quotation_lines ADD COLUMN IF NOT EXISTS line_type VARCHAR(32) NOT NULL DEFAULT 'planned'`);
}

const QUOTATION_LINE_TYPES = new Set(['planned', 'provisional', 'pc_sum', 'extra']);

function normalizeQuotationLineType(value) {
  const raw = String(value || 'planned').trim().toLowerCase().replace(/\s+/g, '_');
  if (raw === 'pcsum' || raw === 'pc') return 'pc_sum';
  if (raw === 'provisional_sum') return 'provisional';
  return QUOTATION_LINE_TYPES.has(raw) ? raw : 'planned';
}

function namesMatchPlanned(planned, line) {
  const plannedMilestone = String(planned?.milestoneName || '').trim().toLowerCase();
  const plannedActivity = String(planned?.activityName || '').trim().toLowerCase();
  const lineMilestone = String(line?.milestoneName || '').trim().toLowerCase();
  const lineActivity = String(line?.activityName || '').trim().toLowerCase();
  return plannedActivity === lineActivity && plannedMilestone === lineMilestone;
}

async function buildQuotationEntrySheet(projectId) {
  const plannedLines = await fetchPlannedBqLines(projectId);
  let quotation = null;
  try {
    const latest = rowsOf(await pool.query(
      `SELECT id FROM procurement_quotations
       WHERE project_id = $1 AND COALESCE(voided, false) = false
       ORDER BY
         CASE status
           WHEN 'awarded' THEN 0
           WHEN 'submitted' THEN 1
           WHEN 'draft' THEN 2
           ELSE 3
         END,
         updated_at DESC NULLS LAST,
         id DESC
       LIMIT 1`,
      [projectId]
    ))[0];
    if (latest?.id) quotation = await fetchQuotationById(projectId, latest.id);
  } catch (error) {
    if (!isSchemaError(error)) throw error;
  }

  const quotedByPlannedId = new Map();
  if (quotation?.lines) {
    for (const line of quotation.lines) {
      if (line.plannedBqItemId != null) {
        quotedByPlannedId.set(String(line.plannedBqItemId), line);
      }
    }
  }

  const plannedEntryLines = plannedLines.map((row, index) => {
    const quoted = quotedByPlannedId.get(String(row.plannedBqItemId));
    const plannedQty = row.quantity != null && row.quantity !== '' ? row.quantity : '';
    return {
      plannedBqItemId: row.plannedBqItemId,
      lineType: 'planned',
      milestoneName: row.milestoneName || '',
      activityName: row.activityName,
      description: row.description || '',
      unitOfMeasure: row.unitOfMeasure || '',
      plannedQuantity: plannedQty,
      plannedUnitCost: row.unitCost,
      plannedAmount: row.budgetAmount,
      quotedQuantity: plannedQty,
      quotedUnitCost: quoted?.unitCost != null && quoted.unitCost !== '' ? quoted.unitCost : '',
      quotedAmount: quoted?.amount != null && quoted.amount !== '' ? quoted.amount : '',
      sortOrder: row.sortOrder ?? index + 1,
    };
  });

  const supplementaryEntryLines = quotationSupplementaryLines(quotation?.lines || []).map((line, idx) => ({
    plannedBqItemId: null,
    lineType: normalizeQuotationLineType(line.lineType),
    milestoneName: line.milestoneName || (line.lineType === 'pc_sum' ? 'PC sums' : 'Provisional sums'),
    activityName: line.activityName,
    description: line.description || '',
    unitOfMeasure: line.unitOfMeasure || 'lump sum',
    plannedQuantity: null,
    plannedUnitCost: null,
    plannedAmount: null,
    quotedQuantity: line.quantity != null && line.quantity !== '' ? line.quantity : 1,
    quotedUnitCost: line.unitCost != null && line.unitCost !== '' ? line.unitCost : '',
    quotedAmount: line.amount != null && line.amount !== '' ? line.amount : '',
    sortOrder: line.sortOrder ?? plannedEntryLines.length + idx + 1,
  }));

  return {
    projectId,
    plannedLineCount: plannedLines.length,
    lines: [...plannedEntryLines, ...supplementaryEntryLines],
    existingQuotation: quotation
      ? {
          quotationId: quotation.quotationId,
          supplierName: quotation.supplierName || '',
          referenceNo: quotation.referenceNo || '',
          status: quotation.status,
          updatedAt: quotation.updatedAt,
        }
      : null,
    extraLineTypes: [
      { value: 'provisional', label: 'Provisional sum' },
      { value: 'pc_sum', label: 'PC sum' },
      { value: 'extra', label: 'Additional item' },
    ],
  };
}

async function writeProjectQuoteWorkbook(res, projectId, plannedLines) {
  const workbook = new ExcelJS.Workbook();
  const instructions = workbook.addWorksheet('Instructions');
  instructions.addRow(['Contracted quotation template — tied to project planned BQ']);
  instructions.addRow(['']);
  instructions.addRow(['1. Do NOT change planned_bq_item_id, milestone_name, activity_name, planned_quantity, or planned_unit_cost on planned rows.']);
  instructions.addRow(['2. Planned quantity and unit cost are from the project BQ baseline (read-only reference).']);
  instructions.addRow(['3. For planned BQ rows, quoted quantity always matches planned quantity (do not change). Enter quoted_unit_cost; quoted_amount calculates as planned quantity × unit cost.']);
  instructions.addRow(['4. For a lump sum, set quoted_quantity to 1 and quoted_unit_cost to the total amount.']);
  instructions.addRow(['5. To add provisional sums, append rows at the bottom with line_type = provisional or pc_sum.']);

  const sheet = workbook.addWorksheet('Quote Lines');
  sheet.columns = [
    { header: 'planned_bq_item_id', key: 'planned_bq_item_id', width: 18 },
    { header: 'line_type', key: 'line_type', width: 14 },
    { header: 'milestone_name', key: 'milestone_name', width: 24 },
    { header: 'activity_name', key: 'activity_name', width: 32 },
    { header: 'unit_of_measure', key: 'unit_of_measure', width: 14 },
    { header: 'planned_quantity', key: 'planned_quantity', width: 14 },
    { header: 'planned_unit_cost', key: 'planned_unit_cost', width: 16 },
    { header: 'planned_amount', key: 'planned_amount', width: 14 },
    { header: 'quoted_quantity', key: 'quoted_quantity', width: 14 },
    { header: 'quoted_unit_cost', key: 'quoted_unit_cost', width: 16 },
    { header: 'quoted_amount', key: 'quoted_amount', width: 16 },
    { header: 'sort_order', key: 'sort_order', width: 10 },
  ];

  const amountNumFmt = '#,##0.00';
  const applyQtyUnitAmountFormulas = (rowNum, plannedQty, plannedUnit, quotedQty) => {
    const plannedProduct = Number(plannedQty) * Number(plannedUnit);
    const plannedResult = Number.isFinite(plannedProduct) && plannedProduct !== 0
      ? plannedProduct
      : undefined;
    sheet.getCell(`H${rowNum}`).value = {
      formula: `IF(AND(F${rowNum}<>"",G${rowNum}<>""),F${rowNum}*G${rowNum},"")`,
      result: plannedResult,
    };
    sheet.getCell(`H${rowNum}`).numFmt = amountNumFmt;
    sheet.getCell(`K${rowNum}`).value = {
      formula: `IF(AND(I${rowNum}<>"",J${rowNum}<>""),I${rowNum}*J${rowNum},"")`,
      result: Number(quotedQty) && Number.isFinite(Number(quotedQty)) ? 0 : undefined,
    };
    sheet.getCell(`K${rowNum}`).numFmt = amountNumFmt;
    sheet.getCell(`G${rowNum}`).numFmt = amountNumFmt;
    sheet.getCell(`J${rowNum}`).numFmt = amountNumFmt;
  };

  plannedLines.forEach((row, index) => {
    const plannedQty = row.quantity ?? '';
    const plannedUnit = row.unitCost ?? '';
    const quotedQty = row.quantity ?? '';
    const added = sheet.addRow({
      planned_bq_item_id: row.plannedBqItemId,
      line_type: 'planned',
      milestone_name: row.milestoneName || '',
      activity_name: row.activityName,
      unit_of_measure: row.unitOfMeasure || '',
      planned_quantity: plannedQty,
      planned_unit_cost: plannedUnit,
      planned_amount: '',
      quoted_quantity: quotedQty,
      quoted_unit_cost: '',
      quoted_amount: '',
      sort_order: row.sortOrder ?? index + 1,
    });
    applyQtyUnitAmountFormulas(added.number, plannedQty, plannedUnit, quotedQty);
  });

  const provisional = sheet.addRow({
    planned_bq_item_id: '',
    line_type: 'provisional',
    milestone_name: 'Provisional sums',
    activity_name: 'Provisional sum (example — rename description only)',
    unit_of_measure: 'lump sum',
    planned_quantity: '',
    planned_unit_cost: '',
    planned_amount: '',
    quoted_quantity: 1,
    quoted_unit_cost: '',
    quoted_amount: '',
    sort_order: plannedLines.length + 1,
  });
  applyQtyUnitAmountFormulas(provisional.number, '', '', 1);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="quote_template_project_${projectId}.xlsx"`);
  await workbook.xlsx.write(res);
  return res.end();
}

function normalizeQuotationImportRow(row, index = 0) {
  const lineType = normalizeQuotationLineType(pickRowValue(row, ['line_type', 'line type', 'type']) || 'planned');
  const plannedQty = parseScopeNumber(pickRowValue(row, ['planned_quantity', 'planned_qty']));
  const plannedUnit = parseScopeNumber(pickRowValue(row, ['planned_unit_cost', 'planned_rate']));
  let quotedQty = parseScopeNumber(pickRowValue(row, ['quoted_quantity', 'quantity', 'qty']));
  if (lineType === 'planned' && plannedQty != null) {
    quotedQty = plannedQty;
  } else if (quotedQty == null && lineType === 'planned' && plannedQty != null) {
    quotedQty = plannedQty;
  }
  const quotedUnit = parseScopeNumber(pickRowValue(row, ['quoted_unit_cost', 'unit_cost', 'rate', 'quoted_unit_rate']));
  let amount = parseScopeNumber(pickRowValue(row, ['quoted_amount', 'amount', 'quoted_amount_kes', 'total']));
  if (amount == null && quotedQty != null && quotedUnit != null) amount = quotedQty * quotedUnit;
  const plannedBqItemId = parseScopeNumber(pickRowValue(row, ['planned_bq_item_id', 'bq_item_id', 'planned_id']));
  const activityName = pickRowValue(row, ['activity_name', 'activity', 'item', 'work_item']);
  if (!activityName && lineType === 'planned' && !plannedBqItemId) return null;
  if (!activityName && lineType !== 'planned') return null;
  return {
    plannedBqItemId,
    lineType,
    milestoneName: pickRowValue(row, ['milestone_name', 'milestone', 'phase']) || null,
    activityName: activityName || 'Unnamed item',
    description: pickRowValue(row, ['description', 'remarks', 'notes']),
    unitOfMeasure: pickRowValue(row, ['unit_of_measure', 'uom', 'unit']),
    quantity: quotedQty,
    unitCost: quotedUnit,
    amount,
    plannedQuantity: plannedQty,
    plannedUnitCost: plannedUnit,
    sortOrder: parseScopeNumber(pickRowValue(row, ['sort_order', 'order', 'seq'])) ?? index + 1,
  };
}

function validateAndMergeQuotationImport(plannedLines, importLines, options = {}) {
  const strictNames = options.strictNames !== false;
  const fillMissingPlanned = options.fillMissingPlanned !== false;
  const plannedById = new Map(plannedLines.map((p) => [String(p.plannedBqItemId), p]));
  const errors = [];
  const warnings = [];
  const merged = [];
  const seenPlannedIds = new Set();

  for (let i = 0; i < (importLines || []).length; i += 1) {
    const line = importLines[i];
    const lineType = normalizeQuotationLineType(line.lineType);
    if (lineType === 'planned') {
      if (!line.plannedBqItemId) {
        errors.push(`Row ${i + 2}: planned rows must include planned_bq_item_id.`);
        continue;
      }
      const planned = plannedById.get(String(line.plannedBqItemId));
      if (!planned) {
        errors.push(`Row ${i + 2}: unknown planned_bq_item_id ${line.plannedBqItemId}.`);
        continue;
      }
      if (strictNames && !namesMatchPlanned(planned, line)) {
        errors.push(`Row ${i + 2}: do not rename milestone/activity for BQ #${line.plannedBqItemId}. Use the project template.`);
        continue;
      }
      if (seenPlannedIds.has(String(line.plannedBqItemId))) {
        errors.push(`Row ${i + 2}: duplicate quote for planned_bq_item_id ${line.plannedBqItemId}.`);
        continue;
      }
      seenPlannedIds.add(String(line.plannedBqItemId));
      merged.push({
        plannedBqItemId: planned.plannedBqItemId,
        lineType: 'planned',
        milestoneName: planned.milestoneName,
        activityName: planned.activityName,
        description: line.description || planned.description || null,
        unitOfMeasure: line.unitOfMeasure || planned.unitOfMeasure || null,
        quantity: planned.quantity ?? line.quantity,
        unitCost: line.unitCost,
        amount: line.amount ?? 0,
        sortOrder: line.sortOrder ?? planned.sortOrder,
        mapped: true,
        plannedAmount: planned.budgetAmount,
      });
      continue;
    }

    if (!String(line.activityName || '').trim()) {
      errors.push(`Row ${i + 2}: activity_name is required for ${lineType} lines.`);
      continue;
    }
    merged.push({
      plannedBqItemId: null,
      lineType,
      milestoneName: line.milestoneName || (lineType === 'pc_sum' ? 'PC sums' : 'Provisional sums'),
      activityName: line.activityName,
      description: line.description || null,
      unitOfMeasure: line.unitOfMeasure || null,
      quantity: line.quantity,
      unitCost: line.unitCost,
      amount: line.amount ?? 0,
      sortOrder: line.sortOrder ?? merged.length + 1,
      mapped: false,
      plannedAmount: null,
    });
  }

  if (fillMissingPlanned) {
    for (const planned of plannedLines) {
      const key = String(planned.plannedBqItemId);
      if (seenPlannedIds.has(key)) continue;
      warnings.push(`Planned item "${planned.activityName}" was not quoted — imported as zero.`);
      merged.push({
        plannedBqItemId: planned.plannedBqItemId,
        lineType: 'planned',
        milestoneName: planned.milestoneName,
        activityName: planned.activityName,
        description: planned.description || null,
        unitOfMeasure: planned.unitOfMeasure || null,
        quantity: null,
        unitCost: null,
        amount: 0,
        sortOrder: planned.sortOrder,
        mapped: true,
        plannedAmount: planned.budgetAmount,
      });
    }
  }

  merged.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const importTotal = merged.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const unmappedCount = merged.filter((row) => row.lineType !== 'planned' || !row.mapped).length;

  return { lines: merged, errors, warnings, importTotal, unmappedCount };
}

function parseQuotationExcelBuffer(buffer, plannedLines = []) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const bqSheet = sheetRowsFromWorkbook(workbook, ['Quote Lines', 'Quoted Lines', 'BQ Lines', 'BQ', 'bill_of_quantities']);
  const parsedRows = bqSheet.rows
    .map((row, index) => normalizeQuotationImportRow(row, index))
    .filter(Boolean);
  if (!parsedRows.length) {
    return {
      lines: [],
      errors: ['No quote lines found. Use the project quote template (Quote Lines sheet).'],
      warnings: [],
      importTotal: 0,
      unmappedCount: 0,
      sheets: { bq: bqSheet.sheetName || null },
    };
  }
  const result = validateAndMergeQuotationImport(plannedLines, parsedRows);
  return {
    ...result,
    sheets: { bq: bqSheet.sheetName || null },
  };
}

function quotationLinesForComparison(quotedLines) {
  return (quotedLines || []).filter((row) => normalizeQuotationLineType(row.lineType) === 'planned');
}

function quotationSupplementaryLines(quotedLines) {
  return (quotedLines || []).filter((row) => normalizeQuotationLineType(row.lineType) !== 'planned');
}

async function fetchPlannedBqLines(projectId) {
  await ensureProcurementScopeTables();
  const queries = [
    `SELECT
        id AS "plannedBqItemId",
        activity_name AS "activityName",
        milestone_name AS "milestoneName",
        remarks AS description,
        unit_of_measure AS "unitOfMeasure",
        quantity,
        unit_cost AS "unitCost",
        budget_amount AS "budgetAmount",
        sort_order AS "sortOrder",
        COALESCE(progress_percent, 0) AS "progressPercent"
     FROM project_bq_items
     WHERE project_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sort_order ASC NULLS LAST, id ASC`,
    `SELECT
        id AS "plannedBqItemId",
        activity_name AS "activityName",
        milestone_name AS "milestoneName",
        remarks AS description,
        unit_of_measure AS "unitOfMeasure",
        quantity,
        unit_cost AS "unitCost",
        budget_amount AS "budgetAmount",
        sort_order AS "sortOrder",
        0::numeric AS "progressPercent"
     FROM project_bq_items
     WHERE project_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sort_order ASC NULLS LAST, id ASC`,
    `SELECT
        id AS "plannedBqItemId",
        activity_name AS "activityName",
        milestone_name AS "milestoneName",
        NULL::text AS description,
        NULL::text AS "unitOfMeasure",
        NULL::numeric AS quantity,
        NULL::numeric AS "unitCost",
        budget_amount AS "budgetAmount",
        sort_order AS "sortOrder",
        0::numeric AS "progressPercent"
     FROM project_bq_items
     WHERE project_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sort_order ASC NULLS LAST, id ASC`,
  ];
  for (const sql of queries) {
    try {
      return rowsOf(await pool.query(sql, [projectId]));
    } catch (error) {
      if (!isSchemaError(error)) throw error;
    }
  }
  return [];
}

async function fetchMilestoneSequenceMap(projectId) {
  await ensureProcurementScopeTables();
  const queries = [
    `SELECT
        milestone_name AS "milestoneName",
        COALESCE(sequence_order, 9999) AS "sequenceOrder"
     FROM project_milestones
     WHERE project_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sequence_order ASC NULLS LAST, milestone_id ASC`,
    `SELECT
        milestone_name AS "milestoneName",
        COALESCE(sequence_order, 9999) AS "sequenceOrder"
     FROM project_milestones
     WHERE project_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sequence_order ASC NULLS LAST, milestone_name ASC`,
  ];
  for (const sql of queries) {
    try {
      const rows = rowsOf(await pool.query(sql, [projectId]));
      const map = new Map();
      rows.forEach((row, index) => {
        const key = String(row.milestoneName || '').trim().toLowerCase();
        if (key && !map.has(key)) {
          map.set(key, Number(row.sequenceOrder ?? index + 1));
        }
      });
      return map;
    } catch (error) {
      if (!isSchemaError(error)) throw error;
    }
  }
  return new Map();
}

function buildCumulativeCurve(groups, total) {
  const safeTotal = Number(total) > 0 ? Number(total) : 0;
  let running = 0;
  return (groups || []).map((group) => {
    running += Number(group.total || 0);
    return {
      milestoneName: group.milestoneName,
      sequenceOrder: group.sequenceOrder,
      amount: Number(group.total || 0),
      cumulativeAmount: running,
      cumulativePercent: safeTotal > 0 ? Number(((running / safeTotal) * 100).toFixed(2)) : 0,
    };
  });
}

async function fetchProjectFinancials(projectId) {
  const defaults = {
    allocatedAmount: 0,
    disbursedAmount: 0,
    contractedAmount: 0,
    averageBqProgress: 0,
  };
  const queries = [
    `SELECT
        COALESCE(
          CASE
            WHEN (p.budget->>'allocated_amount_kes') ~ '${ALLOCATED_KES_REGEX}'
              THEN (p.budget->>'allocated_amount_kes')::numeric
            ELSE 0
          END, 0
        ) AS "allocatedAmount",
        COALESCE(
          CASE
            WHEN (p.budget->>'disbursed_amount_kes') ~ '${ALLOCATED_KES_REGEX}'
              THEN (p.budget->>'disbursed_amount_kes')::numeric
            ELSE 0
          END, 0
        ) AS "disbursedAmount",
        COALESCE(
          CASE
            WHEN (p.budget->>'contracted') ~ '${ALLOCATED_KES_REGEX}'
              THEN (p.budget->>'contracted')::numeric
            ELSE 0
          END, 0
        ) AS "contractedAmount",
        COALESCE(
          (SELECT AVG(COALESCE(progress_percent, 0))
           FROM project_bq_items
           WHERE project_id = p.project_id AND COALESCE(voided, false) = false),
          0
        ) AS "averageBqProgress"
     FROM projects p
     WHERE p.project_id = $1 AND COALESCE(p.voided, false) = false
     LIMIT 1`,
    `SELECT
        COALESCE(
          CASE
            WHEN (p.budget->>'allocated_amount_kes') ~ '${ALLOCATED_KES_REGEX}'
              THEN (p.budget->>'allocated_amount_kes')::numeric
            ELSE 0
          END, 0
        ) AS "allocatedAmount",
        COALESCE(
          CASE
            WHEN (p.budget->>'disbursed_amount_kes') ~ '${ALLOCATED_KES_REGEX}'
              THEN (p.budget->>'disbursed_amount_kes')::numeric
            ELSE 0
          END, 0
        ) AS "disbursedAmount",
        COALESCE(
          CASE
            WHEN (p.budget->>'contracted') ~ '${ALLOCATED_KES_REGEX}'
              THEN (p.budget->>'contracted')::numeric
            ELSE 0
          END, 0
        ) AS "contractedAmount",
        0::numeric AS "averageBqProgress"
     FROM projects p
     WHERE p.project_id = $1 AND COALESCE(p.voided, false) = false
     LIMIT 1`,
    `SELECT
        COALESCE(p."costOfProject", 0) AS "allocatedAmount",
        COALESCE(p."paidOut", 0) AS "disbursedAmount",
        COALESCE(p."Contracted", 0) AS "contractedAmount",
        0::numeric AS "averageBqProgress"
     FROM projects p
     WHERE p.id = $1 AND COALESCE(p.voided, false) = false
     LIMIT 1`,
  ];
  for (const sql of queries) {
    try {
      const row = rowsOf(await pool.query(sql, [projectId]))[0];
      if (!row) continue;
      return {
        allocatedAmount: Number(row.allocatedAmount || 0),
        disbursedAmount: Number(row.disbursedAmount || 0),
        contractedAmount: Number(row.contractedAmount || 0),
        averageBqProgress: Number(row.averageBqProgress || 0),
      };
    } catch (error) {
      if (!isSchemaError(error)) throw error;
    }
  }
  return defaults;
}

function buildPlannedLineComparisons(plannedLines) {
  return (plannedLines || []).map((row) => ({
    plannedBqItemId: row.plannedBqItemId,
    milestoneName: row.milestoneName,
    activityName: row.activityName,
    plannedAmount: row.budgetAmount != null ? Number(row.budgetAmount) : null,
    quotedAmount: null,
    varianceAmount: null,
    variancePercent: null,
    mapped: true,
  }));
}

function mapLinesToPlanned(plannedLines, importLines) {
  const plannedById = new Map(plannedLines.map((p) => [String(p.plannedBqItemId), p]));
  const plannedByKey = new Map(
    plannedLines.map((p) => [
      `${String(p.milestoneName || '').trim().toLowerCase()}|${String(p.activityName || '').trim().toLowerCase()}`,
      p,
    ])
  );

  return (importLines || []).map((line) => {
    const plannedId = line.plannedBqItemId ?? line.planned_bq_item_id;
    let planned = plannedId != null ? plannedById.get(String(plannedId)) : null;
    if (!planned) {
      const key = `${String(line.milestoneName || '').trim().toLowerCase()}|${String(line.activityName || '').trim().toLowerCase()}`;
      planned = plannedByKey.get(key) || null;
    }
    return {
      ...line,
      plannedBqItemId: planned?.plannedBqItemId ?? line.plannedBqItemId ?? null,
      mapped: Boolean(planned),
      plannedAmount: planned?.budgetAmount ?? null,
      varianceAmount: planned?.budgetAmount != null && line.amount != null
        ? Number(line.amount) - Number(planned.budgetAmount)
        : null,
    };
  });
}

async function fetchQuotationById(projectId, quotationId) {
  try {
    const header = rowsOf(await pool.query(
      `SELECT
          q.id AS "quotationId",
          q.project_id AS "projectId",
          q.contractor_id AS "contractorId",
          q.quotation_type AS "quotationType",
          q.status,
          q.title,
          q.supplier_name AS "supplierName",
          q.reference_no AS "referenceNo",
          q.total_amount AS "totalAmount",
          q.notes,
          q.created_at AS "createdAt",
          q.updated_at AS "updatedAt"
       FROM procurement_quotations q
       WHERE q.id = $1 AND q.project_id = $2 AND COALESCE(q.voided, false) = false
       LIMIT 1`,
      [quotationId, projectId]
    ))[0];
    if (!header) return null;

    const lines = rowsOf(await pool.query(
      `SELECT
          l.id AS "lineId",
          l.planned_bq_item_id AS "plannedBqItemId",
          COALESCE(l.line_type, 'planned') AS "lineType",
          l.milestone_name AS "milestoneName",
          l.activity_name AS "activityName",
          l.description,
          l.unit_of_measure AS "unitOfMeasure",
          l.quantity,
          l.unit_cost AS "unitCost",
          l.amount,
          l.sort_order AS "sortOrder"
       FROM procurement_quotation_lines l
       WHERE l.quotation_id = $1 AND COALESCE(l.voided, false) = false
       ORDER BY l.sort_order ASC NULLS LAST, l.id ASC`,
      [quotationId]
    ));
    return { ...header, lines };
  } catch (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
}

async function listProjectQuotations(projectId) {
  return rowsOf(await pool.query(
    `SELECT
        q.id AS "quotationId",
        q.quotation_type AS "quotationType",
        q.status,
        q.title,
        q.supplier_name AS "supplierName",
        q.reference_no AS "referenceNo",
        q.total_amount AS "totalAmount",
        q.created_at AS "createdAt",
        q.updated_at AS "updatedAt",
        (SELECT COUNT(*)::int
         FROM procurement_quotation_lines l
         WHERE l.quotation_id = q.id AND COALESCE(l.voided, false) = false) AS "lineCount"
     FROM procurement_quotations q
     WHERE q.project_id = $1 AND COALESCE(q.voided, false) = false
     ORDER BY q.updated_at DESC NULLS LAST, q.id DESC`,
    [projectId]
  ));
}

async function insertQuotationWithLines(projectId, header, lines, actorId = null) {
  const totalAmount = (lines || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const insertHeader = rowsOf(await pool.query(
    `INSERT INTO procurement_quotations (
        project_id, contractor_id, quotation_type, status, title, supplier_name,
        reference_no, total_amount, notes, created_by, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
     RETURNING id AS "quotationId"`,
    [
      projectId,
      header.contractorId || null,
      header.quotationType || 'awarded',
      header.status || 'draft',
      header.title || null,
      header.supplierName || null,
      header.referenceNo || null,
      totalAmount,
      header.notes || null,
      actorId,
    ]
  ))[0];

  const quotationId = insertHeader.quotationId;
  let lineCount = 0;
  for (const line of lines || []) {
    if (!String(line.activityName || '').trim()) continue;
    await pool.query(
      `INSERT INTO procurement_quotation_lines (
          quotation_id, planned_bq_item_id, line_type, milestone_name, activity_name, description,
          unit_of_measure, quantity, unit_cost, amount, sort_order, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
      [
        quotationId,
        line.plannedBqItemId || null,
        normalizeQuotationLineType(line.lineType),
        line.milestoneName || null,
        line.activityName,
        line.description || null,
        line.unitOfMeasure || null,
        line.quantity == null ? null : Number(line.quantity),
        line.unitCost == null ? null : Number(line.unitCost),
        line.amount == null ? null : Number(line.amount),
        Number.isFinite(Number(line.sortOrder)) ? Number(line.sortOrder) : lineCount,
      ]
    );
    lineCount += 1;
  }

  return fetchQuotationById(projectId, quotationId);
}

function buildLineComparisonsFromQuotation(plannedLines, quotationLines) {
  const byPlannedId = new Map(
    (quotationLines || [])
      .filter((line) => line.plannedBqItemId != null)
      .map((line) => [String(line.plannedBqItemId), line])
  );
  const plannedComparisons = (plannedLines || []).map((planned) => {
    const quoted = byPlannedId.get(String(planned.plannedBqItemId));
    const plannedAmount = planned.budgetAmount != null ? Number(planned.budgetAmount) : null;
    const quotedAmount = quoted?.amount != null ? Number(quoted.amount) : null;
    return {
      plannedBqItemId: planned.plannedBqItemId,
      lineType: 'planned',
      milestoneName: planned.milestoneName,
      activityName: planned.activityName,
      plannedAmount,
      quotedAmount,
      varianceAmount: plannedAmount != null && quotedAmount != null ? quotedAmount - plannedAmount : null,
      variancePercent: plannedAmount > 0 && quotedAmount != null
        ? Number((((quotedAmount - plannedAmount) / plannedAmount) * 100).toFixed(2))
        : null,
      mapped: Boolean(quoted),
    };
  });
  const supplementary = quotationSupplementaryLines(quotationLines).map((line) => ({
    plannedBqItemId: null,
    lineType: normalizeQuotationLineType(line.lineType),
    milestoneName: line.milestoneName,
    activityName: line.activityName,
    plannedAmount: null,
    quotedAmount: line.amount != null ? Number(line.amount) : null,
    varianceAmount: null,
    variancePercent: null,
    mapped: false,
  }));
  return [...plannedComparisons, ...supplementary];
}

function entryLinesToImportPayload(entryLines) {
  return (entryLines || []).map((line, index) => {
    const isPlanned = normalizeQuotationLineType(line.lineType || 'planned') === 'planned' && line.plannedBqItemId;
    const plannedQty = line.plannedQuantity === '' || line.plannedQuantity == null
      ? null
      : Number(line.plannedQuantity);
    let quotedQty = line.quotedQuantity === '' || line.quotedQuantity == null
      ? null
      : Number(line.quotedQuantity);
    if (isPlanned) {
      quotedQty = plannedQty;
    } else if (quotedQty == null) {
      quotedQty = 1;
    }
    const quotedUnit = line.quotedUnitCost === '' || line.quotedUnitCost == null
      ? null
      : Number(line.quotedUnitCost);
    let amount = line.quotedAmount === '' || line.quotedAmount == null
      ? null
      : Number(line.quotedAmount);
    if (amount == null && quotedQty != null && quotedUnit != null) amount = quotedQty * quotedUnit;
    return {
      plannedBqItemId: line.plannedBqItemId || null,
      lineType: normalizeQuotationLineType(line.lineType || 'planned'),
      milestoneName: line.milestoneName || null,
      activityName: line.activityName,
      description: line.description || null,
      unitOfMeasure: line.unitOfMeasure || null,
      quantity: quotedQty,
      unitCost: quotedUnit,
      amount: amount ?? 0,
      sortOrder: line.sortOrder ?? index + 1,
    };
  });
}

async function buildQuotationLinesFromPlanned(projectId) {
  const planned = await fetchPlannedBqLines(projectId);
  return planned.map((row) => ({
    plannedBqItemId: row.plannedBqItemId,
    lineType: 'planned',
    milestoneName: row.milestoneName,
    activityName: row.activityName,
    description: row.description,
    unitOfMeasure: row.unitOfMeasure,
    quantity: row.quantity,
    unitCost: row.unitCost,
    amount: row.budgetAmount,
    sortOrder: row.sortOrder,
    mapped: true,
    plannedAmount: row.budgetAmount,
    varianceAmount: 0,
  }));
}

async function computeScopeQuotationComparison(projectId, quotationId = null) {
  await ensureProcurementScopeTables();
  await ensureProcurementQuotationTables();

  const plannedLines = await fetchPlannedBqLines(projectId);
  const milestoneOrder = await fetchMilestoneSequenceMap(projectId);
  const financials = await fetchProjectFinancials(projectId);

  let quotation = null;
  if (quotationId) {
    quotation = await fetchQuotationById(projectId, quotationId);
  } else {
    try {
      const latest = rowsOf(await pool.query(
        `SELECT id FROM procurement_quotations
         WHERE project_id = $1 AND COALESCE(voided, false) = false
         ORDER BY
           CASE status
             WHEN 'awarded' THEN 0
             WHEN 'submitted' THEN 1
             WHEN 'draft' THEN 2
             ELSE 3
           END,
           updated_at DESC NULLS LAST,
           id DESC
         LIMIT 1`,
        [projectId]
      ))[0];
      if (latest?.id) quotation = await fetchQuotationById(projectId, latest.id);
    } catch (error) {
      if (!isSchemaError(error)) throw error;
    }
  }

  const plannedGroups = groupLinesByMilestone(
    plannedLines.map((row) => ({
      milestoneName: row.milestoneName,
      amount: row.budgetAmount,
    })),
    milestoneOrder
  );
  const plannedTotal = plannedGroups.reduce((sum, g) => sum + g.total, 0);

  if (!quotation) {
    return {
      projectId,
      hasQuotation: false,
      plannedTotal,
      plannedGroups,
      plannedCurve: buildCumulativeCurve(plannedGroups, plannedTotal),
      quotedTotal: 0,
      varianceTotal: 0,
      lineComparisons: buildPlannedLineComparisons(plannedLines),
      financials,
      risk: {
        riskLevel: 'none',
        frontLoadIndex: 0,
        alerts: plannedTotal > 0
          ? ['No contracted quotation on file yet.']
          : ['Set up planned scope and BQ lines before comparing quotations.'],
      },
    };
  }

  const quotedLines = quotation.lines || [];
  const plannedQuoteLines = quotationLinesForComparison(quotedLines);
  const quotedGroups = groupLinesByMilestone(
    plannedQuoteLines.map((row) => ({
      milestoneName: row.milestoneName,
      amount: row.amount,
    })),
    milestoneOrder
  );
  const quotedTotal = quotedLines.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const plannedQuotedTotal = plannedQuoteLines.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const frontLoad = plannedTotal > 0 && plannedQuotedTotal > 0
    ? computeFrontLoadRisk(plannedGroups, quotedGroups)
    : {
      riskLevel: 'none',
      frontLoadIndex: 0,
      plannedEarlyPercent: 0,
      quotedEarlyPercent: 0,
      alerts: ['Insufficient planned or quoted totals for front-load analysis.'],
    };
  const paymentBase = quotedTotal > 0 ? quotedTotal : financials.contractedAmount;
  const paymentPercent = paymentBase > 0 ? (financials.disbursedAmount / paymentBase) * 100 : 0;
  const progressPercent = financials.averageBqProgress;

  const alerts = [...(frontLoad.alerts || [])];
  let riskLevel = frontLoad.riskLevel || 'none';
  if (paymentPercent >= 30 && progressPercent < 10) {
    alerts.push(`Payments at ${paymentPercent.toFixed(1)}% of contract while BQ progress is only ${progressPercent.toFixed(1)}%.`);
    riskLevel = 'high';
  } else if (paymentPercent >= 20 && progressPercent < 15 && riskLevel === 'low') {
    riskLevel = 'medium';
    alerts.push('Payment is ahead of physical progress.');
  }

  const lineComparisons = buildLineComparisonsFromQuotation(plannedLines, quotedLines);
  const supplementaryLines = quotationSupplementaryLines(quotedLines);

  return {
    projectId,
    hasQuotation: true,
    quotation: {
      quotationId: quotation.quotationId,
      status: quotation.status,
      supplierName: quotation.supplierName,
      referenceNo: quotation.referenceNo,
      totalAmount: quotation.totalAmount,
    },
    plannedTotal,
    quotedTotal,
    plannedQuotedTotal,
    supplementaryTotal: quotedTotal - plannedQuotedTotal,
    varianceTotal: plannedQuotedTotal - plannedTotal,
    plannedGroups,
    quotedGroups,
    plannedCurve: buildCumulativeCurve(plannedGroups, plannedTotal),
    quotedCurve: buildCumulativeCurve(quotedGroups, quotedTotal),
    lineComparisons,
    supplementaryLines: supplementaryLines.map((line) => ({
      lineType: normalizeQuotationLineType(line.lineType),
      milestoneName: line.milestoneName,
      activityName: line.activityName,
      quotedAmount: Number(line.amount || 0),
    })),
    financials: {
      ...financials,
      paymentPercent: Number(paymentPercent.toFixed(2)),
    },
    risk: {
      ...frontLoad,
      riskLevel,
      alerts,
      paymentPercent: Number(paymentPercent.toFixed(2)),
      progressPercent: Number(progressPercent.toFixed(2)),
    },
  };
}

async function fetchQuotationRiskSummaries(projectIds = []) {
  const ids = [...new Set(projectIds.map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) return new Map();
  await ensureProcurementQuotationTables();
  const summaries = new Map();
  for (const projectId of ids) {
    try {
      const comparison = await computeScopeQuotationComparison(projectId);
      summaries.set(String(projectId), {
        hasQuotation: comparison.hasQuotation,
        quotationStatus: comparison.quotation?.status || null,
        quotedTotal: comparison.quotedTotal || 0,
        plannedTotal: comparison.plannedTotal || 0,
        riskLevel: comparison.risk?.riskLevel || 'none',
        frontLoadIndex: comparison.risk?.frontLoadIndex || 0,
        alertCount: (comparison.risk?.alerts || []).length,
      });
    } catch {
      summaries.set(String(projectId), {
        hasQuotation: false,
        riskLevel: 'none',
        frontLoadIndex: 0,
        alertCount: 0,
      });
    }
  }
  return summaries;
}

async function appendProcurementScopeSummary(projectRows = []) {
  const rows = Array.isArray(projectRows) ? projectRows : [];
  const ids = rows
    .map((row) => Number(row?.projectId))
    .filter((id) => Number.isFinite(id));
  if (!ids.length) return rows;

  try {
    await ensureProcurementScopeTables();
    let summaryRows = [];
    if (isPostgres) {
      summaryRows = rowsOf(await pool.query(
        `SELECT
            project_id AS "projectId",
            COUNT(*)::int AS "bqItemCount",
            COUNT(*) FILTER (WHERE COALESCE(completed, false) = true)::int AS "completedBqItemCount",
            COALESCE(AVG(COALESCE(progress_percent, 0)), 0) AS "averageBqProgress",
            COALESCE(SUM(COALESCE(budget_amount, 0)), 0) AS "bqBudgetAmount",
            COUNT(*) FILTER (WHERE category_bq_template_id IS NOT NULL)::int AS "templateBqItemCount"
         FROM project_bq_items
         WHERE COALESCE(voided, false) = false AND project_id = ANY($1::bigint[])
         GROUP BY project_id`,
        [ids]
      ));
    } else {
      const placeholders = ids.map(() => '?').join(',');
      summaryRows = rowsOf(await pool.query(
        `SELECT
            project_id AS projectId,
            COUNT(*) AS bqItemCount,
            SUM(CASE WHEN COALESCE(completed, 0) = 1 THEN 1 ELSE 0 END) AS completedBqItemCount,
            COALESCE(AVG(COALESCE(progress_percent, 0)), 0) AS averageBqProgress,
            COALESCE(SUM(COALESCE(budget_amount, 0)), 0) AS bqBudgetAmount,
            SUM(CASE WHEN category_bq_template_id IS NOT NULL THEN 1 ELSE 0 END) AS templateBqItemCount
         FROM project_bq_items
         WHERE COALESCE(voided, 0) = 0 AND project_id IN (${placeholders})
         GROUP BY project_id`,
        ids
      ));
    }
    const byProject = new Map(summaryRows.map((row) => [String(row.projectId), row]));
    return rows.map((row) => {
      const summary = byProject.get(String(row.projectId)) || {};
      const bqItemCount = Number(summary.bqItemCount || 0);
      const completedBqItemCount = Number(summary.completedBqItemCount || 0);
      const averageBqProgress = Number(summary.averageBqProgress || 0);
      const bqBudgetAmount = Number(summary.bqBudgetAmount || 0);
      const templateBqItemCount = Number(summary.templateBqItemCount || 0);
      return {
        ...row,
        bqItemCount,
        completedBqItemCount,
        averageBqProgress,
        bqBudgetAmount,
        templateBqItemCount,
        hasPreparedBq: bqItemCount > 0,
      };
    });
  } catch (error) {
    console.warn('Unable to append procurement BQ scope summary:', error?.message || error);
    return rows.map((row) => ({
      ...row,
      bqItemCount: 0,
      completedBqItemCount: 0,
      averageBqProgress: 0,
      bqBudgetAmount: 0,
      templateBqItemCount: 0,
      hasPreparedBq: false,
    }));
  }
}

function normalizeTemplateFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f, i) => ({
      key: String(f?.key || `field_${i + 1}`).trim(),
      label: String(f?.label || f?.key || `Field ${i + 1}`).trim(),
      type: String(f?.type || 'text').trim().toLowerCase(),
      required: Boolean(f?.required),
      weight: Number.isFinite(Number(f?.weight)) ? Number(f.weight) : 0,
      min: f?.min != null && Number.isFinite(Number(f.min)) ? Number(f.min) : null,
      max: f?.max != null && Number.isFinite(Number(f.max)) ? Number(f.max) : null,
      options: Array.isArray(f?.options) ? f.options.map((o) => String(o)) : [],
    }))
    .filter((f) => f.key && f.label);
}

/**
 * Bidder Registry: contact details first, then company/legal fields — matches product UX when DB template row
 * has a different field order (e.g. after import or manual edit). Dedupes by key (first wins).
 */
function orderBidderRegistryTemplateFields(fields) {
  if (!Array.isArray(fields) || !fields.length) return fields;
  const priority = [
    'contactName',
    'contactPhone',
    'contactEmail',
    'companyName',
    'registrationNo',
    'kraPin',
    'agpoCategory',
    'notes',
  ];
  const seen = new Set();
  const byKey = new Map();
  for (const f of fields) {
    const k = String(f?.key || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    byKey.set(k, f);
  }
  const out = [];
  for (const k of priority) {
    if (byKey.has(k)) {
      out.push(byKey.get(k));
      byKey.delete(k);
    }
  }
  for (const f of fields) {
    const k = String(f?.key || '').trim();
    if (k && byKey.has(k)) {
      out.push(byKey.get(k));
      byKey.delete(k);
    }
  }
  return out;
}

/**
 * Remote DBs often have older Contract Signing templates without optional schedule fields.
 * Merge canonical defaults so contractProjectStartDate / duration / end date always appear when missing.
 */
function mergeContractSigningTemplateWithDefaults(fields) {
  if (!Array.isArray(fields)) return [];
  const normalized = normalizeTemplateFields(fields);
  const defaults = normalizeTemplateFields(getDefaultContractSigningFields());
  const byKey = new Map(normalized.map((f) => [f.key, f]));
  const out = [];
  for (const d of defaults) {
    const db = byKey.get(d.key);
    if (db) {
      byKey.delete(d.key);
      out.push({
        ...d,
        ...db,
        key: d.key,
        type: db.type || d.type,
        options: Array.isArray(db.options) && db.options.length ? db.options : d.options,
        min: db.min != null ? db.min : d.min,
        max: db.max != null ? db.max : d.max,
        label: db.label || d.label,
      });
    } else {
      out.push({ ...d });
    }
  }
  for (const f of byKey.values()) {
    out.push(f);
  }
  return out;
}

function scoreAssessment(fields, responses) {
  const out = { score: 0, maxScore: 0, qualified: true, missingRequired: [] };
  const obj = responses && typeof responses === 'object' ? responses : {};
  for (const f of fields) {
    const val = obj[f.key];
    const w = Number.isFinite(Number(f.weight)) ? Number(f.weight) : 0;
    if (w > 0) out.maxScore += w;
    const missing = val === undefined || val === null || String(val).trim() === '';
    if (f.required && missing) {
      out.qualified = false;
      out.missingRequired.push(f.key);
    }
    if (f.type === 'checkbox') {
      const yes = val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true';
      if (yes) out.score += w;
      if (f.required && !yes) out.qualified = false;
    } else if (f.type === 'number') {
      const n = Number(val);
      if (Number.isFinite(n) && w > 0) {
        const min = Number.isFinite(f.min) ? f.min : 0;
        const max = Number.isFinite(f.max) ? f.max : Math.max(min, w);
        const denom = max - min;
        if (denom <= 0) out.score += Math.max(0, Math.min(w, n));
        else out.score += Math.max(0, Math.min(w, ((n - min) / denom) * w));
      }
    } else if (w > 0 && !missing) {
      out.score += w;
    }
  }
  out.score = Math.round(out.score * 100) / 100;
  out.maxScore = Math.round(out.maxScore * 100) / 100;
  return out;
}

async function seedProcurementStagesIfNeeded() {
  let ord = 0;
  for (const label of PROCUREMENT_STAGE_SEED_LABELS) {
    const trimmed = String(label || '').trim();
    if (!trimmed) continue;
    if (isPostgres) {
      await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         SELECT $1::varchar, $2::int, TRUE, FALSE, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM procurement_stages ps
           WHERE COALESCE(ps.voided, false) = false
             AND LOWER(TRIM(ps.label)) = LOWER(TRIM($1::varchar))
         )`,
        [trimmed, ord]
      );
    } else {
      const exists = await pool.query(
        `SELECT id FROM procurement_stages
         WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(?)
         LIMIT 1`,
        [trimmed]
      );
      if (!rowsOf(exists).length) {
        await pool.query(
          `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
           VALUES (?, ?, 1, 0, NOW(), NOW())`,
          [trimmed, ord]
        );
      }
    }
    ord += 1;
  }
}

async function ensureProcurementSchema() {
  // Always ensure scope/quotation DDL — safe to run repeatedly and required after hot deploys.
  await ensureProcurementScopeTables();
  await ensureProcurementQuotationTables();
  if (procurementSchemaEnsured) return;
  await ensureProcurementWorkflowTable();
  await ensureProcurementStagesTable();
  await ensureProcurementAttachmentsTable();
  await ensureProcurementAttachmentsSubjectIdColumn();
  await ensureProcurementChecklistTable();
  await ensureProcurementTemplatesTable();
  await ensureProcurementSubjectsTable();
  await ensureProcurementAssessmentsTable();
  await ensureProcurementGateRulesTable();
  await ensureProcurementGateRulesMinScoreColumn();
  await seedProcurementStagesIfNeeded();
  await ensureBidderRegistryStageInserted();
  await ensureBidderPreQualStageInserted();
  await normalizeDefaultProcurementStageOrder();
  await seedProcurementStageTemplatesIfNeeded();
  // NOTE: We do not auto-overwrite templates here because users may customize stage templates.
  // Use the SQL migration scripts to update seeded templates on existing environments.
  await seedPreQualificationGateRuleIfNeeded();
  await seedBidEvaluationGateRuleIfNeeded();
  procurementSchemaEnsured = true;
}

async function isActiveProcurementStage(stageLabel) {
  const s = String(stageLabel || '').trim();
  if (!s) return false;
  const sql = isPostgres
    ? `SELECT 1 FROM procurement_stages
       WHERE COALESCE(voided, false) = false AND active = true AND label = $1 LIMIT 1`
    : `SELECT 1 FROM procurement_stages
       WHERE COALESCE(voided, 0) = 0 AND COALESCE(active, 0) = 1 AND label = ? LIMIT 1`;
  const r = await pool.query(sql, [s]);
  return rowsOf(r).length > 0;
}

async function duplicateStageLabel(label, excludeId) {
  const s = String(label || '').trim();
  if (!s) return false;
  const ex = excludeId != null && Number.isFinite(Number(excludeId)) ? Number(excludeId) : null;
  const sql =
    ex != null
      ? isPostgres
        ? `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1`
        : `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(?) AND id <> ? LIMIT 1`
      : isPostgres
        ? `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) LIMIT 1`
        : `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(?) LIMIT 1`;
  const params = ex != null ? [s, ex] : [s];
  const r = await pool.query(sql, params);
  return rowsOf(r).length > 0;
}

function mapStageRow(row) {
  if (!row) return null;
  const active =
    row.active === true ||
    row.active === 1 ||
    row.active === '1' ||
    String(row.active).toLowerCase() === 'true';
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order != null ? Number(row.sort_order) : 0,
    active,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

router.get('/stages', async (req, res) => {
  try {
    try {
      await ensureProcurementSchema();
    } catch (schemaErr) {
      console.warn('Procurement stages schema ensure failed; returning fallback seed labels:', schemaErr?.message || schemaErr);
      const fallbackRows = PROCUREMENT_STAGE_SEED_LABELS.map((label, idx) => ({
        id: -(idx + 1),
        label,
        sortOrder: idx,
        active: true,
        createdAt: null,
        updatedAt: null,
      }));
      return res.status(200).json(fallbackRows);
    }
    const includeInactive =
      String(req.query.all || '').trim() === '1' || String(req.query.all || '').toLowerCase() === 'true';
    const sql = includeInactive
      ? isPostgres
        ? `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages WHERE COALESCE(voided, false) = false
           ORDER BY sort_order ASC, id ASC`
        : `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages WHERE COALESCE(voided, 0) = 0
           ORDER BY sort_order ASC, id ASC`
      : isPostgres
        ? `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages
           WHERE COALESCE(voided, false) = false AND COALESCE(active, true) = true
           ORDER BY sort_order ASC, id ASC`
        : `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages
           WHERE COALESCE(voided, 0) = 0 AND COALESCE(active, 1) = 1
           ORDER BY sort_order ASC, id ASC`;
    const result = await pool.query(sql);
    const rows = rowsOf(result).map(mapStageRow);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Error listing procurement stages:', error);
    const fallbackRows = PROCUREMENT_STAGE_SEED_LABELS.map((label, idx) => ({
      id: -(idx + 1),
      label,
      sortOrder: idx,
      active: true,
      createdAt: null,
      updatedAt: null,
    }));
    return res.status(200).json(fallbackRows);
  }
});

router.post('/stages', async (req, res) => {
  try {
    await ensureProcurementSchema();
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ message: 'label is required.' });
    if (await duplicateStageLabel(label, null)) {
      return res.status(409).json({ message: 'A stage with this label already exists.' });
    }
    let sortOrder = Number(req.body?.sort_order ?? req.body?.sortOrder);
    if (!Number.isFinite(sortOrder)) sortOrder = 0;
    const activeRaw = req.body?.active;
    const active =
      activeRaw === undefined || activeRaw === null ? true : Boolean(activeRaw === true || activeRaw === 1 || activeRaw === '1');

    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())
         RETURNING id, label, sort_order, active, created_at, updated_at`,
        [label, sortOrder, active]
      );
      return res.status(201).json(mapStageRow(rowsOf(result)[0]));
    }
    const ins = await pool.query(
      `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
       VALUES (?, ?, ?, 0, NOW(), NOW())`,
      [label, sortOrder, active ? 1 : 0]
    );
    const insertId = ins?.insertId ?? ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, label, sort_order, active, created_at, updated_at FROM procurement_stages WHERE id = ?`,
      [insertId]
    );
    return res.status(201).json(mapStageRow(rowsOf(sel)[0]));
  } catch (error) {
    console.error('Error creating procurement stage:', error);
    return res.status(500).json({ message: 'Error creating procurement stage', error: error.message });
  }
});

router.patch('/stages/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid stage id.' });
  try {
    await ensureProcurementSchema();
    const existing = await pool.query(
      isPostgres
        ? `SELECT id FROM procurement_stages WHERE id = $1 AND COALESCE(voided, false) = false`
        : `SELECT id FROM procurement_stages WHERE id = ? AND COALESCE(voided, 0) = 0`,
      [id]
    );
    if (!rowsOf(existing).length) return res.status(404).json({ message: 'Stage not found.' });

    const label =
      req.body?.label !== undefined ? String(req.body.label || '').trim() : undefined;
    if (label === '')
      return res.status(400).json({ message: 'label cannot be empty.' });
    if (label && (await duplicateStageLabel(label, id))) {
      return res.status(409).json({ message: 'A stage with this label already exists.' });
    }

    let sortOrder = req.body?.sort_order ?? req.body?.sortOrder;
    sortOrder = sortOrder !== undefined && sortOrder !== null ? Number(sortOrder) : undefined;

    let active = req.body?.active;
    if (active !== undefined && active !== null) {
      active = Boolean(active === true || active === 1 || active === '1');
    }

    if (isPostgres) {
      const sets = [];
      const vals = [];
      let i = 1;
      if (label !== undefined) {
        sets.push(`label = $${i++}`);
        vals.push(label);
      }
      if (sortOrder !== undefined && Number.isFinite(sortOrder)) {
        sets.push(`sort_order = $${i++}`);
        vals.push(sortOrder);
      }
      if (active !== undefined) {
        sets.push(`active = $${i++}`);
        vals.push(active);
      }
      if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
      sets.push('updated_at = NOW()');
      vals.push(id);
      const q = `UPDATE procurement_stages SET ${sets.join(', ')} WHERE id = $${i} AND COALESCE(voided, false) = false
                 RETURNING id, label, sort_order, active, created_at, updated_at`;
      const result = await pool.query(q, vals);
      return res.status(200).json(mapStageRow(rowsOf(result)[0]));
    }

    const sets = [];
    const vals = [];
    if (label !== undefined) {
      sets.push('label = ?');
      vals.push(label);
    }
    if (sortOrder !== undefined && Number.isFinite(sortOrder)) {
      sets.push('sort_order = ?');
      vals.push(sortOrder);
    }
    if (active !== undefined) {
      sets.push('active = ?');
      vals.push(active ? 1 : 0);
    }
    if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
    sets.push('updated_at = NOW()');
    vals.push(id);
    await pool.query(`UPDATE procurement_stages SET ${sets.join(', ')} WHERE id = ? AND COALESCE(voided, 0) = 0`, vals);
    const sel = await pool.query(
      `SELECT id, label, sort_order, active, created_at, updated_at FROM procurement_stages WHERE id = ?`,
      [id]
    );
    return res.status(200).json(mapStageRow(rowsOf(sel)[0]));
  } catch (error) {
    console.error('Error updating procurement stage:', error);
    return res.status(500).json({ message: 'Error updating procurement stage', error: error.message });
  }
});

router.delete('/stages/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid stage id.' });
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const result = await pool.query(
        `UPDATE procurement_stages SET voided = true, updated_at = NOW()
         WHERE id = $1 AND COALESCE(voided, false) = false
         RETURNING id`,
        [id]
      );
      if (!rowsOf(result).length) return res.status(404).json({ message: 'Stage not found.' });
    } else {
      const upd = await pool.query(
        `UPDATE procurement_stages SET voided = 1, updated_at = NOW()
         WHERE id = ? AND COALESCE(voided, 0) = 0`,
        [id]
      );
      if (!upd?.affectedRows && !upd?.changedRows) {
        const check = await pool.query(`SELECT id FROM procurement_stages WHERE id = ?`, [id]);
        if (!rowsOf(check).length) return res.status(404).json({ message: 'Stage not found.' });
      }
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error removing procurement stage:', error);
    return res.status(500).json({ message: 'Error removing procurement stage', error: error.message });
  }
});

/** Projects that finished procurement (contract signed / handoff). Historical workflow rows remain on each project. */
router.get('/projects/completed-history', async (req, res) => {
  if (!isPostgres) return res.status(200).json([]);
  try {
    await ensureProcurementSchema();
    const result = await pool.query(
      `SELECT
         p.project_id AS "projectId",
         p.name AS "projectName",
         COALESCE(p.progress->>'status', '') AS "projectStatus",
         p.progress->>'procurement_completed_at' AS "procurementCompletedAt",
         p.progress->>'procurement_previous_status' AS "procurementPreviousStatus",
         NULLIF(TRIM(p.progress->>'procurement_awarded_contractor_id'), '') AS "awardedContractorId",
         wf.stage AS "lastWorkflowStage",
         wf.decision AS "lastWorkflowDecision",
         wf.updated_at AS "lastWorkflowAt",
         (
           EXISTS (
             SELECT 1 FROM project_procurement_workflow w
             WHERE w.project_id = p.project_id AND COALESCE(w.voided, false) = false
               AND LOWER(TRIM(w.stage)) = LOWER(TRIM($1::text))
           )
           OR EXISTS (
             SELECT 1 FROM procurement_stage_subjects s
             WHERE s.project_id = p.project_id AND COALESCE(s.voided, false) = false
               AND LOWER(TRIM(s.stage)) = LOWER(TRIM($1::text))
           )
           OR EXISTS (
             SELECT 1 FROM procurement_attachments a
             WHERE a.project_id = p.project_id AND COALESCE(a.voided, false) = false
               AND LOWER(TRIM(a.stage)) = LOWER(TRIM($1::text))
           )
         ) AS "hasPurchaseOrderRecorded"
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT stage, decision, updated_at
         FROM project_procurement_workflow w
         WHERE w.project_id = p.project_id AND COALESCE(w.voided, false) = false
         ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
         LIMIT 1
       ) wf ON true
       WHERE COALESCE(p.voided, false) = false
         AND NULLIF(TRIM(COALESCE(p.progress->>'procurement_completed_at', '')), '') IS NOT NULL
       ORDER BY (p.progress->>'procurement_completed_at') DESC NULLS LAST`,
      [STAGE_PURCHASE_ORDER_ISSUED]
    );
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error listing completed procurements:', error);
    return res.status(500).json({ message: 'Error listing completed procurements', error: error.message });
  }
});

router.get('/projects', async (req, res) => {
  try {
    let schemaReady = true;
    try {
      await ensureProcurementSchema();
    } catch (schemaErr) {
      schemaReady = false;
      console.warn('Procurement schema ensure failed; continuing with projects-only fallback:', schemaErr?.message || schemaErr);
    }
    if (isPostgres) {
      const postgresQueries = [
        `
          SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            p.category_id AS "categoryId",
            c."categoryName" AS "categoryName",
            COALESCE(p.progress->>'status', '') AS "projectStatus",
            p.implementing_agency AS "implementingAgency",
            COALESCE(
              CASE
                WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+)?$'
                  THEN (p.budget->>'allocated_amount_kes')::numeric
                ELSE 0
              END,
              0
            ) AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
          LEFT JOIN categories c
            ON c."categoryId" = p.category_id
           AND COALESCE(c.voided, false) = false
          LEFT JOIN LATERAL (
            SELECT stage, decision, updated_at
            FROM project_procurement_workflow w
            WHERE w.project_id = p.project_id AND COALESCE(w.voided, false) = false
            ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
            LIMIT 1
          ) wf ON true
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.progress->>'status', '')) LIKE '%procurement%'
          ORDER BY p.updated_at DESC NULLS LAST
        `,
        `
          SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            p.category_id AS "categoryId",
            c."categoryName" AS "categoryName",
            COALESCE(p.status, '') AS "projectStatus",
            p.implementing_agency AS "implementingAgency",
            0::numeric AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
          LEFT JOIN categories c
            ON c."categoryId" = p.category_id
           AND COALESCE(c.voided, false) = false
          LEFT JOIN LATERAL (
            SELECT stage, decision, updated_at
            FROM project_procurement_workflow w
            WHERE w.project_id = p.project_id AND COALESCE(w.voided, false) = false
            ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
            LIMIT 1
          ) wf ON true
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
          ORDER BY p.updated_at DESC NULLS LAST
        `,
        `
          SELECT
            p.id AS "projectId",
            p."projectName" AS "projectName",
            p."categoryId" AS "categoryId",
            c."categoryName" AS "categoryName",
            COALESCE(p.status, '') AS "projectStatus",
            p.directorate AS "implementingAgency",
            COALESCE(p."costOfProject", 0) AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
          LEFT JOIN categories c
            ON c."categoryId" = p."categoryId"
           AND COALESCE(c.voided, false) = false
          LEFT JOIN LATERAL (
            SELECT stage, decision, updated_at
            FROM project_procurement_workflow w
            WHERE w.project_id = p.id AND COALESCE(w.voided, false) = false
            ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
            LIMIT 1
          ) wf ON true
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
          ORDER BY p."updatedAt" DESC NULLS LAST
        `,
        `
          SELECT
            p.id AS "projectId",
            p."projectName" AS "projectName",
            p."categoryId" AS "categoryId",
            c."categoryName" AS "categoryName",
            COALESCE(p.status, '') AS "projectStatus",
            p.directorate AS "implementingAgency",
            COALESCE(p."costOfProject", 0) AS "budget",
            NULL::text AS "procurementStage",
            NULL::text AS "latestDecision",
            p."updatedAt" AS "updatedAt"
          FROM projects p
          LEFT JOIN categories c
            ON c."categoryId" = p."categoryId"
           AND COALESCE(c.voided, false) = false
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
          ORDER BY p."updatedAt" DESC NULLS LAST
        `,
      ];

      let rows = null;
      let lastError = null;
      for (const sql of postgresQueries) {
        try {
          const result = await pool.query(sql);
          rows = rowsOf(result);
          break;
        } catch (e) {
          lastError = e;
          if (!isSchemaError(e)) throw e;
        }
      }
      if (!rows && !schemaReady) {
        const fallbackQueries = [
          `SELECT p.project_id AS "projectId", p.name AS "projectName",
                  p.category_id AS "categoryId",
                  c."categoryName" AS "categoryName",
                  COALESCE(p.progress->>'status','') AS "projectStatus",
                  p.implementing_agency AS "implementingAgency",
                  0::numeric AS "budget",
                  NULL::text AS "procurementStage",
                  NULL::text AS "latestDecision",
                  p.updated_at AS "updatedAt"
           FROM projects p
           LEFT JOIN categories c
             ON c."categoryId" = p.category_id
            AND COALESCE(c.voided, false) = false
           WHERE COALESCE(p.voided, false) = false
             AND LOWER(COALESCE(p.progress->>'status','')) LIKE '%procurement%'
           ORDER BY p.updated_at DESC NULLS LAST`,
          `SELECT p.id AS "projectId", p."projectName" AS "projectName",
                  p."categoryId" AS "categoryId",
                  c."categoryName" AS "categoryName",
                  COALESCE(p.status,'') AS "projectStatus",
                  p.directorate AS "implementingAgency",
                  COALESCE(p."costOfProject",0) AS "budget",
                  NULL::text AS "procurementStage",
                  NULL::text AS "latestDecision",
                  p."updatedAt" AS "updatedAt"
           FROM projects p
           LEFT JOIN categories c
             ON c."categoryId" = p."categoryId"
            AND COALESCE(c.voided, false) = false
           WHERE COALESCE(p.voided, false) = false
             AND LOWER(COALESCE(p.status,'')) LIKE '%procurement%'
           ORDER BY p."updatedAt" DESC NULLS LAST`,
        ];
        for (const sql of fallbackQueries) {
          try {
            const result = await pool.query(sql);
            rows = rowsOf(result);
            break;
          } catch (e) {
            lastError = e;
            if (!isSchemaError(e)) throw e;
          }
        }
      }
      if (!rows && lastError) {
        // Fail soft for missing/variant schemas.
        return res.status(200).json([]);
      }
      const enrichedRows = await appendProcurementScopeSummary(rows || []);
      return res.status(200).json(enrichedRows);
    }

    const result = await pool.query(`
      SELECT
        p.id AS projectId,
        p.projectName,
        p.categoryId,
        c.categoryName,
        COALESCE(p.status, '') AS projectStatus,
        p.directorate AS implementingAgency,
        COALESCE(p.costOfProject, 0) AS budget,
        wf.stage AS procurementStage,
        wf.decision AS latestDecision,
        wf.updated_at AS updatedAt
      FROM projects p
      LEFT JOIN project_milestone_implementations c
        ON c.categoryId = p.categoryId
       AND COALESCE(c.voided, 0) = 0
      LEFT JOIN (
        SELECT w1.*
        FROM project_procurement_workflow w1
        INNER JOIN (
          SELECT project_id, MAX(updated_at) AS max_updated
          FROM project_procurement_workflow
          WHERE COALESCE(voided, 0) = 0
          GROUP BY project_id
        ) mx ON mx.project_id = w1.project_id AND mx.max_updated = w1.updated_at
      ) wf ON wf.project_id = p.id
      WHERE COALESCE(p.voided, 0) = 0
        AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
      ORDER BY p.updatedAt DESC
    `);
    const enrichedRows = await appendProcurementScopeSummary(rowsOf(result));
    return res.status(200).json(enrichedRows);
  } catch (error) {
    console.error('Error listing under-procurement projects:', error);
    return res.status(500).json({ message: 'Error listing under-procurement projects', error: error.message });
  }
});

router.get('/projects/:projectId/workflow', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, decision, notes, actor_id AS "actorId",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM project_procurement_workflow
         WHERE project_id = $1 AND COALESCE(voided, false) = false
         ORDER BY updated_at DESC NULLS LAST, id DESC`
      : `SELECT id, project_id AS projectId, stage, decision, notes, actor_id AS actorId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM project_procurement_workflow
         WHERE project_id = ? AND COALESCE(voided, 0) = 0
         ORDER BY updated_at DESC, id DESC`;
    const result = await pool.query(sql, [projectId]);
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error loading procurement workflow:', error);
    return res.status(500).json({ message: 'Error loading procurement workflow', error: error.message });
  }
});

router.get('/projects/:projectId/scope-status', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const status = await fetchProjectScopeStatus(projectId);
    if (!status) return res.status(404).json({ message: 'Project not found.' });
    return res.status(200).json(status);
  } catch (error) {
    console.error('Error loading project scope status:', error);
    return res.status(500).json({ message: 'Error loading project scope status', error: error.message });
  }
});

router.get('/scope/import-template', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const milestones = workbook.addWorksheet('Milestones');
    milestones.columns = [
      { header: 'milestone_name', key: 'milestone_name', width: 28 },
      { header: 'sequence_order', key: 'sequence_order', width: 14 },
      { header: 'description', key: 'description', width: 36 },
      { header: 'unit_of_measure', key: 'unit_of_measure', width: 16 },
      { header: 'achievement_value', key: 'achievement_value', width: 16 },
    ];
    milestones.addRow({
      milestone_name: 'Site mobilization',
      sequence_order: 1,
      description: 'Establish site and materials',
      unit_of_measure: 'lump sum',
      achievement_value: 10,
    });
    milestones.addRow({
      milestone_name: 'Foundation works',
      sequence_order: 2,
      description: 'Excavation and foundation',
      unit_of_measure: 'lump sum',
      achievement_value: 30,
    });

    const bq = workbook.addWorksheet('BQ Lines');
    bq.columns = [
      { header: 'milestone_name', key: 'milestone_name', width: 24 },
      { header: 'activity_name', key: 'activity_name', width: 30 },
      { header: 'description', key: 'description', width: 30 },
      { header: 'unit_of_measure', key: 'unit_of_measure', width: 14 },
      { header: 'quantity', key: 'quantity', width: 12 },
      { header: 'unit_cost', key: 'unit_cost', width: 14 },
      { header: 'budget_amount', key: 'budget_amount', width: 16 },
      { header: 'sort_order', key: 'sort_order', width: 10 },
    ];
    bq.addRow({
      milestone_name: 'Site mobilization',
      activity_name: 'Site establishment',
      description: 'Mobilization and site clearance',
      unit_of_measure: 'lump sum',
      quantity: 1,
      unit_cost: 500000,
      budget_amount: 500000,
      sort_order: 1,
    });
    bq.addRow({
      milestone_name: 'Foundation works',
      activity_name: 'Excavation',
      description: 'Foundation excavation',
      unit_of_measure: 'm3',
      quantity: 120,
      unit_cost: 2500,
      budget_amount: 300000,
      sort_order: 2,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="project_scope_import_template.xlsx"');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('Error generating scope import template:', error);
    return res.status(500).json({ message: 'Error generating scope import template', error: error.message });
  }
});

router.post('/projects/:projectId/scope/import/preview', scopeUpload.single('file'), async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  if (!req.file?.buffer) return res.status(400).json({ message: 'Excel file is required.' });
  try {
    await ensureProcurementSchema();
    const status = await fetchProjectScopeStatus(projectId);
    if (!status) return res.status(404).json({ message: 'Project not found.' });

    const parsed = parseScopeExcelBuffer(req.file.buffer);
    const scaleToBudget = String(req.body?.scaleToBudget || '').toLowerCase() === 'true';
    let bqItems = parsed.bqItems;
    if (scaleToBudget && status.allocatedAmount > 0) {
      bqItems = scaleScopeBqAmounts(bqItems, status.allocatedAmount);
    }
    const importTotal = bqItems.reduce((sum, row) => sum + Number(row.budgetAmount || 0), 0);
    const overBudget = status.allocatedAmount > 0 && importTotal > status.allocatedAmount + 0.005;

    return res.status(200).json({
      projectId,
      ...status,
      milestones: parsed.milestones,
      bqItems,
      errors: parsed.errors,
      sheets: parsed.sheets,
      importTotal,
      scaled: scaleToBudget,
      overBudget,
      wouldCreate: {
        milestones: parsed.milestones.length,
        bqItems: bqItems.length,
      },
    });
  } catch (error) {
    console.error('Error previewing scope import:', error);
    return res.status(500).json({ message: 'Error previewing scope import', error: error.message });
  }
});

router.post('/projects/:projectId/scope/import/confirm', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  const {
    milestones,
    bqItems,
    scaleToBudget,
    confirmOverBudget,
    lockBaseline,
  } = req.body || {};
  try {
    await ensureProcurementSchema();
    const result = await applyScopeImportToProject(
      projectId,
      { milestones, bqItems },
      {
        actorId,
        source: 'excel',
        dryRun: false,
        scaleToBudget: Boolean(scaleToBudget),
        confirmOverBudget: Boolean(confirmOverBudget),
        lockBaseline: Boolean(lockBaseline),
      }
    );
    if (!result.ok) {
      return res.status(result.status || 400).json({
        message: result.message,
        code: result.code,
        importTotal: result.importTotal,
        allocatedAmount: result.allocatedAmount,
      });
    }
    const scopeStatus = await fetchProjectScopeStatus(projectId);
    const createdAny = (result.milestonesCreated || 0) + (result.bqItemsCreated || 0) > 0;
    const hasBq = Number(scopeStatus?.bqItemCount || 0) > 0;
    let message = `Imported ${result.milestonesCreated} milestone(s) and ${result.bqItemsCreated} BQ line(s).`;
    if (!createdAny && hasBq) {
      message = 'No new lines were imported — matching milestones/BQ already exist on this project.';
    } else if (!hasBq) {
      return res.status(400).json({
        message: 'Import did not create any BQ lines. Check the Excel uses a "BQ Lines" sheet with activity_name column, then confirm import again.',
        scopeStatus,
        milestonesCreated: result.milestonesCreated,
        bqItemsCreated: result.bqItemsCreated,
      });
    }
    return res.status(200).json({
      ...result,
      scopeStatus,
      message,
    });
  } catch (error) {
    console.error('Error confirming scope import:', error);
    return res.status(500).json({ message: 'Error confirming scope import', error: error.message });
  }
});

router.post('/projects/:projectId/scope/lock', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const status = await fetchProjectScopeStatus(projectId);
    if (!status) return res.status(404).json({ message: 'Project not found.' });
    if (status.milestoneCount === 0 && status.bqItemCount === 0) {
      return res.status(400).json({ message: 'Add milestones or BQ lines before locking the planned baseline.' });
    }
    await mergeProjectProcurementScopeMeta(projectId, {
      status: 'planned',
      source: status.scopeSource || req.body?.source || 'manual',
      lockedAt: new Date().toISOString(),
      bqTotal: status.bqBudgetAmount,
    });
    const updated = await fetchProjectScopeStatus(projectId);
    return res.status(200).json({
      message: 'Planned scope baseline locked.',
      scopeStatus: updated,
    });
  } catch (error) {
    console.error('Error locking scope baseline:', error);
    return res.status(500).json({ message: 'Error locking scope baseline', error: error.message });
  }
});

router.get('/projects/:projectId/quotations/export-planned', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const plannedLines = await fetchPlannedBqLines(projectId);
    if (!plannedLines.length) {
      return res.status(400).json({ message: 'No planned BQ lines on this project. Set up scope first.' });
    }
    return writeProjectQuoteWorkbook(res, projectId, plannedLines);
  } catch (error) {
    console.error('Error exporting planned BQ:', error);
    return res.status(500).json({ message: 'Error exporting planned BQ', error: error.message });
  }
});

router.get('/projects/:projectId/quotations/entry-sheet', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const sheet = await buildQuotationEntrySheet(projectId);
    if (!sheet.plannedLineCount) {
      return res.status(400).json({ message: 'No planned BQ lines on this project. Set up scope first.' });
    }
    return res.status(200).json(sheet);
  } catch (error) {
    console.error('Error loading quotation entry sheet:', error);
    return res.status(500).json({ message: 'Error loading quotation entry sheet', error: error.message });
  }
});

router.post('/projects/:projectId/quotations/entry/confirm', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  const {
    lines: entryLines,
    title,
    supplierName,
    referenceNo,
    contractorId,
    quotationType,
    status,
    notes,
    awardQuotation,
  } = req.body || {};
  try {
    await ensureProcurementSchema();
    const plannedLines = await fetchPlannedBqLines(projectId);
    const importLines = entryLinesToImportPayload(entryLines);
    const validated = validateAndMergeQuotationImport(plannedLines, importLines, { fillMissingPlanned: true });
    if (validated.errors.length) {
      return res.status(400).json({ message: 'Quotation entry validation failed.', errors: validated.errors });
    }
    const finalStatus = awardQuotation ? 'awarded' : (status || 'submitted');
    const quotation = await insertQuotationWithLines(
      projectId,
      {
        title: title || 'Entered contracted quotation',
        supplierName,
        referenceNo,
        contractorId,
        quotationType: quotationType || 'awarded',
        status: finalStatus,
        notes,
      },
      validated.lines,
      actorId
    );
    if (finalStatus === 'awarded') {
      await pool.query(
        `UPDATE procurement_quotations
         SET status = 'superseded', updated_at = NOW()
         WHERE project_id = $1 AND id <> $2 AND status = 'awarded' AND COALESCE(voided, false) = false`,
        [projectId, quotation.quotationId]
      );
      const comparison = await computeScopeQuotationComparison(projectId, quotation.quotationId);
      await mergeProjectProcurementScopeMeta(projectId, {
        quotationRisk: {
          riskLevel: comparison.risk?.riskLevel || 'none',
          frontLoadIndex: comparison.risk?.frontLoadIndex || 0,
          quotedTotal: comparison.quotedTotal || 0,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    const comparison = await computeScopeQuotationComparison(projectId, quotation.quotationId);
    return res.status(200).json({
      quotation,
      comparison,
      warnings: validated.warnings,
      message: `Saved quotation with ${quotation.lines?.length || 0} line(s).`,
    });
  } catch (error) {
    console.error('Error saving quotation entry:', error);
    return res.status(500).json({ message: 'Error saving quotation entry', error: error.message });
  }
});

router.get('/quotations/import-template', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quoted Lines');
    sheet.columns = [
      { header: 'planned_bq_item_id', key: 'planned_bq_item_id', width: 16 },
      { header: 'milestone_name', key: 'milestone_name', width: 24 },
      { header: 'activity_name', key: 'activity_name', width: 30 },
      { header: 'description', key: 'description', width: 30 },
      { header: 'unit_of_measure', key: 'unit_of_measure', width: 14 },
      { header: 'quantity', key: 'quantity', width: 12 },
      { header: 'unit_cost', key: 'unit_cost', width: 14 },
      { header: 'amount', key: 'amount', width: 16 },
      { header: 'sort_order', key: 'sort_order', width: 10 },
    ];
    sheet.addRow({
      planned_bq_item_id: 101,
      milestone_name: 'Site mobilization',
      activity_name: 'Site establishment',
      description: 'Supplier quoted mobilization',
      unit_of_measure: 'lump sum',
      quantity: 1,
      unit_cost: 650000,
      amount: 650000,
      sort_order: 1,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="contracted_quotation_import_template.xlsx"');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('Error generating quotation import template:', error);
    return res.status(500).json({ message: 'Error generating quotation import template', error: error.message });
  }
});

router.get('/projects/:projectId/quotations', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const quotations = await listProjectQuotations(projectId);
    return res.status(200).json({ quotations });
  } catch (error) {
    console.error('Error listing quotations:', error);
    return res.status(500).json({ message: 'Error listing quotations', error: error.message });
  }
});

router.get('/projects/:projectId/scope-comparison', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const quotationId = req.query.quotationId ? Number(req.query.quotationId) : null;
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const comparison = await computeScopeQuotationComparison(
      projectId,
      Number.isFinite(quotationId) ? quotationId : null
    );
    return res.status(200).json(comparison);
  } catch (error) {
    console.error('Error loading scope comparison:', error);
    return res.status(500).json({
      message: 'Error loading scope comparison',
      error: error.message,
      detail: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    });
  }
});

router.get('/projects/:projectId/quotations/:quotationId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const quotationId = Number(req.params.quotationId);
  if (!Number.isFinite(projectId) || !Number.isFinite(quotationId)) {
    return res.status(400).json({ message: 'Invalid project or quotation id.' });
  }
  try {
    await ensureProcurementSchema();
    const quotation = await fetchQuotationById(projectId, quotationId);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found.' });
    const comparison = await computeScopeQuotationComparison(projectId, quotationId);
    return res.status(200).json({ quotation, comparison });
  } catch (error) {
    console.error('Error loading quotation:', error);
    return res.status(500).json({ message: 'Error loading quotation', error: error.message });
  }
});

router.post('/projects/:projectId/quotations', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  const {
    fromPlanned,
    title,
    supplierName,
    referenceNo,
    contractorId,
    quotationType,
    status,
    notes,
    lines,
  } = req.body || {};
  try {
    await ensureProcurementSchema();
    const scopeStatus = await fetchProjectScopeStatus(projectId);
    if (!scopeStatus) return res.status(404).json({ message: 'Project not found.' });

    let importLines = Array.isArray(lines) ? lines : [];
    if (fromPlanned) {
      importLines = await buildQuotationLinesFromPlanned(projectId);
      if (!importLines.length) {
        return res.status(400).json({ message: 'No planned BQ lines found. Set up planned scope first.' });
      }
    }
    if (!importLines.length) {
      return res.status(400).json({ message: 'Quotation lines are required.' });
    }

    const quotation = await insertQuotationWithLines(
      projectId,
      {
        title: title || (fromPlanned ? 'Copy from planned baseline' : 'Contracted quotation'),
        supplierName,
        referenceNo,
        contractorId,
        quotationType: quotationType || 'awarded',
        status: status || 'draft',
        notes,
      },
      importLines,
      actorId
    );
    return res.status(201).json({ quotation, message: 'Quotation created.' });
  } catch (error) {
    console.error('Error creating quotation:', error);
    return res.status(500).json({ message: 'Error creating quotation', error: error.message });
  }
});

router.post('/projects/:projectId/quotations/import/preview', scopeUpload.single('file'), async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  if (!req.file?.buffer) return res.status(400).json({ message: 'Excel file is required.' });
  try {
    await ensureProcurementSchema();
    const plannedLines = await fetchPlannedBqLines(projectId);
    const parsed = parseQuotationExcelBuffer(req.file.buffer, plannedLines);
    const comparison = await computeScopeQuotationComparison(projectId);
    const milestoneOrder = await fetchMilestoneSequenceMap(projectId);
    const plannedQuoteLines = quotationLinesForComparison(parsed.lines);
    const quotedGroups = groupLinesByMilestone(plannedQuoteLines, milestoneOrder);
    const plannedGroups = comparison.plannedGroups || [];
    const risk = computeFrontLoadRisk(plannedGroups, quotedGroups);

    return res.status(200).json({
      projectId,
      ...parsed,
      plannedLineCount: plannedLines.length,
      risk,
    });
  } catch (error) {
    console.error('Error previewing quotation import:', error);
    return res.status(500).json({ message: 'Error previewing quotation import', error: error.message });
  }
});

router.post('/projects/:projectId/quotations/import/confirm', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  const {
    lines,
    title,
    supplierName,
    referenceNo,
    contractorId,
    quotationType,
    status,
    notes,
    awardQuotation,
  } = req.body || {};
  try {
    await ensureProcurementSchema();
    if (!Array.isArray(lines) || !lines.length) {
      return res.status(400).json({ message: 'Quotation lines are required.' });
    }
    const finalStatus = awardQuotation ? 'awarded' : (status || 'submitted');
    const quotation = await insertQuotationWithLines(
      projectId,
      {
        title: title || 'Imported contracted quotation',
        supplierName,
        referenceNo,
        contractorId,
        quotationType: quotationType || 'awarded',
        status: finalStatus,
        notes,
      },
      lines,
      actorId
    );

    if (finalStatus === 'awarded') {
      await pool.query(
        `UPDATE procurement_quotations
         SET status = 'superseded', updated_at = NOW()
         WHERE project_id = $1 AND id <> $2 AND status = 'awarded' AND COALESCE(voided, false) = false`,
        [projectId, quotation.quotationId]
      );
      const comparison = await computeScopeQuotationComparison(projectId, quotation.quotationId);
      await mergeProjectProcurementScopeMeta(projectId, {
        quotationRisk: {
          riskLevel: comparison.risk?.riskLevel || 'none',
          frontLoadIndex: comparison.risk?.frontLoadIndex || 0,
          quotedTotal: comparison.quotedTotal || 0,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const comparison = await computeScopeQuotationComparison(projectId, quotation.quotationId);
    return res.status(200).json({
      quotation,
      comparison,
      message: `Imported quotation with ${quotation.lines?.length || 0} line(s).`,
    });
  } catch (error) {
    console.error('Error confirming quotation import:', error);
    return res.status(500).json({ message: 'Error confirming quotation import', error: error.message });
  }
});

router.patch('/projects/:projectId/quotations/:quotationId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const quotationId = Number(req.params.quotationId);
  if (!Number.isFinite(projectId) || !Number.isFinite(quotationId)) {
    return res.status(400).json({ message: 'Invalid project or quotation id.' });
  }
  const { status, supplierName, referenceNo, title, notes } = req.body || {};
  try {
    await ensureProcurementSchema();
    const existing = await fetchQuotationById(projectId, quotationId);
    if (!existing) return res.status(404).json({ message: 'Quotation not found.' });

    await pool.query(
      `UPDATE procurement_quotations
       SET status = COALESCE($3, status),
           supplier_name = COALESCE($4, supplier_name),
           reference_no = COALESCE($5, reference_no),
           title = COALESCE($6, title),
           notes = COALESCE($7, notes),
           updated_at = NOW()
       WHERE id = $1 AND project_id = $2`,
      [quotationId, projectId, status || null, supplierName || null, referenceNo || null, title || null, notes || null]
    );

    if (status === 'awarded') {
      await pool.query(
        `UPDATE procurement_quotations
         SET status = 'superseded', updated_at = NOW()
         WHERE project_id = $1 AND id <> $2 AND status = 'awarded' AND COALESCE(voided, false) = false`,
        [projectId, quotationId]
      );
      const comparison = await computeScopeQuotationComparison(projectId, quotationId);
      await mergeProjectProcurementScopeMeta(projectId, {
        quotationRisk: {
          riskLevel: comparison.risk?.riskLevel || 'none',
          frontLoadIndex: comparison.risk?.frontLoadIndex || 0,
          quotedTotal: comparison.quotedTotal || 0,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const quotation = await fetchQuotationById(projectId, quotationId);
    const comparison = await computeScopeQuotationComparison(projectId, quotationId);
    return res.status(200).json({ quotation, comparison, message: 'Quotation updated.' });
  } catch (error) {
    console.error('Error updating quotation:', error);
    return res.status(500).json({ message: 'Error updating quotation', error: error.message });
  }
});

router.get('/projects/:projectId/prepare-scope/preview', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const result = await applyProjectTypeScopeToProject(projectId, null, { dryRun: true });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || 'Could not preview project scope.' });
    }
    const hasTemplates = (Number(result.templateMilestones) || 0) + (Number(result.templateBqItems) || 0) > 0;
    const wouldCreateAny = (Number(result.milestonesCreated) || 0) + (Number(result.bqItemsCreated) || 0) > 0;
    let message = `Previewed procurement scope from project type. ${result.milestonesCreated} milestone(s) and ${result.bqItemsCreated} BQ item(s) would be created.`;
    if (!hasTemplates) {
      message = 'The selected project type has no milestone or BQ templates configured yet. Add templates under Project Types, then run Prepare Scope & BQ again.';
    } else if (!wouldCreateAny) {
      message = 'This project already has the milestones/BQ items from this project type.';
    }
    return res.status(200).json({ ...result, message });
  } catch (error) {
    console.error('Error previewing procurement scope:', error);
    return res.status(500).json({ message: 'Error previewing procurement scope', error: error.message });
  }
});

router.post('/projects/:projectId/prepare-scope', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  const lockBaseline = Boolean(req.body?.lockBaseline);
  try {
    await ensureProcurementSchema();
    const result = await applyProjectTypeScopeToProject(projectId, actorId);
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || 'Could not prepare project scope.' });
    }
    if (lockBaseline && (result.milestonesCreated > 0 || result.bqItemsCreated > 0)) {
      const status = await fetchProjectScopeStatus(projectId);
      await mergeProjectProcurementScopeMeta(projectId, {
        status: 'planned',
        source: 'template',
        lockedAt: new Date().toISOString(),
        bqTotal: status?.bqBudgetAmount || 0,
      });
    } else if (result.milestonesCreated > 0 || result.bqItemsCreated > 0) {
      const status = await fetchProjectScopeStatus(projectId);
      await mergeProjectProcurementScopeMeta(projectId, {
        status: 'draft',
        source: 'template',
        bqTotal: status?.bqBudgetAmount || 0,
      });
    }
    const hasTemplates = (Number(result.templateMilestones) || 0) + (Number(result.templateBqItems) || 0) > 0;
    const createdAny = (Number(result.milestonesCreated) || 0) + (Number(result.bqItemsCreated) || 0) > 0;
    let message = `Prepared procurement scope from project type. Created ${result.milestonesCreated} milestone(s) and ${result.bqItemsCreated} BQ item(s).`;
    if (!hasTemplates) {
      message = 'The selected project type has no milestone or BQ templates configured yet. Add templates under Project Types, then run Prepare Scope & BQ again.';
    } else if (!createdAny) {
      message = 'No new scope lines were created because the project already has the milestones/BQ items from this project type.';
    }
    const scopeStatus = await fetchProjectScopeStatus(projectId);
    return res.status(200).json({
      ...result,
      message,
      scopeStatus,
    });
  } catch (error) {
    console.error('Error preparing procurement scope:', error);
    return res.status(500).json({ message: 'Error preparing procurement scope', error: error.message });
  }
});

router.post('/projects/:projectId/workflow', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.body?.stage || '').trim();
  const decision = req.body?.decision ? String(req.body.decision).trim() : null;
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  if (!stage) return res.status(400).json({ message: 'stage is required.' });
  try {
    await ensureProcurementSchema();
    const stageAllowed = await isActiveProcurementStage(stage);
    if (!stageAllowed) {
      return res.status(400).json({
        message: 'Stage must be an active procurement stage from the catalog. Manage stages under Procurement → Procurement stages.',
      });
    }
    const currentStage = await latestWorkflowStage(projectId);
    if (currentStage) {
      const gate = await validateStageGateForTransition(projectId, currentStage, stage);
      if (!gate.ok) return res.status(409).json({ message: gate.message, gateFailed: true });
    }
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO project_procurement_workflow
          (project_id, stage, decision, notes, actor_id, created_at, updated_at, voided)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)
         RETURNING id, project_id AS "projectId", stage, decision, notes, actor_id AS "actorId",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, decision, notes, actorId]
      );
      const row = rowsOf(result)[0];
      let procurementHandoff = null;
      try {
        procurementHandoff = await finalizeProcurementContractClosure(projectId, stage, decision);
      } catch (finErr) {
        console.error('finalizeProcurementContractClosure (workflow POST):', finErr);
        procurementHandoff = { ok: false, message: finErr?.message || 'Contractor handoff failed.' };
      }
      return res.status(201).json({ ...row, procurementHandoff });
    }
    const insert = await pool.query(
      `INSERT INTO project_procurement_workflow
       (project_id, stage, decision, notes, actor_id, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
      [projectId, stage, decision, notes, actorId]
    );
    const insertId = insert?.insertId || insert?.[0]?.insertId;
    const selected = await pool.query(
      `SELECT id, project_id AS projectId, stage, decision, notes, actor_id AS actorId,
              created_at AS createdAt, updated_at AS updatedAt
       FROM project_procurement_workflow WHERE id = ?`,
      [insertId]
    );
    const row = rowsOf(selected)[0];
    let procurementHandoff = null;
    try {
      procurementHandoff = await finalizeProcurementContractClosure(projectId, stage, decision);
    } catch (finErr) {
      console.error('finalizeProcurementContractClosure (workflow POST):', finErr);
      procurementHandoff = { ok: false, message: finErr?.message || 'Contractor handoff failed.' };
    }
    return res.status(201).json({ ...row, procurementHandoff });
  } catch (error) {
    console.error('Error adding procurement workflow step:', error);
    return res.status(500).json({ message: 'Error adding procurement workflow step', error: error.message });
  }
});

router.patch('/projects/:projectId/workflow/:workflowId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const workflowId = Number(req.params.workflowId);
  if (!Number.isFinite(projectId) || !Number.isFinite(workflowId)) {
    return res.status(400).json({ message: 'Invalid projectId/workflowId.' });
  }
  const decision = req.body?.decision != null ? String(req.body.decision).trim() : null;
  const notes = req.body?.notes != null ? String(req.body.notes).trim() : null;
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `UPDATE project_procurement_workflow
         SET decision = $1, notes = $2, actor_id = COALESCE($3, actor_id), updated_at = NOW()
         WHERE id = $4 AND project_id = $5 AND COALESCE(voided, false) = false
         RETURNING id, project_id AS "projectId", stage, decision, notes, actor_id AS "actorId",
                   created_at AS "createdAt", updated_at AS "updatedAt"`
      : `UPDATE project_procurement_workflow
         SET decision = ?, notes = ?, actor_id = COALESCE(?, actor_id), updated_at = NOW()
         WHERE id = ? AND project_id = ? AND COALESCE(voided, 0) = 0`;
    const r = await pool.query(sql, isPostgres ? [decision, notes, actorId, workflowId, projectId] : [decision, notes, actorId, workflowId, projectId]);
    if (isPostgres) {
      const row = rowsOf(r)[0];
      if (!row) return res.status(404).json({ message: 'Workflow step not found.' });
      let procurementHandoff = null;
      try {
        procurementHandoff = await finalizeProcurementContractClosure(projectId, row.stage, row.decision ?? decision);
      } catch (finErr) {
        console.error('finalizeProcurementContractClosure (workflow PATCH):', finErr);
        procurementHandoff = { ok: false, message: finErr?.message || 'Contractor handoff failed.' };
      }
      return res.status(200).json({ ...row, procurementHandoff });
    }
    if ((r?.affectedRows || r?.[0]?.affectedRows || 0) <= 0) return res.status(404).json({ message: 'Workflow step not found.' });
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, decision, notes, actor_id AS actorId,
              created_at AS createdAt, updated_at AS updatedAt
       FROM project_procurement_workflow WHERE id = ?`,
      [workflowId]
    );
    const selRow = rowsOf(sel)[0];
    let procurementHandoff = null;
    try {
      procurementHandoff = await finalizeProcurementContractClosure(projectId, selRow.stage, selRow.decision ?? decision);
    } catch (finErr) {
      console.error('finalizeProcurementContractClosure (workflow PATCH):', finErr);
      procurementHandoff = { ok: false, message: finErr?.message || 'Contractor handoff failed.' };
    }
    return res.status(200).json({ ...selRow, procurementHandoff });
  } catch (error) {
    console.error('Error updating procurement workflow step:', error);
    return res.status(500).json({ message: 'Error updating procurement workflow step', error: error.message });
  }
});

router.delete('/projects/:projectId/workflow/:workflowId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const workflowId = Number(req.params.workflowId);
  if (!Number.isFinite(projectId) || !Number.isFinite(workflowId)) {
    return res.status(400).json({ message: 'Invalid projectId/workflowId.' });
  }
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `UPDATE project_procurement_workflow
         SET voided = true, updated_at = NOW()
         WHERE id = $1 AND project_id = $2 AND COALESCE(voided, false) = false
         RETURNING id`
      : `UPDATE project_procurement_workflow
         SET voided = 1, updated_at = NOW()
         WHERE id = ? AND project_id = ? AND COALESCE(voided, 0) = 0`;
    const r = await pool.query(sql, [workflowId, projectId]);
    if (isPostgres) {
      if (!rowsOf(r).length) return res.status(404).json({ message: 'Workflow step not found.' });
    } else if ((r?.affectedRows || r?.[0]?.affectedRows || 0) <= 0) {
      return res.status(404).json({ message: 'Workflow step not found.' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting procurement workflow step:', error);
    return res.status(500).json({ message: 'Error deleting procurement workflow step', error: error.message });
  }
});

router.get('/projects/:projectId/attachments', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.query?.stage || '').trim();
  const subjectId = req.query?.subjectId != null && String(req.query.subjectId).trim() !== ''
    ? Number(req.query.subjectId)
    : null;
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, subject_id AS "subjectId", file_name AS "fileName", file_path AS "filePath",
                mime_type AS "mimeType", file_size AS "fileSize", title, notes,
                uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_attachments
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND ($2::text = '' OR COALESCE(stage, '') = $2::text)
           AND ($3::bigint IS NULL OR subject_id = $3::bigint)
         ORDER BY created_at DESC, id DESC`
      : `SELECT id, project_id AS projectId, stage, subject_id AS subjectId, file_name AS fileName, file_path AS filePath,
                mime_type AS mimeType, file_size AS fileSize, title, notes,
                uploaded_by AS uploadedBy, created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_attachments
         WHERE project_id = ?
           AND COALESCE(voided, 0) = 0
           AND (? = '' OR COALESCE(stage, '') = ?)
           AND (? IS NULL OR subject_id = ?)
         ORDER BY created_at DESC, id DESC`;
    const params = isPostgres ? [projectId, stage, subjectId] : [projectId, stage, stage, subjectId, subjectId];
    const result = await pool.query(sql, params);
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error loading procurement attachments:', error);
    return res.status(500).json({ message: 'Error loading procurement attachments', error: error.message });
  }
});

router.post('/projects/:projectId/attachments', upload.single('file'), async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  if (!req.file) return res.status(400).json({ message: 'file is required.' });
  const stage = String(req.body?.stage || '').trim() || null;
  const subjectId = req.body?.subjectId != null && String(req.body.subjectId).trim() !== ''
    ? Number(req.body.subjectId)
    : null;
  const title = String(req.body?.title || '').trim() || null;
  const notes = String(req.body?.notes || '').trim() || null;
  const uploadedBy = Number(req.user?.userId || req.user?.id || null) || null;
  const relPath = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
  try {
    await ensureProcurementSchema();
    if (subjectId != null && Number.isFinite(subjectId)) {
      const subjSql = isPostgres
        ? `SELECT 1 FROM procurement_stage_subjects
           WHERE id = $1 AND project_id = $2 AND COALESCE(voided, false) = false`
        : `SELECT 1 FROM procurement_stage_subjects
           WHERE id = ? AND project_id = ? AND COALESCE(voided, 0) = 0`;
      const ok = rowsOf(await pool.query(subjSql, [subjectId, projectId])).length > 0;
      if (!ok) return res.status(400).json({ message: 'Invalid subjectId for this project.' });
    }
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_attachments
          (project_id, stage, subject_id, file_name, file_path, mime_type, file_size, title, notes, uploaded_by, created_at, updated_at, voided)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),false)
         RETURNING id, project_id AS "projectId", stage, subject_id AS "subjectId", file_name AS "fileName", file_path AS "filePath",
                   mime_type AS "mimeType", file_size AS "fileSize", title, notes, uploaded_by AS "uploadedBy",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, Number.isFinite(subjectId) ? subjectId : null, req.file.originalname, relPath, req.file.mimetype || null, req.file.size || null, title, notes, uploadedBy]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const ins = await pool.query(
      `INSERT INTO procurement_attachments
       (project_id, stage, subject_id, file_name, file_path, mime_type, file_size, title, notes, uploaded_by, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
      [projectId, stage, Number.isFinite(subjectId) ? subjectId : null, req.file.originalname, relPath, req.file.mimetype || null, req.file.size || null, title, notes, uploadedBy]
    );
    const insertId = ins?.insertId || ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, subject_id AS subjectId, file_name AS fileName, file_path AS filePath,
              mime_type AS mimeType, file_size AS fileSize, title, notes, uploaded_by AS uploadedBy,
              created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_attachments WHERE id = ?`,
      [insertId]
    );
    return res.status(201).json(rowsOf(sel)[0]);
  } catch (error) {
    console.error('Error saving procurement attachment:', error);
    return res.status(500).json({ message: 'Error saving procurement attachment', error: error.message });
  }
});

router.get('/projects/:projectId/checklist', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.query?.stage || '').trim();
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, label, notes, completed,
                completed_at AS "completedAt", completed_by AS "completedBy",
                created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_checklist_items
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND ($2::text = '' OR COALESCE(stage, '') = $2::text)
         ORDER BY created_at DESC, id DESC`
      : `SELECT id, project_id AS projectId, stage, label, notes, completed,
                completed_at AS completedAt, completed_by AS completedBy,
                created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_checklist_items
         WHERE project_id = ?
           AND COALESCE(voided, 0) = 0
           AND (? = '' OR COALESCE(stage, '') = ?)
         ORDER BY created_at DESC, id DESC`;
    const params = isPostgres ? [projectId, stage] : [projectId, stage, stage];
    const result = await pool.query(sql, params);
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error loading procurement checklist:', error);
    return res.status(500).json({ message: 'Error loading procurement checklist', error: error.message });
  }
});

router.post('/projects/:projectId/checklist', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.body?.stage || '').trim() || null;
  const label = String(req.body?.label || '').trim();
  const notes = String(req.body?.notes || '').trim() || null;
  const createdBy = Number(req.user?.userId || req.user?.id || null) || null;
  if (!label) return res.status(400).json({ message: 'label is required.' });
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_checklist_items
          (project_id, stage, label, notes, completed, created_by, created_at, updated_at, voided)
         VALUES ($1,$2,$3,$4,false,$5,NOW(),NOW(),false)
         RETURNING id, project_id AS "projectId", stage, label, notes, completed,
                   completed_at AS "completedAt", completed_by AS "completedBy",
                   created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, label, notes, createdBy]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const ins = await pool.query(
      `INSERT INTO procurement_checklist_items
       (project_id, stage, label, notes, completed, created_by, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, 0, ?, NOW(), NOW(), 0)`,
      [projectId, stage, label, notes, createdBy]
    );
    const insertId = ins?.insertId || ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, label, notes, completed,
              completed_at AS completedAt, completed_by AS completedBy,
              created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_checklist_items WHERE id = ?`,
      [insertId]
    );
    return res.status(201).json(rowsOf(sel)[0]);
  } catch (error) {
    console.error('Error adding checklist item:', error);
    return res.status(500).json({ message: 'Error adding checklist item', error: error.message });
  }
});

router.patch('/projects/:projectId/checklist/:itemId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(projectId) || !Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid ids.' });
  const completedBy = Number(req.user?.userId || req.user?.id || null) || null;
  const completedRaw = req.body?.completed;
  const completed = completedRaw === true || completedRaw === 1 || completedRaw === '1';
  const notes = req.body?.notes !== undefined ? String(req.body.notes || '').trim() : undefined;
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const sets = ['completed = $1', 'updated_at = NOW()', completed ? 'completed_at = NOW()' : 'completed_at = NULL', 'completed_by = $2'];
      const params = [completed, completedBy];
      if (notes !== undefined) {
        params.push(notes || null);
        sets.push(`notes = $${params.length}`);
      }
      params.push(projectId, itemId);
      const result = await pool.query(
        `UPDATE procurement_checklist_items
         SET ${sets.join(', ')}
         WHERE project_id = $${params.length - 1} AND id = $${params.length} AND COALESCE(voided, false) = false
         RETURNING id, project_id AS "projectId", stage, label, notes, completed,
                   completed_at AS "completedAt", completed_by AS "completedBy",
                   created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
        params
      );
      const row = rowsOf(result)[0];
      if (!row) return res.status(404).json({ message: 'Checklist item not found.' });
      return res.status(200).json(row);
    }
    const updates = ['completed = ?', 'updated_at = NOW()', completed ? 'completed_at = NOW()' : 'completed_at = NULL', 'completed_by = ?'];
    const params = [completed ? 1 : 0, completedBy];
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
    }
    params.push(projectId, itemId);
    await pool.query(
      `UPDATE procurement_checklist_items
       SET ${updates.join(', ')}
       WHERE project_id = ? AND id = ? AND COALESCE(voided, 0) = 0`,
      params
    );
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, label, notes, completed,
              completed_at AS completedAt, completed_by AS completedBy,
              created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_checklist_items WHERE project_id = ? AND id = ?`,
      [projectId, itemId]
    );
    const row = rowsOf(sel)[0];
    if (!row) return res.status(404).json({ message: 'Checklist item not found.' });
    return res.status(200).json(row);
  } catch (error) {
    console.error('Error updating checklist item:', error);
    return res.status(500).json({ message: 'Error updating checklist item', error: error.message });
  }
});

router.get('/templates', async (req, res) => {
  const stage = String(req.query?.stage || '').trim();
  const includeInactive =
    String(req.query?.all || '').trim() === '1' || String(req.query?.all || '').toLowerCase() === 'true';
  const fallbackTemplates = (() => {
    try {
      const seeds = getProcurementStageTemplateSeeds();
      return (Array.isArray(seeds) ? seeds : []).map((s, idx) => ({
        id: -1 * (idx + 1),
        stage: s.stage,
        name: s.name,
        subjectType: s.subjectType || 'generic',
        fields: normalizeTemplateFields(s.fields),
        active: true,
        createdAt: null,
        updatedAt: null,
      }));
    } catch {
      return [
        {
          id: -1,
          stage: STAGE_BID_EVALUATION,
          name: 'Bidder Suitability Checklist',
          subjectType: 'bidder',
          fields: normalizeTemplateFields(getDefaultBidEvaluationFields()),
          active: true,
          createdAt: null,
          updatedAt: null,
        },
      ];
    }
  })();
  try {
    try {
      await ensureProcurementSchema();
    } catch (schemaErr) {
      console.warn('Procurement templates schema ensure failed; returning fallback templates:', schemaErr?.message || schemaErr);
      const filtered = stage
        ? fallbackTemplates.filter((t) => String(t.stage || '').toLowerCase() === stage.toLowerCase())
        : fallbackTemplates;
      return res.status(200).json(filtered);
    }
    const prefNeeds = NEEDS_IDENTIFICATION_DEFAULT_TEMPLATE_NAME;
    const sql = isPostgres
      ? `SELECT id, stage, name, subject_type AS "subjectType", fields, active,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_stage_templates
         WHERE COALESCE(voided, false) = false
           AND ($1::text = '' OR LOWER(TRIM(stage)) = LOWER(TRIM($1::text)))
           AND ($2::boolean = true OR COALESCE(active, true) = true)
         ORDER BY
           stage ASC,
           CASE
             WHEN LOWER(TRIM(stage)) = LOWER(TRIM('Needs Identification'))
              AND LOWER(TRIM(name)) = LOWER(TRIM($3::text)) THEN 0
             WHEN LOWER(TRIM(stage)) = LOWER(TRIM('Needs Identification'))
              AND LOWER(TRIM(subject_type)) = LOWER(TRIM('bidder')) THEN 1
             WHEN LOWER(TRIM(stage)) = LOWER(TRIM('Needs Identification')) THEN 2
             ELSE 3
           END,
           id ASC`
      : `SELECT id, stage, name, subject_type AS subjectType, fields, active,
                created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_stage_templates
         WHERE COALESCE(voided, 0) = 0
           AND (? = '' OR LOWER(TRIM(stage)) = LOWER(TRIM(?)))
           AND (? = 1 OR COALESCE(active, 1) = 1)
         ORDER BY
           stage ASC,
           CASE
             WHEN LOWER(TRIM(stage)) = LOWER(TRIM('Needs Identification'))
              AND LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 0
             WHEN LOWER(TRIM(stage)) = LOWER(TRIM('Needs Identification'))
              AND LOWER(TRIM(subject_type)) = LOWER(TRIM('bidder')) THEN 1
             WHEN LOWER(TRIM(stage)) = LOWER(TRIM('Needs Identification')) THEN 2
             ELSE 3
           END,
           id ASC`;
    const params = isPostgres ? [stage, includeInactive, prefNeeds] : [stage, stage, includeInactive ? 1 : 0, prefNeeds];
    const result = await pool.query(sql, params);
    const rows = rowsOf(result).map((r) => ({
      ...r,
      fields: normalizeTemplateFields(Array.isArray(r.fields) ? r.fields : (() => {
        try { return JSON.parse(r.fields || '[]'); } catch { return []; }
      })()),
      active: r.active === true || r.active === 1 || r.active === '1' || String(r.active).toLowerCase() === 'true',
    }));
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Error listing procurement templates:', error);
    const filtered = stage
      ? fallbackTemplates.filter((t) => String(t.stage || '').toLowerCase() === stage.toLowerCase())
      : fallbackTemplates;
    return res.status(200).json(filtered);
  }
});

router.post('/templates', async (req, res) => {
  const stage = String(req.body?.stage || '').trim();
  const name = String(req.body?.name || '').trim();
  const subjectType = String(req.body?.subjectType || 'generic').trim() || 'generic';
  const fields = normalizeTemplateFields(req.body?.fields);
  if (!stage || !name) return res.status(400).json({ message: 'stage and name are required.' });
  if (!fields.length) return res.status(400).json({ message: 'At least one template field is required.' });
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_stage_templates (stage, name, subject_type, fields, active, voided, created_at, updated_at)
         VALUES ($1,$2,$3,$4::jsonb,true,false,NOW(),NOW())
         RETURNING id, stage, name, subject_type AS "subjectType", fields, active,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [stage, name, subjectType, JSON.stringify(fields)]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const ins = await pool.query(
      `INSERT INTO procurement_stage_templates (stage, name, subject_type, fields, active, voided, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 0, NOW(), NOW())`,
      [stage, name, subjectType, JSON.stringify(fields)]
    );
    const id = ins?.insertId || ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, stage, name, subject_type AS subjectType, fields, active, created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_stage_templates WHERE id = ?`,
      [id]
    );
    return res.status(201).json(rowsOf(sel)[0]);
  } catch (error) {
    console.error('Error creating procurement template:', error);
    return res.status(500).json({ message: 'Error creating procurement template', error: error.message });
  }
});

router.patch('/templates/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid template id.' });
  const stage = req.body?.stage != null ? String(req.body.stage).trim() : undefined;
  const name = req.body?.name != null ? String(req.body.name).trim() : undefined;
  const subjectType = req.body?.subjectType != null ? String(req.body.subjectType).trim() : undefined;
  const fields = req.body?.fields != null ? normalizeTemplateFields(req.body.fields) : undefined;
  const active = req.body?.active != null ? Boolean(req.body.active === true || req.body.active === 1 || req.body.active === '1') : undefined;
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const sets = [];
      const vals = [];
      const push = (sql, v) => { vals.push(v); sets.push(sql.replace('?', `$${vals.length}`)); };
      if (stage !== undefined) push('stage = ?', stage);
      if (name !== undefined) push('name = ?', name);
      if (subjectType !== undefined) push('subject_type = ?', subjectType);
      if (fields !== undefined) push('fields = ?::jsonb', JSON.stringify(fields));
      if (active !== undefined) push('active = ?', active);
      if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
      sets.push('updated_at = NOW()');
      vals.push(id);
      const r = await pool.query(
        `UPDATE procurement_stage_templates
         SET ${sets.join(', ')}
         WHERE id = $${vals.length} AND COALESCE(voided,false)=false
         RETURNING id, stage, name, subject_type AS "subjectType", fields, active,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        vals
      );
      const row = rowsOf(r)[0];
      if (!row) return res.status(404).json({ message: 'Template not found.' });
      return res.status(200).json({ ...row, fields: normalizeTemplateFields(row.fields) });
    }
    const sets = [];
    const vals = [];
    if (stage !== undefined) { sets.push('stage = ?'); vals.push(stage); }
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (subjectType !== undefined) { sets.push('subject_type = ?'); vals.push(subjectType); }
    if (fields !== undefined) { sets.push('fields = ?'); vals.push(JSON.stringify(fields)); }
    if (active !== undefined) { sets.push('active = ?'); vals.push(active ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
    sets.push('updated_at = NOW()');
    vals.push(id);
    await pool.query(`UPDATE procurement_stage_templates SET ${sets.join(', ')} WHERE id = ? AND COALESCE(voided,0)=0`, vals);
    const sel = await pool.query(
      `SELECT id, stage, name, subject_type AS subjectType, fields, active, created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_stage_templates WHERE id = ?`,
      [id]
    );
    const row = rowsOf(sel)[0];
    if (!row) return res.status(404).json({ message: 'Template not found.' });
    return res.status(200).json({ ...row, fields: normalizeTemplateFields(JSON.parse(row.fields || '[]')) });
  } catch (error) {
    console.error('Error updating procurement template:', error);
    return res.status(500).json({ message: 'Error updating procurement template', error: error.message });
  }
});

router.get('/projects/:projectId/stages/:stage/evaluation-export', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const stage = String(req.params.stage || '').trim();
  const format = String(req.query?.format || 'xlsx').trim().toLowerCase();
  if (!Number.isFinite(projectId) || !stage) return res.status(400).json({ message: 'Invalid projectId/stage.' });
  try {
    await ensureProcurementSchema();
    const rows = rowsOf(await pool.query(
      isPostgres
        ? `SELECT s.subject_name AS "subjectName",
                  s.latest_score AS "latestScore",
                  s.qualified,
                  s.latest_decision AS "latestDecision",
                  a.responses,
                  a.notes,
                  a.updated_at AS "assessedAt"
           FROM procurement_stage_subjects s
           LEFT JOIN LATERAL (
             SELECT responses, notes, updated_at
             FROM procurement_subject_assessments a
             WHERE a.subject_id = s.id AND COALESCE(a.voided,false)=false
             ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
             LIMIT 1
           ) a ON true
           WHERE s.project_id = $1 AND LOWER(TRIM(s.stage)) = LOWER(TRIM($2))
             AND LOWER(TRIM(s.subject_type)) = 'bidder'
             AND COALESCE(s.voided,false)=false
           ORDER BY s.created_at ASC, s.id ASC`
        : `SELECT s.subject_name AS subjectName, s.latest_score AS latestScore, s.qualified, s.latest_decision AS latestDecision,
                  a.responses, a.notes, a.updated_at AS assessedAt
           FROM procurement_stage_subjects s
           LEFT JOIN procurement_subject_assessments a ON a.subject_id = s.id AND COALESCE(a.voided,0)=0
           WHERE s.project_id = ? AND LOWER(TRIM(s.stage)) = LOWER(TRIM(?))
             AND LOWER(TRIM(s.subject_type)) = 'bidder'
             AND COALESCE(s.voided,0)=0
           ORDER BY s.created_at ASC, s.id ASC`,
      [projectId, stage]
    ));
    const normalized = rows.map((r) => ({
      subjectName: r.subjectName || 'Unnamed bidder',
      latestScore: Number(r.latestScore || 0),
      qualified: r.qualified === true || r.qualified === 1 || r.qualified === '1' || String(r.qualified).toLowerCase() === 'true',
      latestDecision: r.latestDecision || '',
      assessedAt: r.assessedAt || null,
      notes: r.notes || '',
      responses: r.responses && typeof r.responses === 'object' ? r.responses : (() => {
        try { return JSON.parse(r.responses || '{}'); } catch { return {}; }
      })(),
    }));

    if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const filename = `bidder-evaluation-${projectId}-${stage.replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      doc.pipe(res);
      doc.fontSize(14).text('Bidder Evaluation Sheet', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Project ID: ${projectId}`);
      doc.text(`Stage: ${stage}`);
      doc.text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();
      normalized.forEach((row, idx) => {
        doc.fontSize(11).text(`${idx + 1}. ${row.subjectName}`, { continued: false });
        doc.fontSize(10).text(`Score: ${row.latestScore} | Qualified: ${row.qualified ? 'Yes' : 'No'} | Decision: ${row.latestDecision || '-'}`);
        const responseLines = Object.entries(row.responses || {}).slice(0, 12).map(([k, v]) => `${k}: ${String(v)}`);
        responseLines.forEach((line) => doc.text(` - ${line}`));
        if (row.notes) doc.text(` Notes: ${row.notes}`);
        doc.moveDown(0.5);
      });
      doc.end();
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bidder Evaluation');
    ws.columns = [
      { header: 'Bidder', key: 'subjectName', width: 36 },
      { header: 'Score', key: 'latestScore', width: 12 },
      { header: 'Qualified', key: 'qualified', width: 12 },
      { header: 'Decision', key: 'latestDecision', width: 24 },
      { header: 'Assessed At', key: 'assessedAt', width: 24 },
      { header: 'Notes', key: 'notes', width: 40 },
      { header: 'Responses (JSON)', key: 'responsesJson', width: 60 },
    ];
    normalized.forEach((r) => {
      ws.addRow({
        subjectName: r.subjectName,
        latestScore: r.latestScore,
        qualified: r.qualified ? 'Yes' : 'No',
        latestDecision: r.latestDecision,
        assessedAt: r.assessedAt ? new Date(r.assessedAt) : '',
        notes: r.notes || '',
        responsesJson: JSON.stringify(r.responses || {}),
      });
    });
    ws.getRow(1).font = { bold: true };
    const filename = `bidder-evaluation-${projectId}-${stage.replace(/[^a-zA-Z0-9_-]/g, '-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting bidder evaluation:', error);
    return res.status(500).json({ message: 'Error exporting bidder evaluation', error: error.message });
  }
});

router.get('/overview', async (req, res) => {
  try {
    let schemaReady = true;
    try {
      await ensureProcurementSchema();
    } catch (e) {
      schemaReady = false;
    }
    const projects = await (async () => {
      try {
        const r = await pool.query(
          isPostgres
            ? `SELECT p.project_id AS "projectId", p.name AS "projectName",
                      COALESCE(p.progress->>'status','') AS "projectStatus"
               FROM projects p
               WHERE COALESCE(p.voided,false)=false
                 AND LOWER(COALESCE(p.progress->>'status','')) LIKE '%procurement%'`
            : `SELECT p.id AS projectId, p.projectName, COALESCE(p.status,'') AS projectStatus
               FROM projects p
               WHERE COALESCE(p.voided,0)=0
                 AND LOWER(COALESCE(p.status,'')) LIKE '%procurement%'`
        );
        return rowsOf(r);
      } catch {
        return [];
      }
    })();
    const stageDistribution = {};
    const statusDistribution = {};
    const metrics = {
      projectsUnderProcurement: projects.length,
      totalSubjects: 0,
      totalQualifiedSubjects: 0,
      totalAssessments: 0,
      totalChecklistItems: 0,
      totalChecklistCompleted: 0,
      totalAttachments: 0,
    };
    if (!schemaReady) {
      return res.status(200).json({ metrics, stageDistribution, statusDistribution });
    }

    const aggregateQueries = isPostgres
      ? {
          stages: `SELECT COALESCE(stage,'Unspecified') AS k, COUNT(*)::int AS c
                   FROM project_procurement_workflow
                   WHERE COALESCE(voided,false)=false
                   GROUP BY COALESCE(stage,'Unspecified')`,
          subjects: `SELECT COUNT(*)::int AS total,
                            SUM(CASE WHEN COALESCE(qualified,false)=true THEN 1 ELSE 0 END)::int AS qualified
                     FROM procurement_stage_subjects
                     WHERE COALESCE(voided,false)=false`,
          assessments: `SELECT COUNT(*)::int AS c FROM procurement_subject_assessments WHERE COALESCE(voided,false)=false`,
          checklist: `SELECT COUNT(*)::int AS total,
                             SUM(CASE WHEN COALESCE(completed,false)=true THEN 1 ELSE 0 END)::int AS completed
                      FROM procurement_checklist_items
                      WHERE COALESCE(voided,false)=false`,
          attachments: `SELECT COUNT(*)::int AS c FROM procurement_attachments WHERE COALESCE(voided,false)=false`,
        }
      : {
          stages: `SELECT COALESCE(stage,'Unspecified') AS k, COUNT(*) AS c
                   FROM project_procurement_workflow
                   WHERE COALESCE(voided,0)=0
                   GROUP BY COALESCE(stage,'Unspecified')`,
          subjects: `SELECT COUNT(*) AS total,
                            SUM(CASE WHEN COALESCE(qualified,0)=1 THEN 1 ELSE 0 END) AS qualified
                     FROM procurement_stage_subjects
                     WHERE COALESCE(voided,0)=0`,
          assessments: `SELECT COUNT(*) AS c FROM procurement_subject_assessments WHERE COALESCE(voided,0)=0`,
          checklist: `SELECT COUNT(*) AS total,
                             SUM(CASE WHEN COALESCE(completed,0)=1 THEN 1 ELSE 0 END) AS completed
                      FROM procurement_checklist_items
                      WHERE COALESCE(voided,0)=0`,
          attachments: `SELECT COUNT(*) AS c FROM procurement_attachments WHERE COALESCE(voided,0)=0`,
        };
    try {
      const [stg, sub, ass, chk, att] = await Promise.all([
        pool.query(aggregateQueries.stages),
        pool.query(aggregateQueries.subjects),
        pool.query(aggregateQueries.assessments),
        pool.query(aggregateQueries.checklist),
        pool.query(aggregateQueries.attachments),
      ]);
      rowsOf(stg).forEach((r) => {
        stageDistribution[String(r.k || 'Unspecified')] = Number(r.c || 0);
      });
      const s = rowsOf(sub)[0] || {};
      const a = rowsOf(ass)[0] || {};
      const c = rowsOf(chk)[0] || {};
      const t = rowsOf(att)[0] || {};
      metrics.totalSubjects = Number(s.total || 0);
      metrics.totalQualifiedSubjects = Number(s.qualified || 0);
      metrics.totalAssessments = Number(a.c || 0);
      metrics.totalChecklistItems = Number(c.total || 0);
      metrics.totalChecklistCompleted = Number(c.completed || 0);
      metrics.totalAttachments = Number(t.c || 0);
    } catch {
      // Keep fail-soft
    }
    projects.forEach((p) => {
      const key = String(p.projectStatus || 'Unknown');
      statusDistribution[key] = (statusDistribution[key] || 0) + 1;
    });
    return res.status(200).json({ metrics, stageDistribution, statusDistribution });
  } catch (error) {
    console.error('Error building procurement overview:', error);
    return res.status(200).json({
      metrics: {
        projectsUnderProcurement: 0,
        totalSubjects: 0,
        totalQualifiedSubjects: 0,
        totalAssessments: 0,
        totalChecklistItems: 0,
        totalChecklistCompleted: 0,
        totalAttachments: 0,
      },
      stageDistribution: {},
      statusDistribution: {},
    });
  }
});

router.get('/export/comprehensive', async (req, res) => {
  const projectId = req.query?.projectId != null && req.query?.projectId !== ''
    ? Number(req.query.projectId)
    : null;
  const hasProjectFilter = Number.isFinite(projectId);
  const format = String(req.query?.format || 'xlsx').trim().toLowerCase();
  try {
    let schemaReady = true;
    try {
      await ensureProcurementSchema();
    } catch {
      schemaReady = false;
    }

    if (!schemaReady) {
      if (format === 'html') {
        const fn = `procurement-comprehensive-${hasProjectFilter ? `project-${projectId}` : 'all'}-${new Date().toISOString().slice(0, 10)}.html`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${fn}"`);
        return res.send(
          renderProcurementComprehensiveHtml({
            schemaReady: false,
            hasProjectFilter,
            projectId: hasProjectFilter ? projectId : null,
            workflowsForExport: [],
            subjects: [],
            assessments: [],
            checklist: [],
            attachments: [],
            templates: [],
          })
        );
      }
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Procurement Module';
      wb.created = new Date();
      const summary = wb.addWorksheet('Summary');
      summary.columns = [{ header: 'Metric', key: 'metric', width: 34 }, { header: 'Value', key: 'value', width: 36 }];
      summary.addRows([
        { metric: 'Generated At', value: new Date().toISOString() },
        { metric: 'Scope', value: hasProjectFilter ? `Project ${projectId}` : 'All Projects' },
        { metric: 'Schema Ready', value: 'No (fallback export)' },
      ]);
      summary.getRow(1).font = { bold: true };
      const filename = `procurement-comprehensive-${hasProjectFilter ? `project-${projectId}` : 'all'}-${new Date().toISOString().slice(0,10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
      return;
    }

    const wherePg = hasProjectFilter ? 'WHERE project_id = $1' : '';
    const whereMy = hasProjectFilter ? 'WHERE project_id = ?' : '';
    const params = hasProjectFilter ? [projectId] : [];
    const queries = isPostgres
      ? {
          workflows: `SELECT id, project_id AS "projectId", stage, decision, notes, actor_id AS "actorId",
                             created_at AS "createdAt", updated_at AS "updatedAt"
                      FROM project_procurement_workflow
                      ${wherePg} ${wherePg ? 'AND' : 'WHERE'} COALESCE(voided,false)=false
                      ORDER BY project_id, updated_at DESC NULLS LAST`,
          subjects: `SELECT id, project_id AS "projectId", stage, subject_type AS "subjectType",
                            subject_name AS "subjectName", qualified, latest_score AS "latestScore",
                            latest_decision AS "latestDecision", metadata, created_at AS "createdAt", updated_at AS "updatedAt"
                     FROM procurement_stage_subjects
                     ${wherePg} ${wherePg ? 'AND' : 'WHERE'} COALESCE(voided,false)=false
                     ORDER BY project_id, stage, id`,
          assessments: `SELECT a.id, a.subject_id AS "subjectId", s.project_id AS "projectId", s.stage,
                               s.subject_name AS "subjectName", a.template_id AS "templateId", a.score,
                               a.max_score AS "maxScore", a.qualified, a.decision, a.notes, a.responses,
                               a.updated_at AS "updatedAt"
                        FROM procurement_subject_assessments a
                        JOIN procurement_stage_subjects s ON s.id = a.subject_id
                        ${hasProjectFilter ? 'WHERE s.project_id = $1 AND' : 'WHERE'} COALESCE(a.voided,false)=false
                        ORDER BY s.project_id, s.stage, s.subject_name, a.updated_at DESC NULLS LAST`,
          checklist: `SELECT id, project_id AS "projectId", stage, label, notes, completed,
                             completed_at AS "completedAt", completed_by AS "completedBy",
                             created_at AS "createdAt", updated_at AS "updatedAt"
                      FROM procurement_checklist_items
                      ${wherePg} ${wherePg ? 'AND' : 'WHERE'} COALESCE(voided,false)=false
                      ORDER BY project_id, stage, id`,
          attachments: `SELECT id, project_id AS "projectId", stage, file_name AS "fileName", file_path AS "filePath",
                               title, notes, uploaded_by AS "uploadedBy", created_at AS "createdAt"
                        FROM procurement_attachments
                        ${wherePg} ${wherePg ? 'AND' : 'WHERE'} COALESCE(voided,false)=false
                        ORDER BY project_id, stage, created_at DESC NULLS LAST`,
          templates: `SELECT id, stage, name, subject_type AS "subjectType", active, fields,
                             created_at AS "createdAt", updated_at AS "updatedAt"
                      FROM procurement_stage_templates
                      WHERE COALESCE(voided,false)=false
                      ORDER BY stage, id`,
        }
      : {
          workflows: `SELECT id, project_id AS projectId, stage, decision, notes, actor_id AS actorId,
                             created_at AS createdAt, updated_at AS updatedAt
                      FROM project_procurement_workflow
                      ${whereMy} ${whereMy ? 'AND' : 'WHERE'} COALESCE(voided,0)=0
                      ORDER BY project_id, updated_at DESC`,
          subjects: `SELECT id, project_id AS projectId, stage, subject_type AS subjectType, subject_name AS subjectName,
                            qualified, latest_score AS latestScore, latest_decision AS latestDecision, metadata,
                            created_at AS createdAt, updated_at AS updatedAt
                     FROM procurement_stage_subjects
                     ${whereMy} ${whereMy ? 'AND' : 'WHERE'} COALESCE(voided,0)=0
                     ORDER BY project_id, stage, id`,
          assessments: `SELECT a.id, a.subject_id AS subjectId, s.project_id AS projectId, s.stage, s.subject_name AS subjectName,
                               a.template_id AS templateId, a.score, a.max_score AS maxScore, a.qualified, a.decision, a.notes, a.responses,
                               a.updated_at AS updatedAt
                        FROM procurement_subject_assessments a
                        JOIN procurement_stage_subjects s ON s.id = a.subject_id
                        ${hasProjectFilter ? 'WHERE s.project_id = ? AND' : 'WHERE'} COALESCE(a.voided,0)=0
                        ORDER BY s.project_id, s.stage, s.subject_name, a.updated_at DESC`,
          checklist: `SELECT id, project_id AS projectId, stage, label, notes, completed, completed_at AS completedAt,
                             completed_by AS completedBy, created_at AS createdAt, updated_at AS updatedAt
                      FROM procurement_checklist_items
                      ${whereMy} ${whereMy ? 'AND' : 'WHERE'} COALESCE(voided,0)=0
                      ORDER BY project_id, stage, id`,
          attachments: `SELECT id, project_id AS projectId, stage, file_name AS fileName, file_path AS filePath,
                               title, notes, uploaded_by AS uploadedBy, created_at AS createdAt
                        FROM procurement_attachments
                        ${whereMy} ${whereMy ? 'AND' : 'WHERE'} COALESCE(voided,0)=0
                        ORDER BY project_id, stage, created_at DESC`,
          templates: `SELECT id, stage, name, subject_type AS subjectType, active, fields, created_at AS createdAt, updated_at AS updatedAt
                      FROM procurement_stage_templates
                      WHERE COALESCE(voided,0)=0
                      ORDER BY stage, id`,
        };

    const [workflows, subjects, assessments, checklist, attachments, templates] = await Promise.all([
      pool.query(queries.workflows, params).then(rowsOf).catch(() => []),
      pool.query(queries.subjects, params).then(rowsOf).catch(() => []),
      pool.query(queries.assessments, params).then(rowsOf).catch(() => []),
      pool.query(queries.checklist, params).then(rowsOf).catch(() => []),
      pool.query(queries.attachments, params).then(rowsOf).catch(() => []),
      pool.query(queries.templates).then(rowsOf).catch(() => []),
    ]);

    const workflowsForExport = mergeWorkflowExportRows(workflows, assessments);

    if (format === 'html') {
      const fn = `procurement-comprehensive-${hasProjectFilter ? `project-${projectId}` : 'all'}-${new Date().toISOString().slice(0, 10)}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${fn}"`);
      return res.send(
        renderProcurementComprehensiveHtml({
          schemaReady: true,
          hasProjectFilter,
          projectId: hasProjectFilter ? projectId : null,
          workflowsForExport,
          subjects,
          assessments,
          checklist,
          attachments,
          templates,
        })
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Procurement Module';
    wb.created = new Date();
    const summary = wb.addWorksheet('Summary');
    summary.columns = [{ header: 'Metric', key: 'metric', width: 34 }, { header: 'Value', key: 'value', width: 36 }];
    summary.addRows([
      { metric: 'Generated At', value: new Date().toISOString() },
      { metric: 'Scope', value: hasProjectFilter ? `Project ${projectId}` : 'All Projects' },
      { metric: 'Schema Ready', value: 'Yes' },
    ]);
    summary.getRow(1).font = { bold: true };

    const addSheet = (name, cols, data) => {
      const ws = wb.addWorksheet(name);
      ws.columns = cols;
      (data || []).forEach((row) => ws.addRow(row));
      ws.getRow(1).font = { bold: true };
      return ws;
    };
    addSheet(
      'Workflow',
      [
        { header: 'Project ID', key: 'projectId', width: 12 },
        { header: 'Stage', key: 'stage', width: 24 },
        { header: 'Decision', key: 'decision', width: 20 },
        { header: 'Notes', key: 'notes', width: 40 },
        { header: 'Actor ID', key: 'actorId', width: 12 },
        { header: 'Updated At', key: 'updatedAt', width: 24 },
      ],
      workflowsForExport
    );
    addSheet(
      'Subjects',
      [
        { header: 'Project ID', key: 'projectId', width: 12 },
        { header: 'Stage', key: 'stage', width: 24 },
        { header: 'Subject Type', key: 'subjectType', width: 16 },
        { header: 'Subject Name', key: 'subjectName', width: 28 },
        { header: 'Qualified', key: 'qualified', width: 12 },
        { header: 'Latest Score', key: 'latestScore', width: 14 },
        { header: 'Latest Decision', key: 'latestDecision', width: 20 },
        { header: 'Metadata (JSON)', key: 'metadataJson', width: 50 },
      ],
      subjects.map((s) => ({ ...s, metadataJson: JSON.stringify(s.metadata || {}) }))
    );
    addSheet(
      'Assessments',
      [
        { header: 'Project ID', key: 'projectId', width: 12 },
        { header: 'Stage', key: 'stage', width: 24 },
        { header: 'Subject Name', key: 'subjectName', width: 28 },
        { header: 'Score', key: 'score', width: 12 },
        { header: 'Max Score', key: 'maxScore', width: 12 },
        { header: 'Qualified', key: 'qualified', width: 12 },
        { header: 'Decision', key: 'decision', width: 20 },
        { header: 'Notes', key: 'notes', width: 32 },
        { header: 'Responses (JSON)', key: 'responsesJson', width: 60 },
      ],
      assessments.map((a) => ({ ...a, responsesJson: JSON.stringify(a.responses || {}) }))
    );
    addSheet(
      'Checklist',
      [
        { header: 'Project ID', key: 'projectId', width: 12 },
        { header: 'Stage', key: 'stage', width: 24 },
        { header: 'Item', key: 'label', width: 32 },
        { header: 'Completed', key: 'completed', width: 12 },
        { header: 'Completed At', key: 'completedAt', width: 24 },
        { header: 'Notes', key: 'notes', width: 40 },
      ],
      checklist
    );
    addSheet(
      'Attachments',
      [
        { header: 'Project ID', key: 'projectId', width: 12 },
        { header: 'Stage', key: 'stage', width: 24 },
        { header: 'Title', key: 'title', width: 30 },
        { header: 'File Name', key: 'fileName', width: 30 },
        { header: 'File Path', key: 'filePath', width: 50 },
        { header: 'Uploaded At', key: 'createdAt', width: 24 },
      ],
      attachments
    );
    addSheet(
      'Templates',
      [
        { header: 'Stage', key: 'stage', width: 24 },
        { header: 'Template Name', key: 'name', width: 30 },
        { header: 'Subject Type', key: 'subjectType', width: 16 },
        { header: 'Active', key: 'active', width: 10 },
        { header: 'Fields (JSON)', key: 'fieldsJson', width: 80 },
      ],
      templates.map((t) => ({ ...t, fieldsJson: JSON.stringify(t.fields || []) }))
    );

    const filename = `procurement-comprehensive-${hasProjectFilter ? `project-${projectId}` : 'all'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting procurement comprehensive workbook:', error);
    return res.status(500).json({ message: 'Error exporting procurement comprehensive workbook', error: error.message });
  }
});

router.get('/projects/:projectId/stages/:stage/subjects', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const stage = String(req.params.stage || '').trim();
  const subjectType = String(req.query?.subjectType || 'bidder').trim() || 'bidder';
  const skipSync =
    req.query?.skipSync === '1' ||
    String(req.query?.skipSync || '').toLowerCase() === 'true';
  if (!Number.isFinite(projectId) || !stage) return res.status(400).json({ message: 'Invalid projectId or stage.' });
  try {
    await ensureProcurementSchema();
    if (!skipSync && subjectType === 'bidder') {
      await syncBidderSubjectsForList(projectId, stage);
    }
    if (subjectType === 'generic') {
      const existsSql = isPostgres
        ? `SELECT id FROM procurement_stage_subjects
           WHERE project_id = $1 AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
             AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
             AND COALESCE(voided, false) = false
           ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1`
        : `SELECT id FROM procurement_stage_subjects
           WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
             AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
             AND COALESCE(voided, 0) = 0
           ORDER BY created_at DESC, id DESC LIMIT 1`;
      const existing = rowsOf(await pool.query(existsSql, [projectId, stage, subjectType]))[0];
      if (!existing) {
        const createdBy = Number(req.user?.userId || req.user?.id || null) || null;
        if (isPostgres) {
          await pool.query(
            `INSERT INTO procurement_stage_subjects
              (project_id, stage, subject_type, subject_name, metadata, created_by, created_at, updated_at, voided)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW(),NOW(),false)`,
            [projectId, stage, subjectType, 'Project', JSON.stringify({}), createdBy]
          );
        } else {
          await pool.query(
            `INSERT INTO procurement_stage_subjects
             (project_id, stage, subject_type, subject_name, metadata, created_by, created_at, updated_at, voided)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
            [projectId, stage, subjectType, 'Project', JSON.stringify({}), createdBy]
          );
        }
      }
    }
    const isBidEvalResponsiveFilter =
      subjectType === 'bidder' && stageNorm(stage) === stageNorm(STAGE_BID_EVALUATION);

    const sql = isPostgres
      ? `SELECT s.id, s.project_id AS "projectId", s.stage, s.subject_type AS "subjectType",
                s.subject_name AS "subjectName", s.metadata, s.qualified, s.latest_score AS "latestScore",
                s.latest_decision AS "latestDecision", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
                a.id AS "assessmentId", a.score, a.max_score AS "maxScore", a.qualified AS "assessmentQualified",
                a.decision, a.updated_at AS "assessmentUpdatedAt"
         FROM procurement_stage_subjects s
         LEFT JOIN LATERAL (
           SELECT id, score, max_score, qualified, decision, updated_at
           FROM procurement_subject_assessments a
           WHERE a.subject_id = s.id AND COALESCE(a.voided, false) = false
           ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
           LIMIT 1
         ) a ON true
         WHERE s.project_id = $1
           AND LOWER(TRIM(s.stage)) = LOWER(TRIM($2))
           AND LOWER(TRIM(s.subject_type)) = LOWER(TRIM($3))
           AND COALESCE(s.voided, false) = false
           ${isBidEvalResponsiveFilter ? `
           AND EXISTS (
             SELECT 1
             FROM procurement_stage_subjects pq
             LEFT JOIN LATERAL (
               SELECT responses
               FROM procurement_subject_assessments pqa
               WHERE pqa.subject_id = pq.id AND COALESCE(pqa.voided, false) = false
               ORDER BY pqa.updated_at DESC NULLS LAST, pqa.id DESC
               LIMIT 1
             ) pqa ON true
             WHERE pq.project_id = s.project_id
               AND LOWER(TRIM(pq.stage)) = LOWER(TRIM($4))
               AND LOWER(TRIM(pq.subject_type)) = LOWER(TRIM($5))
               AND LOWER(TRIM(pq.subject_name)) = LOWER(TRIM(s.subject_name))
               AND COALESCE(pq.voided, false) = false
               AND COALESCE(pq.qualified, false) = true
               AND COALESCE(NULLIF(TRIM(pqa.responses->>'nonResponsiveExcluded'), ''), 'false')::boolean = true
           )` : ''}
         ORDER BY s.created_at DESC, s.id DESC`
      : `SELECT s.id, s.project_id AS projectId, s.stage, s.subject_type AS subjectType,
                s.subject_name AS subjectName, s.metadata, s.qualified, s.latest_score AS latestScore,
                s.latest_decision AS latestDecision, s.created_at AS createdAt, s.updated_at AS updatedAt
         FROM procurement_stage_subjects s
         WHERE s.project_id = ?
           AND LOWER(TRIM(s.stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(s.subject_type)) = LOWER(TRIM(?))
           AND COALESCE(s.voided, 0) = 0
         ORDER BY s.created_at DESC, s.id DESC`;

    const params = isPostgres
      ? (isBidEvalResponsiveFilter
        ? [projectId, stage, subjectType, STAGE_PRE_QUALIFICATION, 'bidder']
        : [projectId, stage, subjectType])
      : [projectId, stage, subjectType];

    const result = await pool.query(sql, params);
    const rows = rowsOf(result).map((r) => {
      const meta = (() => {
        if (r.metadata == null) return {};
        if (typeof r.metadata === 'object') return r.metadata;
        try { return JSON.parse(r.metadata); } catch { return {}; }
      })();
      return { ...r, metadata: meta };
    });
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Error listing stage subjects:', error);
    return res.status(500).json({ message: 'Error listing stage subjects', error: error.message });
  }
});

router.post('/projects/:projectId/stages/:stage/subjects', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const stage = String(req.params.stage || '').trim();
  const subjectType = String(req.body?.subjectType || 'bidder').trim() || 'bidder';
  const subjectName = String(req.body?.subjectName || '').trim();
  const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
  const createdBy = Number(req.user?.userId || req.user?.id || null) || null;
  if (!Number.isFinite(projectId) || !stage || !subjectName) {
    return res.status(400).json({ message: 'Invalid projectId/stage/subjectName.' });
  }
  try {
    await ensureProcurementSchema();

    if (subjectType === 'bidder') {
      if (stageNorm(stage) !== stageNorm(STAGE_BIDDER_REGISTRY)) {
        return res.status(400).json({
          message: `Bidders are registered only in "${STAGE_BIDDER_REGISTRY}". Later stages automatically filter/sync bidders as the procurement progresses.`,
        });
      }
      const nameNorm = subjectName.trim().toLowerCase();
      if (stageNorm(stage) === stageNorm(STAGE_AWARD_DECISION)) {
        const qBe = isPostgres
          ? `SELECT subject_name AS "subjectName" FROM procurement_stage_subjects
             WHERE project_id = $1 AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
               AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
               AND COALESCE(voided, false) = false AND COALESCE(qualified, false) = true`
          : `SELECT subject_name AS subjectName FROM procurement_stage_subjects
             WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
               AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
               AND COALESCE(voided, 0) = 0 AND COALESCE(qualified, 0) = 1`;
        const qualifiedBe = rowsOf(await pool.query(qBe, [projectId, STAGE_BID_EVALUATION, 'bidder']));
        const allowed = new Set(
          qualifiedBe.map((r) => String(r.subjectName || r.subject_name || '').trim().toLowerCase()).filter(Boolean)
        );
        if (allowed.size && !allowed.has(nameNorm)) {
          return res.status(400).json({
            message:
              'Award Decision only accepts bidders who are marked qualified at Bid Evaluation (or sync bidders by opening this stage first).',
          });
        }
      }
      if (stageNorm(stage) === stageNorm(STAGE_CONTRACT_SIGNING)) {
        const qAward = isPostgres
          ? `SELECT subject_name AS "subjectName", latest_decision AS "latestDecision"
             FROM procurement_stage_subjects
             WHERE project_id = $1 AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
               AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
               AND COALESCE(voided, false) = false`
          : `SELECT subject_name AS subjectName, latest_decision AS latestDecision
             FROM procurement_stage_subjects
             WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
               AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
               AND COALESCE(voided, 0) = 0`;
        const awardRows = rowsOf(await pool.query(qAward, [projectId, STAGE_AWARD_DECISION, 'bidder']));
        const awardedNames = new Set(
          awardRows
            .filter((r) => decisionIsAwarded(r.latestDecision || r.latest_decision))
            .map((r) => String(r.subjectName || r.subject_name || '').trim().toLowerCase())
            .filter(Boolean)
        );
        if (awardedNames.size && !awardedNames.has(nameNorm)) {
          return res.status(400).json({
            message:
              'Contract Signing only accepts the bidder whose Award Decision is “Awarded” (open this stage to sync from Award).',
          });
        }
      }
    }

    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_stage_subjects
          (project_id, stage, subject_type, subject_name, metadata, created_by, created_at, updated_at, voided)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW(),NOW(),false)
         RETURNING id, project_id AS "projectId", stage, subject_type AS "subjectType",
                   subject_name AS "subjectName", metadata, qualified, latest_score AS "latestScore",
                   latest_decision AS "latestDecision", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, subjectType, subjectName, JSON.stringify(metadata), createdBy]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const ins = await pool.query(
      `INSERT INTO procurement_stage_subjects
       (project_id, stage, subject_type, subject_name, metadata, created_by, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
      [projectId, stage, subjectType, subjectName, JSON.stringify(metadata), createdBy]
    );
    const id = ins?.insertId || ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, subject_type AS subjectType, subject_name AS subjectName,
              metadata, qualified, latest_score AS latestScore, latest_decision AS latestDecision,
              created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_stage_subjects WHERE id = ?`,
      [id]
    );
    return res.status(201).json(rowsOf(sel)[0]);
  } catch (error) {
    console.error('Error creating stage subject:', error);
    return res.status(500).json({ message: 'Error creating stage subject', error: error.message });
  }
});

router.patch('/subjects/:subjectId', async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isFinite(subjectId)) return res.status(400).json({ message: 'Invalid subject id.' });
  const subjectName = req.body?.subjectName != null ? String(req.body.subjectName).trim() : undefined;
  if (subjectName !== undefined && !subjectName) return res.status(400).json({ message: 'subjectName cannot be empty.' });
  try {
    await ensureProcurementSchema();
    const subj = rowsOf(await pool.query(
      isPostgres
        ? `SELECT id, project_id AS "projectId", stage, subject_type AS "subjectType"
           FROM procurement_stage_subjects
           WHERE id = $1 AND COALESCE(voided,false)=false`
        : `SELECT id, project_id AS projectId, stage, subject_type AS subjectType
           FROM procurement_stage_subjects
           WHERE id = ? AND COALESCE(voided,0)=0`,
      [subjectId]
    ))[0];
    if (!subj) return res.status(404).json({ message: 'Subject not found.' });

    // Only allow editing bidder registry entries (master list).
    if (stageNorm(subj.stage) !== stageNorm(STAGE_BIDDER_REGISTRY) || stageNorm(subj.subjectType) !== 'bidder') {
      return res.status(400).json({ message: `Only "${STAGE_BIDDER_REGISTRY}" bidder entries can be edited.` });
    }

    if (subjectName === undefined) return res.status(400).json({ message: 'No fields to update.' });
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE procurement_stage_subjects
         SET subject_name = $1, updated_at = NOW()
         WHERE id = $2 AND COALESCE(voided,false)=false
         RETURNING id, project_id AS "projectId", stage, subject_type AS "subjectType",
                   subject_name AS "subjectName", metadata, qualified, latest_score AS "latestScore",
                   latest_decision AS "latestDecision", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [subjectName, subjectId]
      );
      const row = rowsOf(r)[0];
      if (!row) return res.status(404).json({ message: 'Subject not found.' });
      return res.status(200).json(row);
    }
    await pool.query(
      `UPDATE procurement_stage_subjects
       SET subject_name = ?, updated_at = NOW()
       WHERE id = ? AND COALESCE(voided,0)=0`,
      [subjectName, subjectId]
    );
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, subject_type AS subjectType,
              subject_name AS subjectName, metadata, qualified, latest_score AS latestScore,
              latest_decision AS latestDecision, created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_stage_subjects WHERE id = ?`,
      [subjectId]
    );
    return res.status(200).json(rowsOf(sel)[0]);
  } catch (error) {
    console.error('Error updating procurement subject:', error);
    return res.status(500).json({ message: 'Error updating procurement subject', error: error.message });
  }
});

router.delete('/subjects/:subjectId', async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isFinite(subjectId)) return res.status(400).json({ message: 'Invalid subject id.' });
  try {
    await ensureProcurementSchema();
    const subj = rowsOf(await pool.query(
      isPostgres
        ? `SELECT id, project_id AS "projectId", stage, subject_type AS "subjectType"
           FROM procurement_stage_subjects
           WHERE id = $1 AND COALESCE(voided,false)=false`
        : `SELECT id, project_id AS projectId, stage, subject_type AS subjectType
           FROM procurement_stage_subjects
           WHERE id = ? AND COALESCE(voided,0)=0`,
      [subjectId]
    ))[0];
    if (!subj) return res.status(404).json({ message: 'Subject not found.' });

    if (stageNorm(subj.stage) !== stageNorm(STAGE_BIDDER_REGISTRY) || stageNorm(subj.subjectType) !== 'bidder') {
      return res.status(400).json({ message: `Only "${STAGE_BIDDER_REGISTRY}" bidder entries can be deleted.` });
    }

    if (isPostgres) {
      await pool.query('BEGIN');
      await pool.query(
        `UPDATE procurement_stage_subjects SET voided = true, updated_at = NOW()
         WHERE id = $1 AND COALESCE(voided,false)=false`,
        [subjectId]
      );
      await pool.query(
        `UPDATE procurement_subject_assessments SET voided = true, updated_at = NOW()
         WHERE subject_id = $1 AND COALESCE(voided,false)=false`,
        [subjectId]
      );
      // If bidder-linked documents exist, void them too.
      try {
        await pool.query(
          `UPDATE procurement_attachments SET voided = true, updated_at = NOW()
           WHERE subject_id = $1 AND COALESCE(voided,false)=false`,
          [subjectId]
        );
      } catch {
        // ignore if subject_id column not present in older DBs
      }
      await pool.query('COMMIT');
      return res.status(204).send();
    }

    await pool.query(
      `UPDATE procurement_stage_subjects SET voided = 1, updated_at = NOW()
       WHERE id = ? AND COALESCE(voided,0)=0`,
      [subjectId]
    );
    await pool.query(
      `UPDATE procurement_subject_assessments SET voided = 1, updated_at = NOW()
       WHERE subject_id = ? AND COALESCE(voided,0)=0`,
      [subjectId]
    );
    try {
      await pool.query(
        `UPDATE procurement_attachments SET voided = 1, updated_at = NOW()
         WHERE subject_id = ? AND COALESCE(voided,0)=0`,
        [subjectId]
      );
    } catch {
      // ignore
    }
    return res.status(204).send();
  } catch (error) {
    try { if (isPostgres) await pool.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Error deleting procurement subject:', error);
    return res.status(500).json({ message: 'Error deleting procurement subject', error: error.message });
  }
});

router.get('/subjects/:subjectId/assessment', async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isFinite(subjectId)) return res.status(400).json({ message: 'Invalid subject id.' });
  try {
    await ensureProcurementSchema();
    const subjSql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, subject_type AS "subjectType",
                subject_name AS "subjectName", metadata, qualified, latest_score AS "latestScore",
                latest_decision AS "latestDecision", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_stage_subjects
         WHERE id = $1 AND COALESCE(voided, false) = false`
      : `SELECT id, project_id AS projectId, stage, subject_type AS subjectType,
                subject_name AS subjectName, metadata, qualified, latest_score AS latestScore,
                latest_decision AS latestDecision, created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_stage_subjects
         WHERE id = ? AND COALESCE(voided, 0) = 0`;
    const subjRes = await pool.query(subjSql, [subjectId]);
    const subject = rowsOf(subjRes)[0];
    if (!subject) return res.status(404).json({ message: 'Subject not found.' });

    const prefName = preferredTemplateNameForAssessment(subject.stage);
    const templateSql = isPostgres
      ? `SELECT id, stage, name, subject_type AS "subjectType", fields, active
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM($1))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($2))
           AND COALESCE(voided, false) = false
           AND COALESCE(active, true) = true
         ORDER BY
           CASE WHEN $3::text <> '' AND LOWER(TRIM(name)) = LOWER(TRIM($3::text)) THEN 0 ELSE 1 END,
           id DESC
         LIMIT 1`
      : `SELECT id, stage, name, subject_type AS subjectType, fields, active
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided, 0) = 0
           AND COALESCE(active, 1) = 1
         ORDER BY
           CASE WHEN ? <> '' AND LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,
           id DESC
         LIMIT 1`;
    const tplParams = isPostgres
      ? [subject.stage, subject.subjectType || 'bidder', prefName]
      : [subject.stage, subject.subjectType || 'bidder', prefName, prefName];
    const tplRes = await pool.query(templateSql, tplParams);
    let template = rowsOf(tplRes)[0] || null;
    if (!template) {
      const altType = alternateSubjectType(subject.subjectType || 'bidder');
      const altParams = isPostgres
        ? [subject.stage, altType, prefName]
        : [subject.stage, altType, prefName, prefName];
      const altRes = await pool.query(templateSql, altParams);
      template = rowsOf(altRes)[0] || null;
    }

    const assessmentSql = isPostgres
      ? `SELECT id, subject_id AS "subjectId", template_id AS "templateId", responses, score, max_score AS "maxScore",
                qualified, decision, notes, submitted_by AS "submittedBy",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_subject_assessments
         WHERE subject_id = $1 AND COALESCE(voided, false) = false
         ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`
      : `SELECT id, subject_id AS subjectId, template_id AS templateId, responses, score, max_score AS maxScore,
                qualified, decision, notes, submitted_by AS submittedBy,
                created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_subject_assessments
         WHERE subject_id = ? AND COALESCE(voided, 0) = 0
         ORDER BY updated_at DESC, id DESC LIMIT 1`;
    const asRes = await pool.query(assessmentSql, [subjectId]);
    const assessment = rowsOf(asRes)[0] || null;

    const normalizeJson = (v, fallback) => {
      if (v == null) return fallback;
      if (typeof v === 'object') return v;
      try { return JSON.parse(v); } catch { return fallback; }
    };
    const subjectMeta = normalizeJson(subject.metadata, {});
    const assessmentObj = assessment ? { ...assessment, responses: normalizeJson(assessment.responses, {}) } : null;
    const responsesMerged = (() => {
      const base = assessmentObj?.responses && typeof assessmentObj.responses === 'object' ? assessmentObj.responses : {};
      const isRegistry = stageNorm(subject.stage) === stageNorm(STAGE_BIDDER_REGISTRY);
      if (!isRegistry) return base;
      // Pre-fill from metadata for registry stage (useful when older saves only touched metadata).
      const patch = pickBidderRegistryMetadata(subjectMeta);
      if (!Object.keys(patch).length) return base;
      return { ...patch, ...base };
    })();
    let tplFields = normalizeTemplateFields(normalizeJson(template?.fields, []));
    if (template && stageNorm(subject.stage) === stageNorm(STAGE_BIDDER_REGISTRY)) {
      tplFields = orderBidderRegistryTemplateFields(tplFields);
    } else if (template && stageNorm(subject.stage) === stageNorm(STAGE_CONTRACT_SIGNING)) {
      tplFields = mergeContractSigningTemplateWithDefaults(tplFields);
    }
    return res.status(200).json({
      subject: { ...subject, metadata: subjectMeta },
      template: template ? { ...template, fields: tplFields } : null,
      assessment: assessmentObj ? { ...assessmentObj, responses: responsesMerged } : null,
    });
  } catch (error) {
    console.error('Error loading subject assessment:', error);
    return res.status(500).json({ message: 'Error loading subject assessment', error: error.message });
  }
});

router.put('/subjects/:subjectId/assessment', async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  if (!Number.isFinite(subjectId)) return res.status(400).json({ message: 'Invalid subject id.' });
  const responses = req.body?.responses && typeof req.body.responses === 'object' ? req.body.responses : {};
  const decision = req.body?.decision != null ? String(req.body.decision).trim() : null;
  const notes = req.body?.notes != null ? String(req.body.notes).trim() : null;
  const submittedBy = Number(req.user?.userId || req.user?.id || null) || null;
  try {
    await ensureProcurementSchema();
    const subjectSql = isPostgres
      ? `SELECT id, stage, subject_type AS "subjectType"
         FROM procurement_stage_subjects
         WHERE id = $1 AND COALESCE(voided, false) = false`
      : `SELECT id, stage, subject_type AS subjectType
         FROM procurement_stage_subjects
         WHERE id = ? AND COALESCE(voided, 0) = 0`;
    const subjectRes = await pool.query(subjectSql, [subjectId]);
    const subject = rowsOf(subjectRes)[0];
    if (!subject) return res.status(404).json({ message: 'Subject not found.' });

    const prefNameSave = preferredTemplateNameForAssessment(subject.stage);
    const tplSql = isPostgres
      ? `SELECT id, fields
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM($1))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($2))
           AND COALESCE(voided, false) = false
           AND COALESCE(active, true) = true
         ORDER BY
           CASE WHEN $3::text <> '' AND LOWER(TRIM(name)) = LOWER(TRIM($3::text)) THEN 0 ELSE 1 END,
           id DESC
         LIMIT 1`
      : `SELECT id, fields
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided, 0) = 0
           AND COALESCE(active, 1) = 1
         ORDER BY
           CASE WHEN ? <> '' AND LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,
           id DESC
         LIMIT 1`;
    const tplParamsSave = isPostgres
      ? [subject.stage, subject.subjectType || 'bidder', prefNameSave]
      : [subject.stage, subject.subjectType || 'bidder', prefNameSave, prefNameSave];
    const tplRes = await pool.query(tplSql, tplParamsSave);
    let tpl = rowsOf(tplRes)[0];
    if (!tpl) {
      const altType = alternateSubjectType(subject.subjectType || 'bidder');
      const altParams = isPostgres
        ? [subject.stage, altType, prefNameSave]
        : [subject.stage, altType, prefNameSave, prefNameSave];
      const altRes = await pool.query(tplSql, altParams);
      tpl = rowsOf(altRes)[0];
    }
    if (!tpl) return res.status(400).json({ message: 'No active template found for this stage/subject type.' });
    const rawFields = tpl.fields && typeof tpl.fields === 'object' ? tpl.fields : (() => {
      try { return JSON.parse(tpl.fields || '[]'); } catch { return []; }
    })();
    let fields = normalizeTemplateFields(rawFields);
    if (stageNorm(subject.stage) === stageNorm(STAGE_BIDDER_REGISTRY)) {
      fields = orderBidderRegistryTemplateFields(fields);
    } else if (stageNorm(subject.stage) === stageNorm(STAGE_CONTRACT_SIGNING)) {
      fields = mergeContractSigningTemplateWithDefaults(fields);
    }
    const scored = scoreAssessment(fields, responses);
    let qualified = req.body?.qualified !== undefined
      ? Boolean(req.body.qualified === true || req.body.qualified === 1 || req.body.qualified === '1')
      : scored.qualified;

    // For Bid Evaluation, only bidders explicitly recommended should proceed to Award Decision.
    if (stageNorm(subject.stage) === stageNorm(STAGE_BID_EVALUATION)) {
      const rec = responses?.recommendedForAward;
      const yes = rec === true || rec === 1 || rec === '1' || String(rec).toLowerCase() === 'true';
      if (!yes) qualified = false;
    }

    let saved;
    if (isPostgres) {
      const existing = rowsOf(await pool.query(
        `SELECT id
         FROM procurement_subject_assessments
         WHERE subject_id = $1 AND COALESCE(voided, false) = false
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [subjectId]
      ))[0];

      if (existing?.id) {
        const upd = await pool.query(
          `UPDATE procurement_subject_assessments
           SET template_id = $1,
               responses = $2::jsonb,
               score = $3,
               max_score = $4,
               qualified = $5,
               decision = $6,
               notes = $7,
               submitted_by = $8,
               updated_at = NOW(),
               voided = false
           WHERE id = $9
           RETURNING id, subject_id AS "subjectId", template_id AS "templateId", responses, score, max_score AS "maxScore",
                     qualified, decision, notes, submitted_by AS "submittedBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
          [tpl.id, JSON.stringify(responses), scored.score, scored.maxScore, qualified, decision, notes, submittedBy, existing.id]
        );
        saved = rowsOf(upd)[0];
      } else {
        const ins = await pool.query(
          `INSERT INTO procurement_subject_assessments
            (subject_id, template_id, responses, score, max_score, qualified, decision, notes, submitted_by, created_at, updated_at, voided)
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,NOW(),NOW(),false)
           RETURNING id, subject_id AS "subjectId", template_id AS "templateId", responses, score, max_score AS "maxScore",
                     qualified, decision, notes, submitted_by AS "submittedBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
          [subjectId, tpl.id, JSON.stringify(responses), scored.score, scored.maxScore, qualified, decision, notes, submittedBy]
        );
        saved = rowsOf(ins)[0];
      }
      // Ensure "latest assessment" is deterministic: void older rows for this subject.
      await pool.query(
        `UPDATE procurement_subject_assessments
         SET voided = true, updated_at = NOW()
         WHERE subject_id = $1 AND id <> $2 AND COALESCE(voided, false) = false`,
        [subjectId, saved.id]
      );
      await pool.query(
        `UPDATE procurement_stage_subjects
         SET qualified = $1, latest_score = $2, latest_decision = $3, updated_at = NOW()
         WHERE id = $4`,
        [qualified, scored.score, decision, subjectId]
      );
      if (stageNorm(subject.stage) === stageNorm(STAGE_BIDDER_REGISTRY) && stageNorm(subject.subjectType) === 'bidder') {
        const metaPatch = pickBidderRegistryMetadata(responses);
        if (Object.keys(metaPatch).length) {
          await pool.query(
            `UPDATE procurement_stage_subjects
             SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(metaPatch), subjectId]
          );
        }
      }
    } else {
      const ins = await pool.query(
        `INSERT INTO procurement_subject_assessments
         (subject_id, template_id, responses, score, max_score, qualified, decision, notes, submitted_by, created_at, updated_at, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
        [subjectId, tpl.id, JSON.stringify(responses), scored.score, scored.maxScore, qualified ? 1 : 0, decision, notes, submittedBy]
      );
      const id = ins?.insertId || ins?.[0]?.insertId;
      const sel = await pool.query(
        `SELECT id, subject_id AS subjectId, template_id AS templateId, responses, score, max_score AS maxScore,
                qualified, decision, notes, submitted_by AS submittedBy, created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_subject_assessments WHERE id = ?`,
        [id]
      );
      saved = rowsOf(sel)[0];
      // Ensure "latest assessment" is deterministic: void older rows for this subject.
      await pool.query(
        `UPDATE procurement_subject_assessments
         SET voided = 1, updated_at = NOW()
         WHERE subject_id = ? AND id <> ? AND COALESCE(voided, 0) = 0`,
        [subjectId, id]
      );
      await pool.query(
        `UPDATE procurement_stage_subjects
         SET qualified = ?, latest_score = ?, latest_decision = ?, updated_at = NOW()
         WHERE id = ?`,
        [qualified ? 1 : 0, scored.score, decision, subjectId]
      );
      if (stageNorm(subject.stage) === stageNorm(STAGE_BIDDER_REGISTRY) && stageNorm(subject.subjectType) === 'bidder') {
        const metaPatch = pickBidderRegistryMetadata(responses);
        if (Object.keys(metaPatch).length) {
          const metaRow = rowsOf(await pool.query(
            `SELECT metadata FROM procurement_stage_subjects WHERE id = ?`,
            [subjectId]
          ))[0];
          let current = {};
          try { current = metaRow?.metadata && typeof metaRow.metadata === 'object' ? metaRow.metadata : JSON.parse(metaRow?.metadata || '{}'); } catch { current = {}; }
          const merged = { ...(current && typeof current === 'object' ? current : {}), ...metaPatch };
          await pool.query(
            `UPDATE procurement_stage_subjects SET metadata = ?, updated_at = NOW() WHERE id = ?`,
            [JSON.stringify(merged), subjectId]
          );
        }
      }
    }
    return res.status(200).json({
      ...saved,
      responses,
      scoreSummary: {
        score: scored.score,
        maxScore: scored.maxScore,
        qualified,
        missingRequired: scored.missingRequired,
      },
    });
  } catch (error) {
    console.error('Error saving subject assessment:', error);
    return res.status(500).json({ message: 'Error saving subject assessment', error: error.message });
  }
});

module.exports = router;
