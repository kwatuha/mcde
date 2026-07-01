#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generate PostgreSQL migration for the reference data collection template.
 * Remote servers without Node can apply the output SQL via psql.
 *
 * Usage:
 *   node api/scripts/generateSampleDataCollectionTemplateSql.js
 */
const fs = require('fs');
const path = require('path');
const { normalizeStructure } = require('../services/checklistAnswerUtils');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'data', 'sample-monitoring-checklist-template.json');
const OUT_PATH = path.join(ROOT, 'migrations', '20260701_seed_reference_data_collection_template.sql');
const BUMP_PATH = path.join(ROOT, 'migrations', '20260705_update_reference_data_collection_template.sql');
const BUMP_PATH_V2 = path.join(ROOT, 'migrations', '20260707_update_reference_data_collection_template.sql');

function allowedSubjectsSql(def) {
  const list = Array.isArray(def.allowedSubjectTypes) && def.allowedSubjectTypes.length
    ? def.allowedSubjectTypes
    : ['project'];
  return `'${JSON.stringify(list)}'::jsonb`;
}

function sqlQuoteDollar(tag, text) {
  let candidate = tag;
  while (text.includes(`$${candidate}$`)) {
    candidate = `${tag}_${Math.random().toString(36).slice(2, 8)}`;
  }
  return `$${candidate}$${text}$${candidate}$`;
}

