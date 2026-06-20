#!/usr/bin/env node
/**
 * Generates beneficiary import sample Excel for Data Import → Beneficiaries.
 *
 * Offline (no DB — committed fixture, resolves programme/project by name on import):
 *   node scripts/generateBeneficiarySampleImport.js --offline
 *
 * With DB IDs (after 20260630_rri_programme_sample.sql):
 *   cd api && node scripts/generateBeneficiarySampleImport.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const offlineMode = process.argv.includes('--offline');

const PROGRAMME_NAME = 'Kalama Ward Livelihoods RRI 2025/26';
const PROJECT_ID = 2;
const PROJECT_LABEL_FALLBACK = '2 — Machakos ECDE Classroom Construction - KALAMA';

const HEADERS = [
  'Beneficiary Type',
  'Registry Code',
  'Display Name',
  'First Name',
  'Last Name',
  'Gender',
  'Age',
  'ID Number',
  'Phone',
  'Email',
  'Group Type',
  'Member Count',
  'Lead Contact Name',
  'Lead Contact Phone',
  'County',
  'Sub-County',
  'Ward',
  'Village',
  'Project',
  'RRI Programme',
  'RRI Site ID',
  'Sector',
  'Enrollment Date (YYYY-MM-DD)',
  'Notes',
];

const OUT_DIR = path.join(__dirname, '../fixtures/import-samples');
const OUT_FILE = 'beneficiary-import-kalama-rri-2025-26.xlsx';

async function loadContextFromDb() {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const pool = require('../config/db');

  const prog = await pool.query(
    `SELECT programme_id, name FROM rri_programmes
     WHERE lower(trim(name)) = lower(trim($1)) AND COALESCE(voided, false) = false
     LIMIT 1`,
    [PROGRAMME_NAME]
  );
  if (!prog.rows.length) {
    throw new Error(`RRI programme not found: "${PROGRAMME_NAME}". Run migration 20260630_rri_programme_sample.sql first.`);
  }
  const programmeId = prog.rows[0].programme_id;
  const programmeLabel = `${programmeId} — ${prog.rows[0].name}`;

  const sites = await pool.query(
    `SELECT site_id, site_name FROM rri_programme_sites
     WHERE rri_programme_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sort_order ASC, site_id ASC`,
    [programmeId]
  );
  const siteCentral = sites.rows.find((s) => /central/i.test(s.site_name || '')) || sites.rows[0];
  const siteKathome = sites.rows.find((s) => /kathome/i.test(s.site_name || '')) || sites.rows[1] || siteCentral;

  let projectLabel = PROJECT_LABEL_FALLBACK;
  try {
    const proj = await pool.query(
      `SELECT project_id, name FROM projects WHERE project_id = $1 AND COALESCE(voided, false) = false LIMIT 1`,
      [PROJECT_ID]
    );
    if (proj.rows.length) {
      projectLabel = `${proj.rows[0].project_id} — ${proj.rows[0].name}`;
    }
  } catch {
    // use fallback
  }

  await pool.end?.();

  return {
    programmeLabel,
    projectLabel,
    siteCentral: siteCentral?.site_id || 'Kalama Central',
    siteKathome: siteKathome?.site_id || 'Kathome',
  };
}

function loadContextOffline() {
  return {
    programmeLabel: PROGRAMME_NAME,
    projectLabel: PROJECT_LABEL_FALLBACK,
    siteCentral: 'Kalama Central',
    siteKathome: 'Kathome',
  };
}

function buildRows(ctx) {
  return [
    {
      type: 'individual',
      firstName: 'Jane',
      lastName: 'Mutiso',
      gender: 'Female',
      age: 42,
      idNumber: '28451234',
      phone: '0712345678',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kalama Central',
      project: ctx.projectLabel,
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteCentral,
      sector: 'Agriculture',
      enrollmentDate: '2025-04-01',
      notes: 'Poultry beneficiary — individual household head.',
    },
    {
      type: 'individual',
      firstName: 'Peter',
      lastName: 'Kamau',
      gender: 'Male',
      age: 28,
      idNumber: '30129876',
      phone: '0723456789',
      email: 'peter.kamau@example.com',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kathome',
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteKathome,
      sector: 'Youth & Sports',
      enrollmentDate: '2025-04-15',
      notes: 'Youth agripreneur trainee.',
    },
    {
      type: 'group',
      displayName: 'Kalama Poultry Farmers CBO',
      phone: '0734567890',
      email: 'kalama.poultry@example.com',
      groupType: 'CBO',
      memberCount: 35,
      leadContactName: 'Grace Ndunge',
      leadContactPhone: '0734567890',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kalama Central',
      project: ctx.projectLabel,
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteCentral,
      sector: 'Agriculture',
      enrollmentDate: '2025-03-10',
      notes: 'Registered CBO — layer poultry and feed bulk purchase.',
    },
    {
      type: 'group',
      displayName: 'Kathome Youth Agripreneurs',
      phone: '0745678901',
      groupType: 'Youth Group',
      memberCount: 22,
      leadContactName: 'Samuel Musyoka',
      leadContactPhone: '0745678901',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kathome',
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteKathome,
      sector: 'Youth & Sports',
      enrollmentDate: '2025-05-01',
      notes: 'Youth group — vegetable nursery and table banking.',
    },
    {
      type: 'household',
      displayName: 'Wambua Household',
      phone: '0756789012',
      memberCount: 6,
      leadContactName: 'Mary Wambua',
      leadContactPhone: '0756789012',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kalama Central',
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteCentral,
      sector: 'Social Protection',
      enrollmentDate: '2025-04-20',
      notes: 'Household beneficiary — 6 members; poultry starter kit recipient.',
    },
    {
      type: 'household',
      displayName: 'Mutua Household',
      phone: '0767890123',
      memberCount: 5,
      leadContactName: 'Joseph Mutua',
      leadContactPhone: '0767890123',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kathome',
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteKathome,
      sector: 'Agriculture',
      enrollmentDate: '2025-05-12',
      notes: 'Household — 5 members enrolled in table banking cycle.',
    },
    {
      type: 'institution',
      displayName: 'Kalama Ward ECDE Centre',
      phone: '0778901234',
      email: 'kalama.ecde@example.com',
      groupType: 'School',
      memberCount: 120,
      leadContactName: 'Head Teacher — Kalama ECDE',
      leadContactPhone: '0778901234',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kalama Central',
      project: ctx.projectLabel,
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteCentral,
      sector: 'Education',
      enrollmentDate: '2025-06-01',
      notes: 'Institution — pupils reached through school feeding and parent groups.',
    },
    {
      type: 'institution',
      displayName: 'Kalama Community Dispensary',
      phone: '0789012345',
      groupType: 'Health Facility',
      memberCount: 450,
      leadContactName: 'Facility In-charge',
      leadContactPhone: '0789012345',
      county: 'Machakos',
      subcounty: 'Kalama',
      ward: 'Kalama',
      village: 'Kalama Central',
      rriProgramme: ctx.programmeLabel,
      rriSiteId: ctx.siteCentral,
      sector: 'Health',
      enrollmentDate: '2025-06-15',
      notes: 'Institution — monthly patient visits used as reach indicator.',
    },
  ].map((row) => [
    row.type,
    row.registryCode || '',
    row.displayName || '',
    row.firstName || '',
    row.lastName || '',
    row.gender || '',
    row.age ?? '',
    row.idNumber || '',
    row.phone || '',
    row.email || '',
    row.groupType || '',
    row.memberCount ?? '',
    row.leadContactName || '',
    row.leadContactPhone || '',
    row.county || '',
    row.subcounty || '',
    row.ward || '',
    row.village || '',
    row.project || '',
    row.rriProgramme || '',
    row.rriSiteId ?? '',
    row.sector || '',
    row.enrollmentDate || '',
    row.notes || '',
  ]);
}

function writeWorkbook(rows, ctx) {
  const aoa = [HEADERS, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = HEADERS.map((h, i) => ({
    wch: i === 2 ? 32 : i === 23 ? 40 : 18,
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Beneficiaries');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, OUT_FILE);
  XLSX.writeFile(workbook, outPath);
  console.log(`Wrote ${outPath}`);
  console.log(`Mode: ${offlineMode ? 'offline (name-based RRI/project links)' : 'database IDs'}`);
  console.log(`RRI programme: ${ctx.programmeLabel}`);
  console.log(`Rows: ${rows.length} (individual×2, group×2, household×2, institution×2)`);
}

async function main() {
  const ctx = offlineMode ? loadContextOffline() : await loadContextFromDb();
  writeWorkbook(buildRows(ctx), ctx);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
