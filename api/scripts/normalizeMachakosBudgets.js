#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = require('../config/db');

const STATUS_PROGRESS_BAND = {
  COMPLETED: [0.9, 1.0],
  IN_PROGRESS: [0.35, 0.75],
  AT_RISK: [0.2, 0.55],
  ON_HOLD: [0.1, 0.4],
  NOT_STARTED: [0.02, 0.15],
  UNKNOWN: [0.15, 0.5],
};

const normalizeStatus = (value) =>
  String(value || 'UNKNOWN')
    .trim()
    .toUpperCase()
    .replace(/[\/\s-]+/g, '_');

const roundToNearest = (value, step = 50000) => Math.round(value / step) * step;

function computeAllocated(projectId) {
  // County-meaningful range: ~2.5M to ~24M
  const seed = (projectId * 7919) % 1000;
  const min = 2500000;
  const max = 24000000;
  const raw = min + ((max - min) * seed) / 999;
  return Math.max(min, roundToNearest(raw, 50000));
}

function computeDisbursed(allocated, status, projectId) {
  const band = STATUS_PROGRESS_BAND[status] || STATUS_PROGRESS_BAND.UNKNOWN;
  const jitter = ((projectId * 3571) % 1000) / 1000;
  const ratio = band[0] + (band[1] - band[0]) * jitter;
  const raw = allocated * ratio;
  return Math.min(allocated, Math.max(0, roundToNearest(raw, 10000)));
}

async function run() {
  const rowsRes = await pool.query(
    `SELECT project_id, budget, progress
     FROM projects
     WHERE voided = false
     ORDER BY project_id`
  );
  const rows = rowsRes.rows || [];
  if (!rows.length) {
    console.log('No active projects found.');
    return;
  }

  await pool.query('BEGIN');
  try {
    for (const row of rows) {
      const projectId = Number(row.project_id);
      const budget = typeof row.budget === 'object' && row.budget ? row.budget : {};
      const progress = typeof row.progress === 'object' && row.progress ? row.progress : {};
      const status = normalizeStatus(progress.status);

      const allocated = computeAllocated(projectId);
      const disbursed = computeDisbursed(allocated, status, projectId);
      const completion = Math.max(0, Math.min(100, Math.round((disbursed / allocated) * 100)));

      const nextBudget = {
        ...budget,
        allocated_amount_kes: allocated,
        disbursed_amount_kes: disbursed,
      };
      const nextProgress = {
        ...progress,
        percentage_complete: completion,
      };

      await pool.query(
        `UPDATE projects
         SET budget = $1::jsonb,
             progress = $2::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $3`,
        [JSON.stringify(nextBudget), JSON.stringify(nextProgress), projectId]
      );
    }
    await pool.query('COMMIT');
    console.log(`Normalized county-level budgets for ${rows.length} projects.`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

run()
  .catch((error) => {
    console.error('Failed to normalize budgets:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (_error) {
      // ignore
    }
  });