function buildSql(def) {
  const description = (() => {
    const base = String(def.description || '').trim();
    const marker = `[templateKey:${def.templateKey}]`;
    return base.includes(marker) ? base : `${base}\n\n${marker}`;
  })();

  const structureJson = JSON.stringify(def.structure);
  const descSql = sqlQuoteDollar('desc', description);
  const structSql = sqlQuoteDollar('structure', structureJson);
  const nameSql = def.name.replace(/'/g, "''");
  const allowedSql = allowedSubjectsSql(def);

  return `-- Seed reference data collection checklist template (idempotent).
-- PostgreSQL only. Safe to re-run on remote servers without Node.js.
-- Source: api/data/sample-monitoring-checklist-template.json
-- Regenerate: node api/scripts/generateSampleDataCollectionTemplateSql.js
--
-- Apply:
--   psql "$DATABASE_URL" -f api/migrations/20260701_seed_reference_data_collection_template.sql
--
BEGIN;

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
);

ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS template_category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS structure JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS created_by INTEGER NULL;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS allowed_subject_types JSONB NOT NULL DEFAULT '["project"]'::jsonb;

INSERT INTO data_collection_templates (
  name,
  description,
  template_category,
  structure,
  is_active,
  allowed_subject_types,
  created_by,
  created_at,
  updated_at,
  voided
)
SELECT
  '${nameSql}',
  ${descSql},
  '${def.templateCategory.replace(/'/g, "''")}',
  ${structSql}::jsonb,
  ${def.isActive ? 'TRUE' : 'FALSE'},
  ${allowedSql},
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  FALSE
WHERE NOT EXISTS (
  SELECT 1
  FROM data_collection_templates
  WHERE COALESCE(voided, false) = false
    AND (
      name = '${nameSql}'
      OR description ILIKE '%templateKey:${def.templateKey.replace(/'/g, "''")}%'
    )
);

UPDATE data_collection_templates
SET
  name = '${nameSql}',
  description = ${descSql},
  template_category = '${def.templateCategory.replace(/'/g, "''")}',
  structure = ${structSql}::jsonb,
  is_active = ${def.isActive ? 'TRUE' : 'FALSE'},
  allowed_subject_types = ${allowedSql},
  updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(voided, false) = false
  AND (
    name = '${nameSql}'
    OR description ILIKE '%templateKey:${def.templateKey.replace(/'/g, "''")}%'
  );

COMMIT;
`;
}

function buildBumpSql(def) {
  const description = (() => {
    const base = String(def.description || '').trim();
    const marker = `[templateKey:${def.templateKey}]`;
    return base.includes(marker) ? base : `${base}\n\n${marker}`;
  })();

  const structureJson = JSON.stringify(def.structure);
  const descSql = sqlQuoteDollar('desc', description);
  const structSql = sqlQuoteDollar('structure', structureJson);
  const nameSql = def.name.replace(/'/g, "''");
  const keySql = def.templateKey.replace(/'/g, "''");

  return `-- Bump reference data collection template (user + area_location field types).
-- PostgreSQL only. Safe to re-run on servers that already applied 20260701.
-- Source: api/data/sample-monitoring-checklist-template.json
-- Regenerate: node api/scripts/generateSampleDataCollectionTemplateSql.js
--
-- Apply:
--   psql "$DATABASE_URL" -f api/migrations/20260705_update_reference_data_collection_template.sql
--
BEGIN;

UPDATE data_collection_templates
SET
  name = '${nameSql}',
  description = ${descSql},
  template_category = '${def.templateCategory.replace(/'/g, "''")}',
  structure = ${structSql}::jsonb,
  is_active = ${def.isActive ? 'TRUE' : 'FALSE'},
  updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(voided, false) = false
  AND (
    name = '${nameSql}'
    OR description ILIKE '%templateKey:${keySql}%'
  );

COMMIT;
`;
}

function buildBumpSqlV2(def) {
  const description = (() => {
    const base = String(def.description || '').trim();
    const marker = `[templateKey:${def.templateKey}]`;
    return base.includes(marker) ? base : `${base}\n\n${marker}`;
  })();

  const structureJson = JSON.stringify(def.structure);
  const descSql = sqlQuoteDollar('desc', description);
  const structSql = sqlQuoteDollar('structure', structureJson);
  const nameSql = def.name.replace(/'/g, "''");
  const keySql = def.templateKey.replace(/'/g, "''");
  const allowedSql = allowedSubjectsSql(def);

  return `-- Bump reference data collection template (indicator field + subject types).
-- PostgreSQL only. Safe to re-run on servers that already applied 20260701/20260705.
-- Source: api/data/sample-monitoring-checklist-template.json
-- Regenerate: node api/scripts/generateSampleDataCollectionTemplateSql.js
--
-- Apply:
--   psql "$DATABASE_URL" -f api/migrations/20260707_update_reference_data_collection_template.sql
--
BEGIN;

ALTER TABLE data_collection_templates
  ADD COLUMN IF NOT EXISTS allowed_subject_types JSONB NOT NULL DEFAULT '["project"]'::jsonb;

UPDATE data_collection_templates
SET
  name = '${nameSql}',
  description = ${descSql},
  template_category = '${def.templateCategory.replace(/'/g, "''")}',
  structure = ${structSql}::jsonb,
  is_active = ${def.isActive ? 'TRUE' : 'FALSE'},
  allowed_subject_types = ${allowedSql},
  updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(voided, false) = false
  AND (
    name = '${nameSql}'
    OR description ILIKE '%templateKey:${keySql}%'
  );

COMMIT;
`;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  const structure = normalizeStructure(raw.structure);
  if (!structure.sections.length) {
    throw new Error('Template JSON has no valid sections/items after normalization.');
  }
  const def = {
    templateKey: String(raw.templateKey || 'reference-county-site-monitoring'),
    name: String(raw.name || '').trim(),
    description: raw.description != null ? String(raw.description) : null,
    templateCategory: String(raw.templateCategory || 'monitoring_checklist').trim(),
    isActive: raw.isActive !== false,
    allowedSubjectTypes: Array.isArray(raw.allowedSubjectTypes) ? raw.allowedSubjectTypes : ['project'],
    structure,
  };
  if (!def.name) throw new Error('Template name is required in JSON.');

  fs.writeFileSync(OUT_PATH, buildSql(def), 'utf8');
  fs.writeFileSync(BUMP_PATH, buildBumpSql(def), 'utf8');
  fs.writeFileSync(BUMP_PATH_V2, buildBumpSqlV2(def), 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Wrote ${BUMP_PATH}`);
  console.log(`Wrote ${BUMP_PATH_V2}`);
}

main();
