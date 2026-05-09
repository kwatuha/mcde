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

/** Canonical procurement stage labels (sync / gates / seeds). */
const STAGE_BIDDER_REGISTRY = 'Bidder Registry';
const STAGE_PRE_QUALIFICATION = 'Bidder Pre-Qualification';
const STAGE_BID_EVALUATION = 'Bid Evaluation';
const STAGE_AWARD_DECISION = 'Award Decision';
const STAGE_CONTRACT_SIGNING = 'Contract Signing';
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
  'Purchase Order Issued',
  STAGE_PROCUREMENT_TERMINATED,
];

function stageNorm(s) {
  return String(s || '').trim().toLowerCase();
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
    { key: 'companyName', label: 'Company / bidder name', type: 'text', required: true, weight: 0 },
    { key: 'contactName', label: 'Contact person name', type: 'text', required: false, weight: 0 },
    { key: 'contactPhone', label: 'Contact phone number', type: 'text', required: false, weight: 0 },
    { key: 'contactEmail', label: 'Contact email', type: 'text', required: false, weight: 0 },
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
  if (!isPostgres || !Number.isFinite(projectId)) return { skipped: true };
  if (stageNorm(stage) !== stageNorm(STAGE_CONTRACT_SIGNING)) return { skipped: true };
  const dec = String(decision || '').trim().toLowerCase();
  if (dec !== 'approved') return { skipped: true };

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

  await pool.query(
    `UPDATE projects
     SET progress = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 COALESCE(progress, '{}'::jsonb),
                 '{status}',
                 '"Not Started"'::jsonb,
                 true
               ),
               '{procurement_completed_at}',
               to_jsonb(NOW()::text),
               true
             ),
             '{procurement_previous_status}',
             to_jsonb(COALESCE($2::text, '')),
             true
           ),
           '{procurement_awarded_contractor_id}',
           to_jsonb($3::int),
           true
         ),
         updated_at = NOW()
     WHERE project_id = $1 AND COALESCE(voided, false) = false`,
    [projectId, prevStatus, contractorId]
  );

  return {
    ok: true,
    contractorId,
    companyName,
    projectId,
    message: 'Project handed off to contractors as Not Started; procurement history retained on workflow & assessments.',
  };
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
         wf.updated_at AS "lastWorkflowAt"
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT stage, decision, updated_at
         FROM project_procurement_workflow w
         WHERE w.project_id = p.project_id AND COALESCE(w.voided, false) = false
         ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
         LIMIT 1
       ) wf ON true
       WHERE COALESCE(p.voided, false) = false
         AND p.progress ? 'procurement_completed_at'
       ORDER BY (p.progress->>'procurement_completed_at') DESC NULLS LAST`
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
      const row = rowsOf(result)[0];
      try {
        await finalizeProcurementContractClosure(projectId, stage, decision);
      } catch (finErr) {
        console.error('finalizeProcurementContractClosure (workflow POST):', finErr);
      }
      return res.status(201).json(row);
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
      try {
        await finalizeProcurementContractClosure(projectId, row.stage, row.decision ?? decision);
      } catch (finErr) {
        console.error('finalizeProcurementContractClosure (workflow PATCH):', finErr);
      }
      return res.status(200).json(row);
    }
    if ((r?.affectedRows || r?.[0]?.affectedRows || 0) <= 0) return res.status(404).json({ message: 'Workflow step not found.' });
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, decision, notes, actor_id AS actorId,
              created_at AS createdAt, updated_at AS updatedAt
       FROM project_procurement_workflow WHERE id = ?`,
      [workflowId]
    );
    return res.status(200).json(rowsOf(sel)[0]);
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
    return res.status(200).json({
      subject: { ...subject, metadata: subjectMeta },
      template: template
        ? { ...template, fields: normalizeTemplateFields(normalizeJson(template.fields, [])) }
        : null,
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
    const fields = normalizeTemplateFields(rawFields);
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
