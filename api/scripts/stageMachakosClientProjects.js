#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const staging = require('../services/clientProjectImportStagingService');

const DEFAULT_FILE = path.resolve(__dirname, '..', '..', 'data', 'migrate', 'Machakos_County_projectz.xlsx');
const DEFAULT_CSV = path.resolve(__dirname, '..', '..', 'data', 'migrate', 'staging-review-machakos-county-projectz-v1.csv');

function parseArgs(argv) {
  const args = {
    apply: false,
    file: DEFAULT_FILE,
    batch: staging.DEFAULT_BATCH,
    source: staging.DEFAULT_SOURCE,
    report: '',
    fromCsv: '',
    rematch: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--rematch') args.rematch = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--file=')) args.file = path.resolve(arg.slice('--file='.length));
    else if (arg.startsWith('--batch=')) args.batch = arg.slice('--batch='.length) || staging.DEFAULT_BATCH;
    else if (arg.startsWith('--source=')) args.source = arg.slice('--source='.length) || staging.DEFAULT_SOURCE;
    else if (arg.startsWith('--report=')) args.report = path.resolve(arg.slice('--report='.length));
    else if (arg.startsWith('--from-csv=')) args.fromCsv = path.resolve(arg.slice('--from-csv='.length));
  }
  return args;
}

function printHelp() {
  console.log(`
Stage Machakos client project spreadsheet (Phase 1 — no live project changes).

The SQL migration only creates an empty staging table. You must run with --apply
to load rows before the Client project staging review UI shows data.

Default mode is dry-run: parses Excel, normalizes rows, attempts DB matching,
writes a CSV review report, and prints a summary.

Usage:
  node api/scripts/stageMachakosClientProjects.js
  node api/scripts/stageMachakosClientProjects.js --apply --file=data/migrate/Machakos_County_projectz.xlsx
  node api/scripts/stageMachakosClientProjects.js --from-csv=data/migrate/staging-review-machakos-county-projectz-v1.csv --apply
  node api/scripts/stageMachakosClientProjects.js --from-csv=... --apply --rematch

Options:
  --apply                  Insert rows into client_project_import_staging (replaces batch).
  --from-csv=PATH          Load a prior review CSV (Excel not required on server).
  --rematch                With --from-csv: re-score matches against live projects table.
  --file=PATH              Excel path (default: data/migrate/Machakos_County_projectz.xlsx)
  --batch=TEXT             Import batch id (default: machakos-county-projectz-v1)
  --source=TEXT            Source file label stored in staging
  --report=PATH            Write CSV review report

Migration (run once — creates empty table only):
  psql ... -f api/migrations/20260705_client_project_import_staging.sql

Review plan:
  data/migrate/MACHAKOS_CLIENT_PROJECTS_MIGRATION.md
`);
}

function readClientRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  return raw.map((row, index) => ({
    sourceRowNo: Number(row['S/NO']) || index + 1,
    projectName: row['Project Name'],
    subCounty: row['Sub County'],
    ward: row.Ward,
    subLocation: row['Sub Location'],
    department: row.Department,
    impact: row.Impact,
    paymentStatus: row['Payment Status'],
    remarks: row.Remarks,
  })).filter((row) => staging.cleanText(row.projectName));
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeReport(reportPath, rows) {
  const headers = [
    'source_row_no', 'project_name', 'sub_county_norm', 'ward_norm', 'sub_location_norm',
    'department_norm', 'payment_status_raw', 'payment_status_norm', 'location_scope',
    'remarks_amount', 'remarks_status_text', 'duplicate_count_in_file',
    'match_project_id', 'match_project_name', 'match_score', 'match_method',
    'match_is_test_project', 'proposed_action', 'review_notes',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.sourceRowNo,
      row.projectName,
      row.subCountyNorm,
      row.wardNorm,
      row.subLocationNorm,
      row.departmentNorm,
      row.paymentStatusRaw,
      row.paymentStatusNorm,
      row.locationScope,
      row.remarksAmount,
      row.remarksStatusText,
      row.duplicateCountInFile,
      row.matchProjectId,
      row.matchProjectName,
      row.matchScore,
      row.matchMethod,
      row.matchIsTestProject,
      row.proposedAction,
      row.reviewNotes,
    ].map(csvEscape).join(','));
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

