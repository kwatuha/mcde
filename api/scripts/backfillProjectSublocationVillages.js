const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/db');

const DEFAULT_SEED = 'machakos-project-sublocation-village-backfill-v1';
const DEFAULT_COUNTY = process.env.DEFAULT_PROJECT_COUNTY || process.env.WARDS_COUNTY_SCOPE || 'Machakos';

function parseArgs(argv) {
  const args = {
    apply: false,
    overwrite: false,
    allowCountyFallback: false,
    limit: null,
    seed: DEFAULT_SEED,
    report: '',
  };

  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--overwrite') args.overwrite = true;
    else if (arg === '--allow-county-fallback') args.allowCountyFallback = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      args.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
    } else if (arg.startsWith('--seed=')) {
      args.seed = arg.slice('--seed='.length) || DEFAULT_SEED;
    } else if (arg.startsWith('--report=')) {
      args.report = arg.slice('--report='.length);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Backfill project sublocations and villages from machakos_sublocation_villages.

Default mode is dry-run. Nothing is updated unless --apply is provided.

Usage:
  node scripts/backfillProjectSublocationVillages.js
  node scripts/backfillProjectSublocationVillages.js --dry-run --limit=20
  node scripts/backfillProjectSublocationVillages.js --apply
  node scripts/backfillProjectSublocationVillages.js --apply --overwrite

Options:
  --apply                  Write changes to projects.location JSONB.
  --overwrite              Replace existing sublocation/village values.
  --allow-county-fallback  If no ward/sub-county match exists, choose from the whole catalog.
  --limit=N                Process at most N eligible projects.
  --seed=TEXT              Stable random seed. Same seed gives same assignments.
  --report=PATH            Write a CSV report of proposed/applied assignments.
`);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeLocation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function stableIndex(key, size) {
  if (!size) return -1;
  const hash = crypto.createHash('sha256').update(key).digest();
  const int = hash.readUInt32BE(0);
  return int % size;
}

function chooseCandidate(project, groups, options) {
  const location = normalizeLocation(project.location);
  const subcounty = cleanText(location.subcounty || location.SubCounty || location.constituency || location.Constituency);
  const ward = cleanText(location.ward || location.Ward);
  const subcountyKey = normKey(subcounty);
  const wardKey = normKey(ward);

  const matchLevels = [
    {
      level: 'ward',
      key: `${subcountyKey}|${wardKey}`,
      rows: subcountyKey && wardKey ? groups.bySubcountyWard.get(`${subcountyKey}|${wardKey}`) : null,
    },
    {
      level: 'ward-only',
      key: wardKey,
      rows: wardKey ? groups.byWard.get(wardKey) : null,
    },
    {
      level: 'subcounty',
      key: subcountyKey,
      rows: subcountyKey ? groups.bySubcounty.get(subcountyKey) : null,
    },
  ];

  if (options.allowCountyFallback) {
    matchLevels.push({ level: 'county', key: normKey(DEFAULT_COUNTY), rows: groups.all });
  }

  for (const match of matchLevels) {
    const candidates = Array.isArray(match.rows) ? match.rows : [];
    if (!candidates.length) continue;
    const id = project.project_id || project.id || project.projectId;
    const pick = stableIndex(`${options.seed}|${id}|${match.level}|${match.key}`, candidates.length);
    return { ...candidates[pick], matchLevel: match.level };
  }

  return null;
}

function addToGroup(map, key, row) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}

async function loadCatalog() {
  const result = await pool.query(`
    SELECT id, county, subcounty, ward, sublocation, village
    FROM machakos_sublocation_villages
    WHERE COALESCE(voided, false) = false
      AND NULLIF(TRIM(subcounty), '') IS NOT NULL
      AND NULLIF(TRIM(ward), '') IS NOT NULL
      AND NULLIF(TRIM(sublocation), '') IS NOT NULL
      AND NULLIF(TRIM(village), '') IS NOT NULL
    ORDER BY subcounty, ward, sublocation, village, id
  `);

  const rows = result.rows || [];
  const groups = {
    all: rows,
    bySubcountyWard: new Map(),
    byWard: new Map(),
    bySubcounty: new Map(),
  };

  for (const row of rows) {
    const subcountyKey = normKey(row.subcounty);
    const wardKey = normKey(row.ward);
    addToGroup(groups.bySubcountyWard, `${subcountyKey}|${wardKey}`, row);
    addToGroup(groups.byWard, wardKey, row);
    addToGroup(groups.bySubcounty, subcountyKey, row);
  }

  return groups;
}

async function loadEligibleProjects(options) {
  const conditions = ['COALESCE(voided, false) = false'];
  if (!options.overwrite) {
    conditions.push(`
      (
        location IS NULL
        OR NULLIF(TRIM(location->>'sublocation'), '') IS NULL
        OR NULLIF(TRIM(location->>'village'), '') IS NULL
      )
    `);
  }

  const limitSql = options.limit ? ` LIMIT ${Number(options.limit)}` : '';
  const result = await pool.query(`
    SELECT project_id, name, location
    FROM projects
    WHERE ${conditions.join(' AND ')}
    ORDER BY project_id
    ${limitSql}
  `);

  return result.rows || [];
}

function buildAssignments(projects, catalogGroups, options) {
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    overwrite: options.overwrite,
    allowCountyFallback: options.allowCountyFallback,
    seed: options.seed,
    eligibleProjects: projects.length,
    proposedUpdates: 0,
    skipped: 0,
    byMatchLevel: {},
    samples: [],
  };
  const assignments = [];

  for (const project of projects) {
    const location = normalizeLocation(project.location);
    const existingSublocation = cleanText(location.sublocation);
    const existingVillage = cleanText(location.village);
    if (!options.overwrite && existingSublocation && existingVillage) continue;

    const candidate = chooseCandidate(project, catalogGroups, options);
    if (!candidate) {
      summary.skipped += 1;
      if (summary.samples.length < 15) {
        summary.samples.push({
          projectId: project.project_id,
          projectName: project.name,
          status: 'skipped',
          reason: 'No catalog match for project ward/sub-county',
          subcounty: location.subcounty || location.constituency || '',
          ward: location.ward || '',
        });
      }
      continue;
    }

    const nextLocation = {
      ...location,
      county: cleanText(location.county) || candidate.county || DEFAULT_COUNTY,
      subcounty: cleanText(location.subcounty || location.constituency) || candidate.subcounty,
      constituency: cleanText(location.constituency || location.subcounty) || candidate.subcounty,
      ward: cleanText(location.ward) || candidate.ward,
      sublocation: candidate.sublocation,
      village: candidate.village,
    };

    const assignment = {
      projectId: project.project_id,
      projectName: project.name,
      matchLevel: candidate.matchLevel,
      oldSubcounty: cleanText(location.subcounty || location.constituency),
      oldWard: cleanText(location.ward),
      oldSublocation: existingSublocation,
      oldVillage: existingVillage,
      newSubcounty: nextLocation.subcounty,
      newWard: nextLocation.ward,
      newSublocation: candidate.sublocation,
      newVillage: candidate.village,
      nextLocation,
    };

    assignments.push(assignment);
    summary.proposedUpdates += 1;
    summary.byMatchLevel[candidate.matchLevel] = (summary.byMatchLevel[candidate.matchLevel] || 0) + 1;
    if (summary.samples.length < 15) summary.samples.push(assignment);
  }

  return { summary, assignments };
}

async function applyAssignments(assignments) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const assignment of assignments) {
      await client.query(
        `
        UPDATE projects
        SET location = $1::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = $2
          AND COALESCE(voided, false) = false
        `,
        [JSON.stringify(assignment.nextLocation), assignment.projectId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeReport(assignments, reportPath) {
  if (!reportPath) return;
  const absolutePath = path.resolve(reportPath);
  const headers = [
    'projectId',
    'projectName',
    'matchLevel',
    'oldSubcounty',
    'oldWard',
    'oldSublocation',
    'oldVillage',
    'newSubcounty',
    'newWard',
    'newSublocation',
    'newVillage',
  ];
  const lines = [
    headers.join(','),
    ...assignments.map((assignment) => headers.map((header) => csvEscape(assignment[header])).join(',')),
  ];
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const catalogGroups = await loadCatalog();
  if (!catalogGroups.all.length) {
    throw new Error('machakos_sublocation_villages has no active rows. Seed/import the catalog first.');
  }

  const projects = await loadEligibleProjects(options);
  const { summary, assignments } = buildAssignments(projects, catalogGroups, options);

  if (options.apply && assignments.length) {
    await applyAssignments(assignments);
    summary.appliedUpdates = assignments.length;
  } else {
    summary.appliedUpdates = 0;
  }

  writeReport(assignments, options.report);

  console.log(JSON.stringify({
    ...summary,
    report: options.report ? path.resolve(options.report) : null,
    note: options.apply
      ? 'Changes were applied.'
      : 'Dry-run only. Re-run with --apply to update projects.',
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Project sublocation/village backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end?.();
  });
