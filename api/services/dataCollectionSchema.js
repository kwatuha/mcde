const pool = require('../config/db');

async function ensureDataCollectionTemplatesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_collection_templates (
      template_id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NULL,
      template_category TEXT NOT NULL DEFAULT 'general',
      structure JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS description TEXT NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS template_category TEXT NOT NULL DEFAULT 'general'
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS structure JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS created_by INTEGER NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS allowed_subject_types JSONB NOT NULL DEFAULT '["project"]'::jsonb
  `);
}

async function ensureDataCollectionSubmissionsTable() {
  await ensureDataCollectionTemplatesTable();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_collection_submissions (
      submission_id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES data_collection_templates(template_id) ON DELETE RESTRICT,
      project_id INTEGER NULL,
      inspection_id INTEGER NULL,
      visit_date DATE NULL,
      title TEXT NULL,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by INTEGER NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS project_id INTEGER NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS inspection_id INTEGER NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS visit_date DATE NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS title TEXT NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS created_by INTEGER NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
    ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dcs_project_id ON data_collection_submissions (project_id)
    WHERE voided = false
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dcs_inspection_id ON data_collection_submissions (inspection_id)
    WHERE voided = false
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS subject_type TEXT NOT NULL DEFAULT 'project'
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS rri_programme_id BIGINT NULL
  `);
  await ensureMonitoringWorkflowColumns();
}

/** Workflow columns + audit table (idempotent; safe without full SQL migration). */
async function ensureMonitoringWorkflowColumns() {
  const alters = [
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'draft'`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS progress_status TEXT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS subcounty TEXT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS ward TEXT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS sublocation TEXT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS village TEXT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS village_submitted_by BIGINT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS village_submitted_at TIMESTAMPTZ NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS ward_reviewed_by BIGINT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS ward_reviewed_at TIMESTAMPTZ NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS subcounty_reviewed_by BIGINT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS subcounty_reviewed_at TIMESTAMPTZ NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS chief_reviewed_by BIGINT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS chief_reviewed_at TIMESTAMPTZ NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS review_comment TEXT NULL`,
    `ALTER TABLE data_collection_submissions ADD COLUMN IF NOT EXISTS published_to_public_at TIMESTAMPTZ NULL`,
  ];
  for (const sql of alters) {
    await pool.query(sql);
  }
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dcs_workflow_status
    ON data_collection_submissions (workflow_status)
    WHERE voided = false
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_collection_submission_actions (
      action_id BIGSERIAL PRIMARY KEY,
      submission_id BIGINT NOT NULL,
      action_type TEXT NOT NULL,
      from_status TEXT NULL,
      to_status TEXT NULL,
      comment TEXT NULL,
      actor_user_id BIGINT NULL,
      changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dcs_actions_submission
    ON data_collection_submission_actions (submission_id, created_at ASC)
  `);
}

async function ensureDataCollectionAttachmentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_collection_attachments (
      file_id SERIAL PRIMARY KEY,
      submission_id INTEGER NULL,
      item_id TEXT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NULL,
      file_size BIGINT NULL,
      lat DOUBLE PRECISION NULL,
      lng DOUBLE PRECISION NULL,
      accuracy DOUBLE PRECISION NULL,
      captured_at TIMESTAMP WITHOUT TIME ZONE NULL,
      created_by INTEGER NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dca_submission_id
    ON data_collection_attachments (submission_id)
    WHERE submission_id IS NOT NULL
  `);
}

async function ensureInspectionChecklistColumns() {
  await ensureDataCollectionTemplatesTable();
  await pool.query(`
    ALTER TABLE project_inspections
    ADD COLUMN IF NOT EXISTS checklist_template_id INTEGER NULL
    REFERENCES data_collection_templates(template_id) ON DELETE SET NULL
  `);
  await pool.query(`
    ALTER TABLE project_inspections
    ADD COLUMN IF NOT EXISTS checklist_answers JSONB NULL
  `);
}

module.exports = {
  ensureDataCollectionTemplatesTable,
  ensureDataCollectionSubmissionsTable,
  ensureDataCollectionAttachmentsTable,
  ensureInspectionChecklistColumns,
  ensureMonitoringWorkflowColumns,
};