function summarizeActions(rows) {
  const counts = rows.reduce((acc, row) => {
    acc[row.proposedAction] = (acc[row.proposedAction] || 0) + 1;
    return acc;
  }, {});
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.log('Machakos client project import — Phase 1 staging');
  console.log(`Batch:  ${args.batch}`);
  console.log(`Mode:   ${args.apply ? 'APPLY (write staging table)' : 'DRY-RUN'}`);

  let stagingRows = [];
  let dbMatched = false;

  if (args.fromCsv) {
    console.log(`CSV:    ${args.fromCsv}`);
    if (args.rematch) console.log('Rematch: yes (against live projects table)');
    stagingRows = await staging.loadStagingFromReviewCsv(args.fromCsv, {
      batch: args.batch,
      source: args.source,
      rematch: args.rematch,
    });
    dbMatched = args.rematch;
    console.log(`Loaded ${stagingRows.length} rows from review CSV.`);
  } else {
    console.log(`File:   ${args.file}`);
    const rawRows = readClientRows(args.file);
    console.log(`Parsed ${rawRows.length} data rows from Excel.`);

    stagingRows = rawRows.map((row) => staging.normalizeStagingRow(row, args.source, args.batch));

    try {
      const existing = await staging.fetchExistingProjects();
      stagingRows = staging.applyMatching(stagingRows, existing);
      dbMatched = true;
      console.log(`Matched against ${existing.filter((p) => !p.voided).length} active projects in database.`);
    } catch (error) {
      console.warn(`Database matching skipped: ${error.message}`);
      for (const row of stagingRows) {
        row.proposedAction = 'review';
        row.reviewNotes = [row.reviewNotes, 'db_match_skipped'].filter(Boolean).join('; ');
      }
    }
  }

  const actionCounts = summarizeActions(stagingRows);
  console.log('\nProposed actions:');
  Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).forEach(([action, count]) => {
    console.log(`  ${action}: ${count}`);
  });

  const reportPath = args.report
    || path.resolve(__dirname, '..', '..', 'data', 'migrate', `staging-review-${args.batch}.csv`);
  if (!args.fromCsv || args.report) {
    writeReport(reportPath, stagingRows);
    console.log(`\nReview CSV: ${reportPath}`);
  }

  if (args.apply) {
    await staging.replaceStagingBatch(args.batch, stagingRows);
    const summary = await staging.summarizeBatch(args.batch);
    console.log(`\nStaging table loaded (${stagingRows.length} rows). Batch summary:`);
    summary.forEach((row) => console.log(`  ${row.proposed_action}: ${row.count}`));
    console.log('\nOpen Data → Client project staging in the app to review.');
    console.log('\nQuery staging:');
    console.log(`  SELECT proposed_action, COUNT(*) FROM client_project_import_staging WHERE import_batch = '${args.batch}' GROUP BY 1;`);
  } else {
    console.log('\nDry-run complete — no database writes. Re-run with --apply to load staging table.');
    if (!args.fromCsv && fs.existsSync(DEFAULT_CSV)) {
      console.log(`\nTip: load the bundled review CSV without Excel:`);
      console.log(`  npm run stage:machakos-client-projects -- --from-csv=${DEFAULT_CSV} --apply --rematch`);
    }
    if (!dbMatched) {
      console.log('Tip: start PostgreSQL and re-run to match against existing projects.');
    }
  }
}

main()
  .catch((error) => {
    console.error('Staging failed:', error.message);
    process.exit(1);
  });
