#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generate PostgreSQL migration for the Village Field Monitoring checklist template.
 *
 * Usage:
 *   node api/scripts/generateVillageMonitoringTemplateSql.js
 */
const fs = require('fs');
const path = require('path');
const { normalizeStructure } = require('../services/checklistAnswerUtils');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'data', 'village-admin-monitoring-checklist-template.json');
const OUT_PATH = path.join(ROOT, 'migrations', '20260711_seed_village_admin_monitoring_template.sql');

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
  const keySql = def.templateKey.replace(/'/g, "''");
  const allowedSql = allowedSubjectsSql(def);

  return `-- Village Field Monitoring checklist for Village Administrators (idempotent).
-- PostgreSQL only. Safe to re-run on remote servers without Node.js.
-- Source: api/data/village-admin-monitoring-checklist-template.json
-- Regenerate: node api/scripts/generateVillageMonitoringTemplateSql.js
--
-- Apply:
--   psql "$DATABASE_URL" -f api/migrations/20260711_seed_village_admin_monitoring_template.sql
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
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS restrict_access BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE data_collection_templates ADD COLUMN IF NOT EXISTS allowed_subject_types JSONB NOT NULL DEFAULT '["project"]'::jsonb;

CREATE TABLE IF NOT EXISTS data_collection_template_roles (
  template_id INTEGER NOT NULL REFERENCES data_collection_templates(template_id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (template_id, role_id)
);

INSERT INTO data_collection_templates (
  name,
  description,
  template_category,
  structure,
  is_active,
  restrict_access,
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
  TRUE,
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
      OR description ILIKE '%templateKey:${keySql}%'
    )
);

UPDATE data_collection_templates
SET
  name = '${nameSql}',
  description = ${descSql},
  template_category = '${def.templateCategory.replace(/'/g, "''")}',
  structure = ${structSql}::jsonb,
  is_active = ${def.isActive ? 'TRUE' : 'FALSE'},
  restrict_access = TRUE,
  allowed_subject_types = ${allowedSql},
  updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(voided, false) = false
  AND (
    name = '${nameSql}'
    OR description ILIKE '%templateKey:${keySql}%'
  );

-- Village Administrator + Ward Administrator (ward revises village submissions)
INSERT INTO data_collection_template_roles (template_id, role_id)
SELECT t.template_id, r.roleid
FROM data_collection_templates t
CROSS JOIN roles r
WHERE COALESCE(t.voided, false) = false
  AND t.description ILIKE '%templateKey:${keySql}%'
  AND COALESCE(r.voided, false) = false
  AND lower(trim(r.name)) IN ('village administrator', 'ward administrator')
  AND NOT EXISTS (
    SELECT 1 FROM data_collection_template_roles tr
    WHERE tr.template_id = t.template_id AND tr.role_id = r.roleid
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
    templateKey: String(raw.templateKey || 'village-admin-field-monitoring'),
    name: String(raw.name || '').trim(),
    description: raw.description != null ? String(raw.description) : null,
    templateCategory: String(raw.templateCategory || 'monitoring_checklist').trim(),
    isActive: raw.isActive !== false,
    allowedSubjectTypes: Array.isArray(raw.allowedSubjectTypes) ? raw.allowedSubjectTypes : ['project'],
    structure,
  };
  if (!def.name) throw new Error('Template name is required in JSON.');

  const sectionCount = def.structure.sections.length;
  const itemCount = def.structure.sections.reduce((n, s) => n + (s.items?.length || 0), 0);
  fs.writeFileSync(OUT_PATH, buildSql(def), 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  Sections: ${sectionCount} · Items: ${itemCount}`);
}

main();
