const path = require('path');
const XLSX = require('xlsx');
const pool = require('../config/db');

const DEFAULT_WORKBOOK = path.resolve(__dirname, '..', '..', 'docs', 'SublocationVillages.xlsx');
const DEFAULT_COUNTY = process.env.DEFAULT_PROJECT_COUNTY || process.env.WARDS_COUNTY_SCOPE || 'Machakos';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normKeyPart(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedKey({ subcounty, ward, sublocation, village }) {
  return [subcounty, ward, sublocation, village].map(normKeyPart).join('|');
}

async function ensureCatalogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS machakos_sublocation_villages (
      id BIGSERIAL PRIMARY KEY,
      county TEXT NOT NULL DEFAULT 'Machakos',
      subcounty TEXT NOT NULL,
      ward TEXT NOT NULL,
      sublocation TEXT NOT NULL,
      village TEXT NOT NULL,
      source_row_no INTEGER NULL,
      normalized_key TEXT NOT NULL,
      voided BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_machakos_sublocation_villages_key
      ON machakos_sublocation_villages (normalized_key)
      WHERE voided = false
  `);
}

function readRows(workbookPath) {
  const workbook = XLSX.readFile(workbookPath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets.');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  return rows.map((row, index) => {
    const subcounty = cleanText(row['SUB COUNTY']);
    const ward = cleanText(row.WARD);
    const sublocation = cleanText(row['SUB LOCATION (COUNTY - V3s)']);
    const village = cleanText(row['VILLAGE (NG - HEADMAN)']);
    const sourceRowNo = Number(row['S/NO']) || index + 2;
    return {
      county: DEFAULT_COUNTY,
      subcounty,
      ward,
      sublocation,
      village,
      sourceRowNo,
      normalizedKey: normalizedKey({ subcounty, ward, sublocation, village }),
    };
  });
}

async function importRows(rows) {
  const seen = new Set();
  const summary = {
    totalRows: rows.length,
    inserted: 0,
    updated: 0,
    duplicateRows: 0,
    skippedRows: 0,
    skippedSamples: [],
  };

  const validRows = [];
  for (const row of rows) {
    if (!row.subcounty || !row.ward || !row.sublocation || !row.village || !row.normalizedKey.replace(/\|/g, '')) {
      summary.skippedRows += 1;
      if (summary.skippedSamples.length < 10) summary.skippedSamples.push(row);
      continue;
    }
    if (seen.has(row.normalizedKey)) {
      summary.duplicateRows += 1;
      continue;
    }
    seen.add(row.normalizedKey);
    validRows.push(row);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of validRows) {
      const result = await client.query(
        `
        INSERT INTO machakos_sublocation_villages (
          county, subcounty, ward, sublocation, village, source_row_no, normalized_key, voided, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, CURRENT_TIMESTAMP)
        ON CONFLICT (normalized_key) WHERE voided = false
        DO UPDATE SET
          county = EXCLUDED.county,
          subcounty = EXCLUDED.subcounty,
          ward = EXCLUDED.ward,
          sublocation = EXCLUDED.sublocation,
          village = EXCLUDED.village,
          source_row_no = EXCLUDED.source_row_no,
          updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted
        `,
        [row.county, row.subcounty, row.ward, row.sublocation, row.village, row.sourceRowNo, row.normalizedKey]
      );
      if (result.rows?.[0]?.inserted) summary.inserted += 1;
      else summary.updated += 1;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return summary;
}

async function main() {
  const workbookPath = path.resolve(process.argv[2] || DEFAULT_WORKBOOK);
  await ensureCatalogTable();
  const rows = readRows(workbookPath);
  const summary = await importRows(rows);
  console.log(JSON.stringify({ workbookPath, ...summary }, null, 2));
}

main()
  .catch((error) => {
    console.error('Sublocation/village import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end?.();
  });
