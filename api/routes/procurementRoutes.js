const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

/** Default workflow stage labels (seed once into procurement_stages). Matches legacy Procurement UI. */
const PROCUREMENT_STAGE_SEED_LABELS = [
  'Needs Identification',
  'Requisition Approved',
  'Tender Published',
  'Bid Evaluation',
  'Award Decision',
  'Contract Signing',
  'Purchase Order Issued',
];

const rowsOf = (result) => {
  if (Array.isArray(result)) return result[0] || [];
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
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
        subject_type VARCHAR(80) NOT NULL DEFAULT 'bidder',
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0
      )
    `);
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
    { key: 'reviewNotes', label: 'Reviewer notes', type: 'textarea', required: false, weight: 0 },
  ];
}

async function seedBidEvaluationTemplateIfNeeded() {
  const stage = 'Bid Evaluation';
  const name = 'Bidder Suitability Checklist';
  const subjectType = 'bidder';
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
      [stage, name, subjectType, JSON.stringify(getDefaultBidEvaluationFields())]
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
        [stage, name, subjectType, JSON.stringify(getDefaultBidEvaluationFields())]
      );
    }
  }
}

async function seedBidEvaluationGateRuleIfNeeded() {
  const stage = 'Bid Evaluation';
  const minQualified = 1;
  const subjectType = 'bidder';
  if (isPostgres) {
    await pool.query(
      `INSERT INTO procurement_stage_gate_rules
       (stage, min_qualified_subjects, subject_type, active, voided, created_at, updated_at)
       SELECT $1::varchar, $2::int, $3::varchar, true, false, NOW(), NOW()
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
         (stage, min_qualified_subjects, subject_type, active, voided, created_at, updated_at)
         VALUES (?, ?, ?, 1, 0, NOW(), NOW())`,
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
  const fromOrder = await getStageSortOrder(fromStage);
  const toOrder = await getStageSortOrder(toStage);
  if (!Number.isFinite(fromOrder) || !Number.isFinite(toOrder) || toOrder <= fromOrder) {
    return { ok: true };
  }
  const rules = isPostgres
    ? rowsOf(await pool.query(
        `SELECT r.stage, r.min_qualified_subjects AS "minQualified", r.subject_type AS "subjectType", s.sort_order
         FROM procurement_stage_gate_rules r
         JOIN procurement_stages s ON LOWER(TRIM(s.label)) = LOWER(TRIM(r.stage))
         WHERE COALESCE(r.voided,false)=false AND COALESCE(r.active,true)=true
           AND s.sort_order >= $1 AND s.sort_order < $2
         ORDER BY s.sort_order ASC`,
        [fromOrder, toOrder]
      ))
    : rowsOf(await pool.query(
        `SELECT r.stage, r.min_qualified_subjects AS minQualified, r.subject_type AS subjectType, s.sort_order
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
    const countSql = isPostgres
      ? `SELECT COUNT(*)::int AS c
         FROM procurement_stage_subjects
         WHERE project_id = $1
           AND LOWER(TRIM(stage)) = LOWER(TRIM($2))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($3))
           AND COALESCE(voided,false)=false
           AND COALESCE(qualified,false)=true`
      : `SELECT COUNT(*) AS c
         FROM procurement_stage_subjects
         WHERE project_id = ? AND LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided,0)=0 AND COALESCE(qualified,0)=1`;
    const cr = await pool.query(countSql, [projectId, rule.stage, subjectType]);
    const c = Number(rowsOf(cr)[0]?.c || 0);
    if (c < minQualified) {
      return {
        ok: false,
        message: `Stage gate failed: ${rule.stage} requires at least ${minQualified} qualified ${subjectType}(s). Current: ${c}.`,
      };
    }
  }
  return { ok: true };
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
  if (procurementSchemaEnsured) return;
  await ensureProcurementWorkflowTable();
  await ensureProcurementStagesTable();
  await ensureProcurementAttachmentsTable();
  await ensureProcurementChecklistTable();
  await ensureProcurementTemplatesTable();
  await ensureProcurementSubjectsTable();
  await ensureProcurementAssessmentsTable();
  await ensureProcurementGateRulesTable();
  await seedProcurementStagesIfNeeded();
  await seedBidEvaluationTemplateIfNeeded();
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
            COALESCE(p.status, '') AS "projectStatus",
            p.implementing_agency AS "implementingAgency",
            0::numeric AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
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
            COALESCE(p.status, '') AS "projectStatus",
            p.directorate AS "implementingAgency",
            COALESCE(p."costOfProject", 0) AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
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
            COALESCE(p.status, '') AS "projectStatus",
            p.directorate AS "implementingAgency",
            COALESCE(p."costOfProject", 0) AS "budget",
            NULL::text AS "procurementStage",
            NULL::text AS "latestDecision",
            p."updatedAt" AS "updatedAt"
          FROM projects p
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
                  COALESCE(p.progress->>'status','') AS "projectStatus",
                  p.implementing_agency AS "implementingAgency",
                  0::numeric AS "budget",
                  NULL::text AS "procurementStage",
                  NULL::text AS "latestDecision",
                  p.updated_at AS "updatedAt"
           FROM projects p
           WHERE COALESCE(p.voided, false) = false
             AND LOWER(COALESCE(p.progress->>'status','')) LIKE '%procurement%'
           ORDER BY p.updated_at DESC NULLS LAST`,
          `SELECT p.id AS "projectId", p."projectName" AS "projectName",
                  COALESCE(p.status,'') AS "projectStatus",
                  p.directorate AS "implementingAgency",
                  COALESCE(p."costOfProject",0) AS "budget",
                  NULL::text AS "procurementStage",
                  NULL::text AS "latestDecision",
                  p."updatedAt" AS "updatedAt"
           FROM projects p
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
      return res.status(200).json(rows || []);
    }

    const result = await pool.query(`
      SELECT
        p.id AS projectId,
        p.projectName,
        COALESCE(p.status, '') AS projectStatus,
        p.directorate AS implementingAgency,
        COALESCE(p.costOfProject, 0) AS budget,
        wf.stage AS procurementStage,
        wf.decision AS latestDecision,
        wf.updated_at AS updatedAt
      FROM projects p
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
    return res.status(200).json(rowsOf(result));
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
      return res.status(201).json(rowsOf(result)[0]);
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
    return res.status(201).json(rowsOf(selected)[0]);
  } catch (error) {
    console.error('Error adding procurement workflow step:', error);
    return res.status(500).json({ message: 'Error adding procurement workflow step', error: error.message });
  }
});

router.get('/projects/:projectId/attachments', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.query?.stage || '').trim();
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, file_name AS "fileName", file_path AS "filePath",
                mime_type AS "mimeType", file_size AS "fileSize", title, notes,
                uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_attachments
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND ($2::text = '' OR COALESCE(stage, '') = $2::text)
         ORDER BY created_at DESC, id DESC`
      : `SELECT id, project_id AS projectId, stage, file_name AS fileName, file_path AS filePath,
                mime_type AS mimeType, file_size AS fileSize, title, notes,
                uploaded_by AS uploadedBy, created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_attachments
         WHERE project_id = ?
           AND COALESCE(voided, 0) = 0
           AND (? = '' OR COALESCE(stage, '') = ?)
         ORDER BY created_at DESC, id DESC`;
    const params = isPostgres ? [projectId, stage] : [projectId, stage, stage];
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
  const title = String(req.body?.title || '').trim() || null;
  const notes = String(req.body?.notes || '').trim() || null;
  const uploadedBy = Number(req.user?.userId || req.user?.id || null) || null;
  const relPath = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_attachments
          (project_id, stage, file_name, file_path, mime_type, file_size, title, notes, uploaded_by, created_at, updated_at, voided)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),false)
         RETURNING id, project_id AS "projectId", stage, file_name AS "fileName", file_path AS "filePath",
                   mime_type AS "mimeType", file_size AS "fileSize", title, notes, uploaded_by AS "uploadedBy",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, req.file.originalname, relPath, req.file.mimetype || null, req.file.size || null, title, notes, uploadedBy]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const ins = await pool.query(
      `INSERT INTO procurement_attachments
       (project_id, stage, file_name, file_path, mime_type, file_size, title, notes, uploaded_by, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
      [projectId, stage, req.file.originalname, relPath, req.file.mimetype || null, req.file.size || null, title, notes, uploadedBy]
    );
    const insertId = ins?.insertId || ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, file_name AS fileName, file_path AS filePath,
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
  const fallbackTemplates = [
    {
      id: -1,
      stage: 'Bid Evaluation',
      name: 'Bidder Suitability Checklist',
      subjectType: 'bidder',
      fields: normalizeTemplateFields(getDefaultBidEvaluationFields()),
      active: true,
      createdAt: null,
      updatedAt: null,
    },
  ];
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
    const sql = isPostgres
      ? `SELECT id, stage, name, subject_type AS "subjectType", fields, active,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_stage_templates
         WHERE COALESCE(voided, false) = false
           AND ($1::text = '' OR LOWER(TRIM(stage)) = LOWER(TRIM($1::text)))
           AND ($2::boolean = true OR COALESCE(active, true) = true)
         ORDER BY stage ASC, id ASC`
      : `SELECT id, stage, name, subject_type AS subjectType, fields, active,
                created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_stage_templates
         WHERE COALESCE(voided, 0) = 0
           AND (? = '' OR LOWER(TRIM(stage)) = LOWER(TRIM(?)))
           AND (? = 1 OR COALESCE(active, 1) = 1)
         ORDER BY stage ASC, id ASC`;
    const params = isPostgres ? [stage, includeInactive] : [stage, stage, includeInactive ? 1 : 0];
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
  try {
    let schemaReady = true;
    try {
      await ensureProcurementSchema();
    } catch {
      schemaReady = false;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Procurement Module';
    wb.created = new Date();
    const summary = wb.addWorksheet('Summary');
    summary.columns = [{ header: 'Metric', key: 'metric', width: 34 }, { header: 'Value', key: 'value', width: 36 }];
    summary.addRows([
      { metric: 'Generated At', value: new Date().toISOString() },
      { metric: 'Scope', value: hasProjectFilter ? `Project ${projectId}` : 'All Projects' },
      { metric: 'Schema Ready', value: schemaReady ? 'Yes' : 'No (fallback export)' },
    ]);
    summary.getRow(1).font = { bold: true };

    if (!schemaReady) {
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
      workflows
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
  if (!Number.isFinite(projectId) || !stage) return res.status(400).json({ message: 'Invalid projectId or stage.' });
  try {
    await ensureProcurementSchema();
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
    const result = await pool.query(sql, [projectId, stage, subjectType]);
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

    const templateSql = isPostgres
      ? `SELECT id, stage, name, subject_type AS "subjectType", fields, active
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM($1))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($2))
           AND COALESCE(voided, false) = false
           AND COALESCE(active, true) = true
         ORDER BY id DESC LIMIT 1`
      : `SELECT id, stage, name, subject_type AS subjectType, fields, active
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided, 0) = 0
           AND COALESCE(active, 1) = 1
         ORDER BY id DESC LIMIT 1`;
    const tplRes = await pool.query(templateSql, [subject.stage, subject.subjectType || 'bidder']);
    const template = rowsOf(tplRes)[0] || null;

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
    return res.status(200).json({
      subject: { ...subject, metadata: normalizeJson(subject.metadata, {}) },
      template: template
        ? { ...template, fields: normalizeTemplateFields(normalizeJson(template.fields, [])) }
        : null,
      assessment: assessment
        ? { ...assessment, responses: normalizeJson(assessment.responses, {}) }
        : null,
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

    const tplSql = isPostgres
      ? `SELECT id, fields
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM($1))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM($2))
           AND COALESCE(voided, false) = false
           AND COALESCE(active, true) = true
         ORDER BY id DESC LIMIT 1`
      : `SELECT id, fields
         FROM procurement_stage_templates
         WHERE LOWER(TRIM(stage)) = LOWER(TRIM(?))
           AND LOWER(TRIM(subject_type)) = LOWER(TRIM(?))
           AND COALESCE(voided, 0) = 0
           AND COALESCE(active, 1) = 1
         ORDER BY id DESC LIMIT 1`;
    const tplRes = await pool.query(tplSql, [subject.stage, subject.subjectType || 'bidder']);
    const tpl = rowsOf(tplRes)[0];
    if (!tpl) return res.status(400).json({ message: 'No active template found for this stage/subject type.' });
    const rawFields = tpl.fields && typeof tpl.fields === 'object' ? tpl.fields : (() => {
      try { return JSON.parse(tpl.fields || '[]'); } catch { return []; }
    })();
    const fields = normalizeTemplateFields(rawFields);
    const scored = scoreAssessment(fields, responses);
    const qualified = req.body?.qualified !== undefined
      ? Boolean(req.body.qualified === true || req.body.qualified === 1 || req.body.qualified === '1')
      : scored.qualified;

    let saved;
    if (isPostgres) {
      const upsert = await pool.query(
        `INSERT INTO procurement_subject_assessments
          (subject_id, template_id, responses, score, max_score, qualified, decision, notes, submitted_by, created_at, updated_at, voided)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,NOW(),NOW(),false)
         RETURNING id, subject_id AS "subjectId", template_id AS "templateId", responses, score, max_score AS "maxScore",
                   qualified, decision, notes, submitted_by AS "submittedBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [subjectId, tpl.id, JSON.stringify(responses), scored.score, scored.maxScore, qualified, decision, notes, submittedBy]
      );
      saved = rowsOf(upsert)[0];
      await pool.query(
        `UPDATE procurement_stage_subjects
         SET qualified = $1, latest_score = $2, latest_decision = $3, updated_at = NOW()
         WHERE id = $4`,
        [qualified, scored.score, decision, subjectId]
      );
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
      await pool.query(
        `UPDATE procurement_stage_subjects
         SET qualified = ?, latest_score = ?, latest_decision = ?, updated_at = NOW()
         WHERE id = ?`,
        [qualified ? 1 : 0, scored.score, decision, subjectId]
      );
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
