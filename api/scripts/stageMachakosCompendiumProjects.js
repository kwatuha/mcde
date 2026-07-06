#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const staging = require('../services/compendiumProjectImportStagingService');

const DEFAULT_FILE = path.resolve(__dirname, '..', '..', 'data', 'migrate', 'CombendiumOfProjects.xlsx');

const DEPARTMENT_SHEETS = [
  'Agriculture', 'Education', 'Gender,Youth&Sports', 'Trade & Tourism', 'Finance&ICT',
  'Lands,Urban&Housing', 'Transport & Public works', 'Devolution', 'Water', 'Health',
];

function parseArgs(argv) {
  const args = {
    apply: false,
    file: DEFAULT_FILE,
    batch: staging.DEFAULT_BATCH,
    source: staging.DEFAULT_SOURCE,
    sheet: 'Combined',
    allSheets: false,
    report: '',
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--all-sheets') args.allSheets = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--file=')) args.file = path.resolve(arg.slice('--file='.length));
    else if (arg.startsWith('--batch=')) args.batch = arg.slice('--batch='.length) || staging.DEFAULT_BATCH;
    else if (arg.startsWith('--source=')) args.source = arg.slice('--source='.length) || staging.DEFAULT_SOURCE;
    else if (arg.startsWith('--sheet=')) args.sheet = arg.slice('--sheet='.length) || 'Combined';
    else if (arg.startsWith('--report=')) args.report = path.resolve(arg.slice('--report='.length));
  }
  return args;
}

function printHelp() {
  console.log(`
Stage Machakos compendium project spreadsheet (no live project changes until review UI apply).

Usage:
  node api/scripts/stageMachakosCompendiumProjects.js
  node api/scripts/stageMachakosCompendiumProjects.js --apply --file=data/migrate/CombendiumOfProjects.xlsx
  node api/scripts/stageMachakosCompendiumProjects.js --apply --all-sheets

Options:
  --apply           Load rows into compendium_project_import_staging (replaces batch).
  --file=PATH       Excel path (default: data/migrate/CombendiumOfProjects.xlsx)
  --sheet=NAME      Sheet name (default: Combined)
  --all-sheets      Load Combined plus all department compendium sheets
  --batch=TEXT      Import batch id (default: compendium-fy2022-2025-v1)
  --source=TEXT     Source file label stored in staging
  --report=PATH     Write CSV review report

Migration:
  psql ... -f api/migrations/20260706_compendium_project_import_staging.sql

Review UI:
  Data → Compendium project staging
`);
}

function readCombinedSheet(workbook, sheetName = 'Combined') {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const raw = xlsx.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  const dataRows = raw.slice(2);
  return dataRows.map((row, index) => ({
    sourceRowNo: Number(row[0]) || index + 1,
    projectName: row[1],
    subCounty: row[2],
    ward: row[3],
    subLocation: '',
    department: row[4],
    financialYear: row[5],
    approvedCost: row[6],
    projectStatus: row[7],
    sourceSheet: sheetName,
  })).filter((row) => staging.cleanText(row.projectName));
}

function readDepartmentSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw = xlsx.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  const header = (raw[1] || []).map((h) => String(h).toLowerCase());
  const hasVillage = header.some((h) => h.includes('village') || h.includes('sub location'));
  const dataRows = raw.slice(2);
  return dataRows.map((row, index) => {
    if (hasVillage) {
      return {
        sourceRowNo: Number(row[0]) || index + 1,
        projectName: row[1],
        subCounty: row[2],
        ward: row[3],
        subLocation: row[4],
        department: row[5],
        financialYear: row[6],
        approvedCost: row[7],
        projectStatus: row[8],
        sourceSheet: sheetName,
      };
    }
    return {
      sourceRowNo: Number(row[0]) || index + 1,
      projectName: row[1],
      subCounty: row[2],
      ward: row[3],
      subLocation: '',
      department: row[4],
      financialYear: row[5],
      approvedCost: row[6],
      projectStatus: row[7],
      sourceSheet: sheetName,
    };
  }).filter((row) => staging.cleanText(row.projectName));
}

function readWorkbookRows(filePath, opts) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  if (opts.allSheets) {
    const rows = readCombinedSheet(workbook, 'Combined');
    for (const sheetName of DEPARTMENT_SHEETS) {
      rows.push(...readDepartmentSheet(workbook, sheetName));
    }
    return rows;
  }
  if (opts.sheet === 'Combined') return readCombinedSheet(workbook, 'Combined');
  if (DEPARTMENT_SHEETS.includes(opts.sheet)) return readDepartmentSheet(workbook, opts.sheet);
  return readCombinedSheet(workbook, opts.sheet);
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeReport(reportPath, rows) {
  const headers = [
    'source_row_no', 'source_sheet', 'project_name', 'sub_county_norm', 'ward_norm',
    'department_norm', 'financial_year_norm', 'approved_cost_norm', 'funding_class',
    'project_status_norm', 'match_project_id', 'proposed_action', 'review_notes',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.sourceRowNo, row.sourceSheet, row.projectName, row.subCountyNorm, row.wardNorm,
      row.departmentNorm, row.financialYearNorm, row.approvedCostNorm, row.fundingClass,
      row.projectStatusNorm, row.matchProjectId, row.proposedAction, row.reviewNotes,
    ].map(csvEscape).join(','));
  }
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

function resolveReportPath(args) {
  if (args.report) return args.report;
  const preferred = path.resolve(__dirname, '..', '..', 'data', 'migrate');
  const dir = fs.existsSync(preferred) ? preferred : path.join('/tmp', 'machakos-staging-reviews');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `staging-review-${args.batch}.csv`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const rawRows = readWorkbookRows(args.file, args);
  console.log(`Parsed ${rawRows.length} compendium row(s) from ${path.basename(args.file)}`);

  const staged = await staging.stageRowsWithMatching(rawRows, args.batch, args.source);
  const summary = staged.reduce((acc, row) => {
    acc[row.proposedAction] = (acc[row.proposedAction] || 0) + 1;
    return acc;
  }, {});
  console.log('Proposed actions:', summary);
  console.log(`RRI rows: ${staged.filter((r) => r.fundingClass === 'rri').length}`);

  if (args.apply) {
    await staging.replaceStagingBatch(args.batch, staged);
    console.log(`Loaded ${staged.length} row(s) into compendium_project_import_staging (batch: ${args.batch})`);
  } else {
    console.log('Dry run only. Re-run with --apply to load staging table.');
  }

  const reportPath = resolveReportPath(args);
  writeReport(reportPath, staged);
  console.log(`Wrote review CSV: ${reportPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
