#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed the Village Field Monitoring checklist template.
 * Safe to re-run: updates the template in place when templateKey/name already exists.
 *
 * Usage:
 *   node api/scripts/seedVillageMonitoringTemplate.js
 *   npm run seed:village-monitoring-template   (from api/)
 *
 * Remote servers (no Node): apply SQL migration instead:
 *   psql "$DATABASE_URL" -f api/migrations/20260711_seed_village_admin_monitoring_template.sql
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = require('../config/db');
const { ensureDataCollectionTemplatesTable } = require('../services/dataCollectionSchema');
const { ensureTemplateAccessTables, saveTemplateAccess } = require('../services/dataCollectionAccessService');
const { normalizeStructure } = require('../services/checklistAnswerUtils');

const TEMPLATE_PATH = path.resolve(__dirname, '..', 'data', 'village-admin-monitoring-checklist-template.json');
const TEMPLATE_KEY = 'village-admin-field-monitoring';
const ROLE_NAMES = ['village administrator', 'ward administrator'];

function loadTemplateDefinition() {
  const raw = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  const structure = normalizeStructure(raw.structure);
  if (!structure.sections.length) {
    throw new Error('Template JSON has no valid sections/items after normalization.');
  }
  return {
    templateKey: String(raw.templateKey || TEMPLATE_KEY),
    name: String(raw.name || '').trim(),
    description: raw.description != null ? String(raw.description) : null,
    templateCategory: String(raw.templateCategory || 'monitoring_checklist').trim(),
    isActive: raw.isActive !== false,
    allowedSubjectTypes: Array.isArray(raw.allowedSubjectTypes) ? raw.allowedSubjectTypes : ['project'],
    structure,
  };
}

function descriptionWithKey(description, templateKey) {
  const base = String(description || '').trim();
  const marker = `templateKey:${templateKey}`;
  if (base.includes(marker)) return base;
  return base ? `${base}\n\n[${marker}]` : `[${marker}]`;
}

async function findExisting(client, def) {
  const byKey = await client.query(
    `
    SELECT template_id, name
    FROM data_collection_templates
    WHERE COALESCE(voided, false) = false
      AND description ILIKE $1
    ORDER BY template_id ASC
    LIMIT 1
    `,
    [`%templateKey:${def.templateKey}%`]
  );
  if (byKey.rows?.[0]) return byKey.rows[0];

  const byName = await client.query(
    `
    SELECT template_id, name
    FROM data_collection_templates
    WHERE COALESCE(voided, false) = false
      AND name = $1
    ORDER BY template_id ASC
    LIMIT 1
    `,
    [def.name]
  );
  return byName.rows?.[0] || null;
}

async function resolveRoleIds(client) {
  const r = await client.query(
    `
    SELECT roleid
    FROM roles
    WHERE COALESCE(voided, false) = false
      AND lower(trim(name)) = ANY($1::text[])
    `,
    [ROLE_NAMES]
  );
  return (r.rows || []).map((row) => Number(row.roleid)).filter(Number.isFinite);
}

async function seed() {
  const def = loadTemplateDefinition();
  if (!def.name) throw new Error('Template name is required in JSON.');

  await ensureDataCollectionTemplatesTable();
  await ensureTemplateAccessTables();
  const client = await pool.connect();
  try {
    const existing = await findExisting(client, def);
    const description = descriptionWithKey(def.description, def.templateKey);
    const structureJson = JSON.stringify(def.structure);
    const allowedSubjectsJson = JSON.stringify(def.allowedSubjectTypes);

    let templateId;
    if (existing) {
      await client.query(
        `
        UPDATE data_collection_templates
        SET name = $1,
            description = $2,
            template_category = $3,
            structure = $4::jsonb,
            is_active = $5,
            restrict_access = TRUE,
            allowed_subject_types = $6::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE template_id = $7
        `,
        [def.name, description, def.templateCategory, structureJson, def.isActive, allowedSubjectsJson, existing.template_id]
      );
      templateId = existing.template_id;
      console.log(`Updated village monitoring template #${templateId}: ${def.name}`);
    } else {
      const r = await client.query(
        `
        INSERT INTO data_collection_templates
          (name, description, template_category, structure, is_active, restrict_access, allowed_subject_types, created_by, created_at, updated_at, voided)
        VALUES ($1, $2, $3, $4::jsonb, $5, TRUE, $6::jsonb, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
        RETURNING template_id
        `,
        [def.name, description, def.templateCategory, structureJson, def.isActive, allowedSubjectsJson]
      );
      templateId = r.rows?.[0]?.template_id;
      console.log(`Created village monitoring template #${templateId}: ${def.name}`);
    }

    const roleIds = await resolveRoleIds(client);
    if (roleIds.length) {
      await saveTemplateAccess(templateId, { restrictAccess: true, roleIds, userIds: [] });
      console.log(`  Access granted to role IDs: ${roleIds.join(', ')}`);
    } else {
      console.warn('  Warning: Village Administrator / Ward Administrator roles not found — grant template access manually.');
    }

    const sectionCount = def.structure.sections.length;
    const itemCount = def.structure.sections.reduce((n, s) => n + (s.items?.length || 0), 0);
    console.log(`  Sections: ${sectionCount} · Items: ${itemCount}`);
    console.log(`  Source: ${TEMPLATE_PATH}`);
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error('Failed to seed village monitoring template:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
