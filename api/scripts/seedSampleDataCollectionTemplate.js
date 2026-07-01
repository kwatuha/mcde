#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed the reference county project site monitoring checklist template.
 * Safe to re-run: updates the template in place when templateKey/name already exists.
 *
 * Usage (local with Node):
 *   node api/scripts/seedSampleDataCollectionTemplate.js
 *   npm run seed:data-collection-reference   (from api/)
 *
 * Remote servers (no Node): apply SQL migration instead:
 *   psql "$DATABASE_URL" -f api/migrations/20260701_seed_reference_data_collection_template.sql
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = require('../config/db');
const { ensureDataCollectionTemplatesTable } = require('../services/dataCollectionSchema');
const { normalizeStructure } = require('../services/checklistAnswerUtils');

const TEMPLATE_PATH = path.resolve(__dirname, '..', 'data', 'sample-monitoring-checklist-template.json');

function loadTemplateDefinition() {
  const raw = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  const structure = normalizeStructure(raw.structure);
  if (!structure.sections.length) {
    throw new Error('Template JSON has no valid sections/items after normalization.');
  }
  return {
    templateKey: String(raw.templateKey || 'reference-county-site-monitoring'),
    name: String(raw.name || '').trim(),
    description: raw.description != null ? String(raw.description) : null,
    templateCategory: String(raw.templateCategory || 'monitoring_checklist').trim(),
    isActive: raw.isActive !== false,
    structure,
  };
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

function descriptionWithKey(description, templateKey) {
  const base = String(description || '').trim();
  const marker = `templateKey:${templateKey}`;
  if (base.includes(marker)) return base;
  return base ? `${base}\n\n[${marker}]` : `[${marker}]`;
}

function countFieldTypes(structure) {
  const counts = {};
  for (const sec of structure.sections || []) {
    for (const item of sec.items || []) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
  }
  return counts;
}

async function seed() {
  const def = loadTemplateDefinition();
  if (!def.name) throw new Error('Template name is required in JSON.');

  await ensureDataCollectionTemplatesTable();
  const client = await pool.connect();
  try {
    const existing = await findExisting(client, def);
    const description = descriptionWithKey(def.description, def.templateKey);
    const structureJson = JSON.stringify(def.structure);

    if (existing) {
      await client.query(
        `
        UPDATE data_collection_templates
        SET name = $1,
            description = $2,
            template_category = $3,
            structure = $4::jsonb,
            is_active = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE template_id = $6
        `,
        [def.name, description, def.templateCategory, structureJson, def.isActive, existing.template_id]
      );
      console.log(`Updated reference template #${existing.template_id}: ${def.name}`);
    } else {
      const r = await client.query(
        `
        INSERT INTO data_collection_templates
          (name, description, template_category, structure, is_active, created_by, created_at, updated_at, voided)
        VALUES ($1, $2, $3, $4::jsonb, $5, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
        RETURNING template_id
        `,
        [def.name, description, def.templateCategory, structureJson, def.isActive]
      );
      const id = r.rows?.[0]?.template_id;
      console.log(`Created reference template #${id}: ${def.name}`);
    }

    const typeCounts = countFieldTypes(def.structure);
    const sectionCount = def.structure.sections.length;
    const itemCount = def.structure.sections.reduce((n, s) => n + (s.items?.length || 0), 0);
    console.log(`  Sections: ${sectionCount} · Items: ${itemCount}`);
    console.log('  Field types:', Object.entries(typeCounts).map(([k, v]) => `${k}(${v})`).join(', '));
    console.log(`  Source: ${TEMPLATE_PATH}`);
    console.log('  Use: Monitoring → Data collection tools → Record monitoring visit (web or mobile).');
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error('Failed to seed data collection reference template:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
