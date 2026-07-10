const pool = require('../config/db');
const { normKey, cleanText } = require('./importStagingTextUtils');
const metadataCatalog = require('./compendiumMetadataCatalogService');

const FIELD_TYPES = ['subcounty', 'ward', 'department'];
const EMPTY_SOURCE_KEY = '__empty__';

const FIELD_LABELS = {
  subcounty: 'Sub-county',
  ward: 'Ward',
  department: 'Department',
};

const ISSUE_CODES = {
  subcounty: ['meta_missing_subcounty', 'meta_unresolved_subcounty'],
  ward: ['meta_missing_ward', 'meta_unresolved_ward'],
  department: ['meta_missing_department', 'meta_unresolved_department'],
};

const NORM_COLUMNS = {
  subcounty: 'sub_county_norm',
  ward: 'ward_norm',
  department: 'department_norm',
};

function createImportMetadataResolutionService(config) {
  const {
    resolutionTable,
    stagingTable,
    getStagingService,
  } = config;

  async function ensureResolutionSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${resolutionTable} (
        id BIGSERIAL PRIMARY KEY,
        import_batch TEXT NOT NULL,
        field_type TEXT NOT NULL CHECK (field_type IN ('subcounty', 'ward', 'department')),
        source_key TEXT NOT NULL,
        source_value TEXT NULL,
        suggested_value TEXT NULL,
        suggested_score NUMERIC(5, 4) NULL,
        resolved_value TEXT NULL,
        resolved_by BIGINT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (import_batch, field_type, source_key)
      )
    `);
  }

  function sourceKeyForValue(value) {
    const key = normKey(value);
    return key || EMPTY_SOURCE_KEY;
  }

  function rowHasIssueCode(metadataRemarks, fieldType) {
    if (!metadataRemarks) return false;
    const codes = String(metadataRemarks).split(';').filter(Boolean);
    return ISSUE_CODES[fieldType].some((code) => codes.includes(code));
  }

  function fieldValuesFromRow(row) {
    return {
      subcounty: {
        raw: row.subCountyRaw,
        norm: row.subCountyNorm,
        display: row.subCountyNorm || row.subCountyRaw || '',
      },
      ward: {
        raw: row.wardRaw,
        norm: row.wardNorm,
        display: row.wardNorm || row.wardRaw || '',
      },
      department: {
        raw: row.departmentRaw,
        norm: row.departmentNorm,
        display: row.departmentNorm || row.departmentRaw || '',
      },
    };
  }

  function buildMatchKey(row) {
    return [
      normKey(row.projectName),
      normKey(row.wardNorm),
      normKey(row.subCountyNorm),
      normKey(row.departmentNorm),
    ].filter(Boolean).join('|');
  }

  async function loadResolutionMap(importBatch) {
    await ensureResolutionSchema();
    const result = await pool.query(
      `
      SELECT field_type, source_key, resolved_value
      FROM ${resolutionTable}
      WHERE import_batch = $1
        AND resolved_value IS NOT NULL
        AND BTRIM(resolved_value) <> ''
      `,
      [importBatch]
    );
    const map = {};
    for (const row of result.rows || []) {
      map[`${row.field_type}:${row.source_key}`] = row.resolved_value;
    }
    return map;
  }

  async function loadSavedResolutions(importBatch) {
    await ensureResolutionSchema();
    const result = await pool.query(
      `
      SELECT field_type, source_key, source_value, suggested_value, suggested_score, resolved_value, updated_at
      FROM ${resolutionTable}
      WHERE import_batch = $1
      `,
      [importBatch]
    );
    const map = {};
    for (const row of result.rows || []) {
      map[`${row.field_type}:${row.source_key}`] = row;
    }
    return map;
  }

  function getCatalogNames(catalogEntries, fieldType) {
    if (fieldType === 'department') return catalogEntries.departments.map((d) => d.name);
    if (fieldType === 'subcounty') return catalogEntries.subcounties.map((s) => s.name);
    return catalogEntries.wards.map((w) => w.name);
  }

  async function listMetadataSuggestions(importBatch) {
    const staging = getStagingService();
    await staging.ensureStagingSchema();
    await ensureResolutionSchema();

    const [rowsResult, savedMap, catalogEntries] = await Promise.all([
      pool.query(
        `
        SELECT *
        FROM ${stagingTable}
        WHERE import_batch = $1
          AND metadata_remarks IS NOT NULL
          AND BTRIM(metadata_remarks) <> ''
        ORDER BY source_row_no ASC
        `,
        [importBatch]
      ),
      loadSavedResolutions(importBatch),
      metadataCatalog.loadMetadataCatalogEntries(),
    ]);

    const groups = new Map();

    for (const dbRow of rowsResult.rows || []) {
      const row = staging.mapStagingRow(dbRow);
      const values = fieldValuesFromRow(row);

      for (const fieldType of FIELD_TYPES) {
        if (!rowHasIssueCode(row.metadataRemarks, fieldType)) continue;

        const field = values[fieldType];
        const sourceKey = sourceKeyForValue(field.display);
        const groupKey = `${fieldType}:${sourceKey}`;
        const existing = groups.get(groupKey) || {
          fieldType,
          fieldLabel: FIELD_LABELS[fieldType],
          sourceKey,
          foundValue: field.display || null,
          rowCount: 0,
          issueCodes: ISSUE_CODES[fieldType],
        };
        existing.rowCount += 1;
        groups.set(groupKey, existing);
      }
    }

    const suggestions = [];
    for (const group of groups.values()) {
      const saved = savedMap[`${group.fieldType}:${group.sourceKey}`];
      const catalogNames = getCatalogNames(catalogEntries, group.fieldType);
      const suggested = metadataCatalog.suggestCatalogMatches(group.foundValue, catalogNames, 5);
      const topSuggestion = suggested[0] || null;

      suggestions.push({
        fieldType: group.fieldType,
        fieldLabel: group.fieldLabel,
        sourceKey: group.sourceKey,
        foundValue: group.foundValue,
        rowCount: group.rowCount,
        suggestedValue: saved?.suggested_value || topSuggestion?.name || null,
        suggestedScore: saved?.suggested_score != null
          ? Number(saved.suggested_score)
          : topSuggestion?.score ?? null,
        suggestedMatches: suggested,
        resolvedValue: saved?.resolved_value || null,
        isResolved: Boolean(saved?.resolved_value && String(saved.resolved_value).trim()),
        updatedAt: saved?.updated_at || null,
      });
    }

    suggestions.sort((a, b) => {
      if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1;
      if (b.rowCount !== a.rowCount) return b.rowCount - a.rowCount;
      return String(a.foundValue || '').localeCompare(String(b.foundValue || ''));
    });

    return {
      batch: importBatch,
      total: suggestions.length,
      unresolvedCount: suggestions.filter((s) => !s.isResolved).length,
      resolvedCount: suggestions.filter((s) => s.isResolved).length,
      suggestions,
      catalogs: {
        subcounty: getCatalogNames(catalogEntries, 'subcounty'),
        ward: getCatalogNames(catalogEntries, 'ward'),
        department: getCatalogNames(catalogEntries, 'department'),
      },
    };
  }

  function rowMatchesResolution(row, fieldType, sourceKey) {
    const values = fieldValuesFromRow(row);
    const field = values[fieldType];
    if (sourceKey === EMPTY_SOURCE_KEY) {
      return !cleanText(field.raw) && !cleanText(field.norm);
    }
    return sourceKeyForValue(field.display) === sourceKey;
  }

  function mergeProjectFieldUpdates(projectUpdates, projectId, updates) {
    if (!Number.isFinite(projectId)) return;
    const existing = projectUpdates.get(projectId) || {};
    if (updates.sub_county_norm) existing.subCountyNorm = updates.sub_county_norm;
    if (updates.ward_norm) existing.wardNorm = updates.ward_norm;
    if (updates.department_norm) existing.departmentNorm = updates.department_norm;
    if (Object.keys(existing).length) {
      projectUpdates.set(projectId, existing);
    }
  }

  async function propagateResolutionsToAppliedProjects(projectUpdates) {
    let updatedProjects = 0;

    for (const [projectId, fields] of projectUpdates) {
      const currentResult = await pool.query(
        `
        SELECT state_department, location
        FROM projects
        WHERE project_id = $1
          AND COALESCE(voided, false) = false
        `,
        [projectId]
      );
      const current = currentResult.rows[0];
      if (!current) continue;

      let location = current.location;
      if (typeof location === 'string') {
        try {
          location = JSON.parse(location);
        } catch {
          location = {};
        }
      }
      location = location && typeof location === 'object' ? location : {};

      const sets = [];
      const params = [];
      let paramIndex = 1;

      if (fields.departmentNorm && cleanText(current.state_department) !== fields.departmentNorm) {
        sets.push(`state_department = $${paramIndex}`);
        params.push(fields.departmentNorm);
        paramIndex += 1;
      }

      const locationPatch = {};
      if (fields.subCountyNorm && cleanText(location.subcounty) !== fields.subCountyNorm) {
        locationPatch.subcounty = fields.subCountyNorm;
        locationPatch.constituency = fields.subCountyNorm;
      }
      if (fields.wardNorm && cleanText(location.ward) !== fields.wardNorm) {
        locationPatch.ward = fields.wardNorm;
      }
      if (Object.keys(locationPatch).length) {
        sets.push(`location = COALESCE(location, '{}'::jsonb) || $${paramIndex}::jsonb`);
        params.push(JSON.stringify(locationPatch));
        paramIndex += 1;
      }

      if (!sets.length) continue;

      sets.push('updated_at = NOW()');
      params.push(projectId);

      const result = await pool.query(
        `
        UPDATE projects
        SET ${sets.join(', ')}
        WHERE project_id = $${paramIndex}
          AND COALESCE(voided, false) = false
        RETURNING project_id
        `,
        params
      );
      if ((result.rows || []).length) updatedProjects += 1;
    }

    return { updatedProjects };
  }

  async function syncAppliedProjectsFromStaging(importBatch) {
    const staging = getStagingService();
    const rowsResult = await pool.query(
      `
      SELECT *
      FROM ${stagingTable}
      WHERE import_batch = $1
        AND applied_project_id IS NOT NULL
      `,
      [importBatch]
    );

    const projectUpdates = new Map();
    for (const dbRow of rowsResult.rows || []) {
      const row = staging.mapStagingRow(dbRow);
      const projectId = Number(dbRow.applied_project_id);
      mergeProjectFieldUpdates(projectUpdates, projectId, {
        sub_county_norm: row.subCountyNorm,
        ward_norm: row.wardNorm,
        department_norm: row.departmentNorm,
      });
    }

    return propagateResolutionsToAppliedProjects(projectUpdates);
  }

  async function applyResolutionsToStaging(importBatch) {
    const staging = getStagingService();
    await staging.ensureStagingSchema();
    const resolutions = await pool.query(
      `
      SELECT field_type, source_key, resolved_value
      FROM ${resolutionTable}
      WHERE import_batch = $1
        AND resolved_value IS NOT NULL
        AND BTRIM(resolved_value) <> ''
      `,
      [importBatch]
    );

    const rowsResult = await pool.query(
      `SELECT * FROM ${stagingTable} WHERE import_batch = $1`,
      [importBatch]
    );

    let updatedRows = 0;
    for (const dbRow of rowsResult.rows || []) {
      const row = staging.mapStagingRow(dbRow);
      const updates = {};

      for (const resolution of resolutions.rows || []) {
        if (!rowMatchesResolution(row, resolution.field_type, resolution.source_key)) continue;
        updates[NORM_COLUMNS[resolution.field_type]] = resolution.resolved_value;
      }

      if (!Object.keys(updates).length) continue;

      const nextRow = {
        ...row,
        subCountyNorm: updates.sub_county_norm ?? row.subCountyNorm,
        wardNorm: updates.ward_norm ?? row.wardNorm,
        departmentNorm: updates.department_norm ?? row.departmentNorm,
      };

      const matchKey = buildMatchKey(nextRow);
      await pool.query(
        `
        UPDATE ${stagingTable}
        SET
          sub_county_norm = COALESCE($1, sub_county_norm),
          ward_norm = COALESCE($2, ward_norm),
          department_norm = COALESCE($3, department_norm),
          match_key = $4,
          updated_at = NOW()
        WHERE id = $5
        `,
        [
          updates.sub_county_norm || null,
          updates.ward_norm || null,
          updates.department_norm || null,
          matchKey,
          dbRow.id,
        ]
      );
      updatedRows += 1;
    }

    const propagateResult = await syncAppliedProjectsFromStaging(importBatch);

    return {
      updatedRows,
      updatedProjects: propagateResult.updatedProjects,
    };
  }

  async function saveResolutions(importBatch, items, userId) {
    await ensureResolutionSchema();
    if (!Array.isArray(items) || !items.length) {
      return {
        saved: 0,
        updatedRows: 0,
        updatedProjects: 0,
        metadata: { total: 0, withIssues: 0 },
      };
    }

    const catalogEntries = await metadataCatalog.loadMetadataCatalogEntries();
    let saved = 0;

    for (const item of items) {
      const fieldType = String(item.fieldType || '').trim();
      const sourceKey = String(item.sourceKey || '').trim();
      const resolvedValue = cleanText(item.resolvedValue);
      if (!FIELD_TYPES.includes(fieldType) || !sourceKey || !resolvedValue) continue;

      const catalogNames = getCatalogNames(catalogEntries, fieldType);
      if (!catalogNames.some((name) => normKey(name) === normKey(resolvedValue))) {
        throw new Error(`Resolved ${FIELD_LABELS[fieldType]} "${resolvedValue}" is not in the system catalog.`);
      }

      const suggested = metadataCatalog.suggestCatalogMatches(item.foundValue || '', catalogNames, 1)[0];

      await pool.query(
        `
        INSERT INTO ${resolutionTable} (
          import_batch, field_type, source_key, source_value,
          suggested_value, suggested_score, resolved_value, resolved_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (import_batch, field_type, source_key) DO UPDATE SET
          source_value = EXCLUDED.source_value,
          suggested_value = EXCLUDED.suggested_value,
          suggested_score = EXCLUDED.suggested_score,
          resolved_value = EXCLUDED.resolved_value,
          resolved_by = EXCLUDED.resolved_by,
          updated_at = NOW()
        `,
        [
          importBatch,
          fieldType,
          sourceKey,
          cleanText(item.foundValue) || null,
          suggested?.name || null,
          suggested?.score ?? null,
          resolvedValue,
          userId || null,
        ]
      );
      saved += 1;
    }

    const applyResult = await applyResolutionsToStaging(importBatch);
    const metadata = await getStagingService().refreshMetadataRemarksForBatch(importBatch);

    return {
      saved,
      updatedRows: applyResult.updatedRows,
      updatedProjects: applyResult.updatedProjects,
      metadata,
    };
  }

  return {
    EMPTY_SOURCE_KEY,
    FIELD_LABELS,
    ensureResolutionSchema,
    loadResolutionMap,
    listMetadataSuggestions,
    saveResolutions,
    applyResolutionsToStaging,
    syncAppliedProjectsFromStaging,
    propagateResolutionsToAppliedProjects,
    sourceKeyForValue,
  };
}

module.exports = {
  createImportMetadataResolutionService,
  FIELD_LABELS,
  EMPTY_SOURCE_KEY,
};
