#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = require('../config/db');

const SAMPLE_PROJECTS = [
  { name: 'GIS DEMO - Mumbuni North Access Roads', ministry: 'Department of Roads, Transport and Public Works', implementingAgency: 'County Roads Unit', constituency: 'MACHAKOS TOWN', ward: 'MUMBUNI NORTH', lat: -1.5044, lng: 37.2809, budget: 18500000, paidOut: 6300000, status: 'In Progress', progress: 34 },
  { name: 'GIS DEMO - Kalama Borehole Expansion', ministry: 'Department of Water, Irrigation and Energy', implementingAgency: 'County Water Services', constituency: 'MACHAKOS TOWN', ward: 'KALAMA', lat: -1.5264, lng: 37.3553, budget: 9200000, paidOut: 2100000, status: 'In Progress', progress: 22 },
  { name: 'GIS DEMO - Matuu Market Drainage', ministry: 'Department of Lands, Housing and Urban Development', implementingAgency: 'Urban Infrastructure Team', constituency: 'YATTA', ward: 'KITHIMANI', lat: -1.1627, lng: 37.6211, budget: 12400000, paidOut: 5100000, status: 'At Risk', progress: 41 },
  { name: 'GIS DEMO - Mwala Health Centre Upgrade', ministry: 'Department of Health Services', implementingAgency: 'County Health Infrastructure Unit', constituency: 'MWALA', ward: 'MASII', lat: -1.3727, lng: 37.5201, budget: 27800000, paidOut: 19800000, status: 'In Progress', progress: 71 },
  { name: 'GIS DEMO - Athi River Street Lighting', ministry: 'Department of Transport, Roads and Public Works', implementingAgency: 'County Electrical Works Team', constituency: 'MAVOKO', ward: 'KINANIE', lat: -1.4512, lng: 37.0628, budget: 15600000, paidOut: 8200000, status: 'In Progress', progress: 53 },
  { name: 'GIS DEMO - Kangundo ECDE Classrooms', ministry: 'Department of Education and Skills Training', implementingAgency: 'County Education Infrastructure Unit', constituency: 'KANGUNDO', ward: 'KANGUNDO NORTH', lat: -1.3065, lng: 37.3524, budget: 11100000, paidOut: 4600000, status: 'Not Started', progress: 12 },
];

const json = (v) => JSON.stringify(v);

async function seed() {
  const inserted = [];
  const skipped = [];

  for (const item of SAMPLE_PROJECTS) {
    const exists = await pool.query('SELECT project_id FROM projects WHERE name = $1 AND voided = false LIMIT 1', [item.name]);
    if ((exists.rows || []).length > 0) {
      skipped.push(item.name);
      continue;
    }

    const location = {
      county: 'MACHAKOS',
      constituency: item.constituency,
      ward: item.ward,
      geocoordinates: { lat: item.lat, lng: item.lng },
    };

    const result = await pool.query(
      `INSERT INTO projects (
        name, description, implementing_agency, sector, ministry, state_department, category_id,
        timeline, budget, progress, notes, data_sources, public_engagement, location, is_public,
        created_at, updated_at, voided
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false
      ) RETURNING project_id`,
      [
        item.name,
        'Sample GIS project for ward heatmap and marker testing.',
        item.implementingAgency,
        'Infrastructure',
        item.ministry,
        null,
        null,
        json({ start_date: '2026-01-15', expected_completion_date: '2026-12-20', financial_year: '2025/2026' }),
        json({ allocated_amount_kes: item.budget, disbursed_amount_kes: item.paidOut, contracted: true, budget_id: null, source: 'County Development Fund' }),
        json({ status: item.status, status_reason: null, percentage_complete: item.progress, latest_update_summary: 'Seeded sample project for GIS visualization.' }),
        json({ objective: 'Support dashboard demonstrations with ward-linked projects.', expected_output: 'Visible GIS heatmap and marker distribution in Machakos.', expected_outcome: 'Faster validation of map analytics and filters.', program_id: null, subprogram_id: null }),
        json({ project_ref_num: `GIS-DEMO-${item.ward.replace(/\s+/g, '-')}`, created_by_user_id: 1 }),
        json({ approved_for_public: false, approved_by: null, approved_at: null, approval_notes: null, revision_requested: false, revision_notes: null, revision_requested_by: null, revision_requested_at: null, revision_submitted_at: null, feedback_enabled: true }),
        json(location),
        json({ approved: false, approved_by: null, approved_at: null, approval_notes: null, revision_requested: false, revision_notes: null, revision_requested_by: null, revision_requested_at: null, revision_submitted_at: null }),
      ]
    );
    inserted.push({ name: item.name, projectId: result.rows?.[0]?.project_id });
  }

  console.log('GIS sample project seed complete.');
  console.log(`Inserted: ${inserted.length}`);
  inserted.forEach((entry) => console.log(`  + ${entry.projectId}: ${entry.name}`));
  console.log(`Skipped existing: ${skipped.length}`);
  skipped.forEach((name) => console.log(`  - ${name}`));
}

seed()
  .catch((error) => {
    console.error('Failed to seed GIS sample projects:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (error) {
      // ignore pool shutdown errors
    }
  });
