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
  ensureInspectionChecklistColumns,
};
