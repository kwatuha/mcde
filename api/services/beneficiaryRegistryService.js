const pool = require('../config/db');

const BENEFICIARY_TYPES = ['individual', 'group', 'household', 'institution'];

const IMPORT_TEMPLATE_HEADERS = [
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

function textOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function pick(row, ...keys) {
  const lookup = row.__lookup || row;
  for (const key of keys) {
    const val = lookup[normalizeHeader(key)];
    if (val !== undefined && val !== null && String(val).trim() !== '') return val;
  }
  return null;
}

function buildLookup(row = {}) {
  const lookup = {};
  Object.entries(row).forEach(([key, value]) => {
    lookup[normalizeHeader(key)] = value;
  });
  return lookup;
}

function normalizeBeneficiaryType(value) {
  const raw = textOrNull(value)?.toLowerCase() || 'individual';
  if (BENEFICIARY_TYPES.includes(raw)) return raw;
  if (['person', 'member', 'participant'].includes(raw)) return 'individual';
  if (['cbo', 'shg', 'association', 'organization', 'organisation'].includes(raw)) return 'group';
  if (['school', 'hospital', 'facility'].includes(raw)) return 'institution';
  return 'individual';
}

function parseIntOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseDateOrNull(value) {
  const text = textOrNull(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function resolveDisplayName(mapped) {
  const explicit = textOrNull(mapped.displayName);
  if (explicit) return explicit;
  const first = textOrNull(mapped.firstName);
  const last = textOrNull(mapped.lastName);
  if (first || last) return [first, last].filter(Boolean).join(' ').trim();
  return null;
}

function parseLinkedId(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  const match = text.match(/^(\d+)/);
  if (match) return Number(match[1]);
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function linkedReferenceLabel(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  return text.replace(/^\d+\s*[—–-]\s*/, '').trim() || text;
}

async function resolveImportRowLinks(mapped, row = {}) {
  const lookup = buildLookup(row);
  const projectRaw = pick({ __lookup: lookup }, 'Project ID', 'projectId', 'Project');
  const rriRaw = pick({ __lookup: lookup }, 'RRI Programme ID', 'rriProgrammeId', 'rri_programme_id', 'RRI Programme');
  const siteRaw = pick({ __lookup: lookup }, 'RRI Site ID', 'rriSiteId', 'rri_site_id', 'RRI Site');

  if (!mapped.projectId && projectRaw) {
    const label = linkedReferenceLabel(projectRaw);
    if (label) {
      const result = await pool.query(
        `SELECT project_id FROM projects
         WHERE COALESCE(voided, false) = false
           AND (
             lower(trim(name)) = lower(trim($1))
             OR lower(trim(name)) LIKE lower('%' || trim($1) || '%')
           )
         ORDER BY CASE WHEN lower(trim(name)) = lower(trim($1)) THEN 0 ELSE 1 END, project_id
         LIMIT 1`,
        [label]
      );
      if (result.rows.length) mapped.projectId = result.rows[0].project_id;
    }
  }

  if (!mapped.rriProgrammeId && rriRaw) {
    const label = linkedReferenceLabel(rriRaw);
    if (label) {
      const result = await pool.query(
        `SELECT programme_id FROM rri_programmes
         WHERE COALESCE(voided, false) = false
           AND lower(trim(name)) = lower(trim($1))
         LIMIT 1`,
        [label]
      );
      if (result.rows.length) mapped.rriProgrammeId = result.rows[0].programme_id;
    }
  }

  if (!mapped.rriSiteId && siteRaw && mapped.rriProgrammeId) {
    const siteText = String(siteRaw).trim();
    if (siteText && !/^\d+$/.test(siteText)) {
      const result = await pool.query(
        `SELECT site_id FROM rri_programme_sites
         WHERE rri_programme_id = $1
           AND COALESCE(voided, false) = false
           AND lower(trim(site_name)) = lower(trim($2))
         LIMIT 1`,
        [mapped.rriProgrammeId, siteText]
      );
      if (result.rows.length) mapped.rriSiteId = result.rows[0].site_id;
    }
  }
}

function mapImportRow(row = {}) {
  const lookup = buildLookup(row);
  const beneficiaryType = normalizeBeneficiaryType(pick({ __lookup: lookup }, 'Beneficiary Type', 'beneficiaryType', 'Type'));
  const mapped = {
    beneficiaryType,
    registryCode: pick({ __lookup: lookup }, 'Registry Code', 'registryCode', 'Beneficiary ID', 'Individual ID'),
    displayName: pick({ __lookup: lookup }, 'Display Name', 'displayName', 'Name', 'Group Name'),
    firstName: pick({ __lookup: lookup }, 'First Name', 'firstName'),
    lastName: pick({ __lookup: lookup }, 'Last Name', 'lastName'),
    gender: pick({ __lookup: lookup }, 'Gender', 'gender'),
    age: parseIntOrNull(pick({ __lookup: lookup }, 'Age', 'age')),
    idNumber: pick({ __lookup: lookup }, 'ID Number', 'idNumber', 'National ID'),
    phone: pick({ __lookup: lookup }, 'Phone', 'phone', 'Mobile'),
    email: pick({ __lookup: lookup }, 'Email', 'email'),
    groupType: pick({ __lookup: lookup }, 'Group Type', 'groupType'),
    memberCount: parseIntOrNull(pick({ __lookup: lookup }, 'Member Count', 'memberCount', 'Members')),
    leadContactName: pick({ __lookup: lookup }, 'Lead Contact Name', 'leadContactName', 'Contact Person'),
    leadContactPhone: pick({ __lookup: lookup }, 'Lead Contact Phone', 'leadContactPhone', 'Contact Phone'),
    county: pick({ __lookup: lookup }, 'County', 'county'),
    subcounty: pick({ __lookup: lookup }, 'Sub-County', 'Sub County', 'subCounty', 'subcounty'),
    ward: pick({ __lookup: lookup }, 'Ward', 'ward'),
    village: pick({ __lookup: lookup }, 'Village', 'village'),
    projectId: parseLinkedId(pick({ __lookup: lookup }, 'Project ID', 'projectId', 'Project')),
    rriProgrammeId: parseLinkedId(pick({ __lookup: lookup }, 'RRI Programme ID', 'rriProgrammeId', 'rri_programme_id', 'RRI Programme')),
    rriSiteId: parseIntOrNull(pick({ __lookup: lookup }, 'RRI Site ID', 'rriSiteId', 'rri_site_id')),
    sector: pick({ __lookup: lookup }, 'Sector', 'sector'),
    enrollmentDate: parseDateOrNull(pick({ __lookup: lookup }, 'Enrollment Date (YYYY-MM-DD)', 'Enrollment Date', 'enrollmentDate')),
    notes: pick({ __lookup: lookup }, 'Notes', 'notes', 'Occupation', 'occupation'),
    legacyIndividualId: parseIntOrNull(pick({ __lookup: lookup }, 'Individual ID', 'individualId')),
  };
  mapped.displayName = resolveDisplayName(mapped);
  return mapped;
}

function isExampleImportRow(mapped) {
  const name = String(mapped.displayName || '').toLowerCase();
  return name.includes('example') && name.includes('delete');
}

function validateImportRow(mapped) {
  const errors = [];
  if (!mapped.displayName) {
    errors.push('Display Name (or First/Last Name) is required.');
  }
  if (['group', 'household', 'institution'].includes(mapped.beneficiaryType)) {
    if (!mapped.memberCount || mapped.memberCount < 1) {
      errors.push('Member Count is required for group/household/institution types.');
    }
    if (mapped.beneficiaryType === 'group' && !mapped.groupType) {
      errors.push('Group Type is recommended for group beneficiaries.');
    }
  }
  if (mapped.beneficiaryType === 'individual' && mapped.age != null && (mapped.age < 0 || mapped.age > 120)) {
    errors.push('Age must be between 0 and 120.');
  }
  if (!mapped.projectId && !mapped.rriProgrammeId) {
    errors.push('Link at least one of Project or RRI Programme (recommended).');
  }
  return errors;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS beneficiary_types (
      type_code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await pool.query(`
    INSERT INTO beneficiary_types (type_code, label, description, sort_order)
    VALUES
      ('individual', 'Individual', 'Single person beneficiary', 1),
      ('group', 'Group', 'CBO, SHG, farmer group, association, etc.', 2),
      ('household', 'Household', 'Household-level beneficiary unit', 3),
      ('institution', 'Institution', 'School, facility, or organization', 4)
    ON CONFLICT (type_code) DO NOTHING
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS beneficiaries (
      beneficiary_id BIGSERIAL PRIMARY KEY,
      beneficiary_type TEXT NOT NULL DEFAULT 'individual',
      registry_code TEXT NULL,
      display_name TEXT NOT NULL,
      first_name TEXT NULL,
      last_name TEXT NULL,
      gender TEXT NULL,
      age INTEGER NULL,
      date_of_birth DATE NULL,
      id_number TEXT NULL,
      phone TEXT NULL,
      email TEXT NULL,
      group_type TEXT NULL,
      member_count INTEGER NULL,
      lead_contact_name TEXT NULL,
      lead_contact_phone TEXT NULL,
      county TEXT NULL,
      subcounty TEXT NULL,
      ward TEXT NULL,
      village TEXT NULL,
      project_id BIGINT NULL,
      rri_programme_id BIGINT NULL,
      rri_site_id BIGINT NULL,
      sector TEXT NULL,
      enrollment_date DATE NULL,
      notes TEXT NULL,
      attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
      legacy_individual_id BIGINT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_by BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function tableExists() {
  const result = await pool.query(`SELECT to_regclass('public.beneficiaries') AS reg`);
  return Boolean(result.rows?.[0]?.reg);
}

function mapRow(row) {
  if (!row) return null;
  return {
    beneficiaryId: row.beneficiary_id,
    beneficiaryType: row.beneficiary_type,
    beneficiaryTypeLabel: row.beneficiary_type_label || row.beneficiary_type,
    registryCode: row.registry_code,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    age: row.age,
    dateOfBirth: row.date_of_birth,
    idNumber: row.id_number,
    phone: row.phone,
    email: row.email,
    groupType: row.group_type,
    memberCount: row.member_count,
    leadContactName: row.lead_contact_name,
    leadContactPhone: row.lead_contact_phone,
    county: row.county,
    subcounty: row.subcounty,
    ward: row.ward,
    village: row.village,
    projectId: row.project_id,
    rriProgrammeId: row.rri_programme_id,
    rriSiteId: row.rri_site_id,
    sector: row.sector,
    enrollmentDate: row.enrollment_date,
    notes: row.notes,
    attributes: row.attributes || {},
    legacyIndividualId: row.legacy_individual_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    individualId: row.legacy_individual_id || row.beneficiary_id,
    householdId: row.attributes?.householdId || null,
    subCounty: row.subcounty,
    project_id: row.project_id,
  };
}

function buildListQuery(filters = {}) {
  const params = [];
  const where = ['COALESCE(b.voided, false) = false'];

  const addEq = (column, value) => {
    if (value == null || value === '' || value === 'All') return;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  };

  addEq('b.beneficiary_type', filters.beneficiaryType);
  addEq('b.county', filters.county);
  addEq('b.subcounty', filters.subCounty || filters.subcounty);
  addEq('b.ward', filters.ward);
  addEq('b.gender', filters.gender);
  addEq('b.project_id', filters.projectId != null ? Number(filters.projectId) : null);
  addEq('b.rri_programme_id', filters.rriProgrammeId != null ? Number(filters.rriProgrammeId) : null);
  addEq('b.sector', filters.sector);

  if (filters.search) {
    params.push(`%${textOrNull(filters.search)}%`);
    where.push(`(
      b.display_name ILIKE $${params.length}
      OR COALESCE(b.registry_code, '') ILIKE $${params.length}
      OR COALESCE(b.phone, '') ILIKE $${params.length}
      OR COALESCE(b.id_number, '') ILIKE $${params.length}
    )`);
  }

  if (filters.minAge != null && filters.minAge !== '') {
    params.push(Number(filters.minAge));
    where.push(`b.age >= $${params.length}`);
  }
  if (filters.maxAge != null && filters.maxAge !== '') {
    params.push(Number(filters.maxAge));
    where.push(`b.age <= $${params.length}`);
  }

  const validOrder = {
    beneficiaryId: 'b.beneficiary_id',
    displayName: 'b.display_name',
    beneficiaryType: 'b.beneficiary_type',
    county: 'b.county',
    subcounty: 'b.subcounty',
    ward: 'b.ward',
    age: 'b.age',
    memberCount: 'b.member_count',
    createdAt: 'b.created_at',
    individualId: 'b.beneficiary_id',
  };
  const orderBy = validOrder[filters.orderBy] || 'b.beneficiary_id';
  const order = String(filters.order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  return { where, params, orderBy, order };
}

async function listBeneficiaries(filters = {}, pagination = {}) {
  await ensureSchema();
  const page = Math.max(Number(pagination.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(pagination.pageSize) || 25, 1), 500);
  const offset = (page - 1) * pageSize;
  const { where, params, orderBy, order } = buildListQuery(filters);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM beneficiaries b WHERE ${where.join(' AND ')}`,
    params
  );
  const totalCount = countResult.rows?.[0]?.total || 0;

  const dataParams = [...params, pageSize, offset];
  const dataResult = await pool.query(
    `
    SELECT b.*, bt.label AS beneficiary_type_label
    FROM beneficiaries b
    LEFT JOIN beneficiary_types bt ON bt.type_code = b.beneficiary_type
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy} ${order}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `,
    dataParams
  );

  return {
    rows: (dataResult.rows || []).map(mapRow),
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize) || 1,
  };
}

async function getTypes() {
  await ensureSchema();
  const result = await pool.query(
    `SELECT type_code AS "typeCode", label, description
     FROM beneficiary_types WHERE is_active = true
     ORDER BY sort_order ASC, label ASC`
  );
  return result.rows || [];
}

async function getFilterOptions() {
  await ensureSchema();
  const [counties, subcounties, wards, genders, sectors, groupTypes] = await Promise.all([
    pool.query(`SELECT DISTINCT county FROM beneficiaries WHERE COALESCE(voided,false)=false AND county IS NOT NULL ORDER BY county`),
    pool.query(`SELECT DISTINCT subcounty FROM beneficiaries WHERE COALESCE(voided,false)=false AND subcounty IS NOT NULL ORDER BY subcounty`),
    pool.query(`SELECT DISTINCT ward FROM beneficiaries WHERE COALESCE(voided,false)=false AND ward IS NOT NULL ORDER BY ward`),
    pool.query(`SELECT DISTINCT gender FROM beneficiaries WHERE COALESCE(voided,false)=false AND gender IS NOT NULL ORDER BY gender`),
    pool.query(`SELECT DISTINCT sector FROM beneficiaries WHERE COALESCE(voided,false)=false AND sector IS NOT NULL ORDER BY sector`),
    pool.query(`SELECT DISTINCT group_type FROM beneficiaries WHERE COALESCE(voided,false)=false AND group_type IS NOT NULL ORDER BY group_type`),
  ]);
  return {
    counties: counties.rows.map((r) => r.county),
    subCounties: subcounties.rows.map((r) => r.subcounty),
    wards: wards.rows.map((r) => r.ward),
    genders: genders.rows.map((r) => r.gender),
    sectors: sectors.rows.map((r) => r.sector),
    groupTypes: groupTypes.rows.map((r) => r.group_type),
    beneficiaryTypes: (await getTypes()).map((t) => t.typeCode),
  };
}

async function upsertBeneficiaryRecord(input, userId = null) {
  await ensureSchema();
  const mapped = input.beneficiaryType !== undefined ? input : mapImportRow(input);
  const displayName = textOrNull(mapped.displayName) || resolveDisplayName(mapped);
  if (!displayName) {
    throw new Error('Display name is required (or provide First Name / Last Name / Group Name).');
  }

  const payload = {
    beneficiary_type: normalizeBeneficiaryType(mapped.beneficiaryType),
    registry_code: textOrNull(mapped.registryCode),
    display_name: displayName,
    first_name: textOrNull(mapped.firstName),
    last_name: textOrNull(mapped.lastName),
    gender: textOrNull(mapped.gender),
    age: mapped.age != null ? parseIntOrNull(mapped.age) : null,
    id_number: textOrNull(mapped.idNumber),
    phone: textOrNull(mapped.phone),
    email: textOrNull(mapped.email),
    group_type: textOrNull(mapped.groupType),
    member_count: mapped.memberCount != null ? parseIntOrNull(mapped.memberCount) : null,
    lead_contact_name: textOrNull(mapped.leadContactName),
    lead_contact_phone: textOrNull(mapped.leadContactPhone),
    county: textOrNull(mapped.county),
    subcounty: textOrNull(mapped.subcounty || mapped.subCounty),
    ward: textOrNull(mapped.ward),
    village: textOrNull(mapped.village),
    project_id: mapped.projectId != null ? parseIntOrNull(mapped.projectId) : null,
    rri_programme_id: mapped.rriProgrammeId != null ? parseIntOrNull(mapped.rriProgrammeId) : null,
    rri_site_id: mapped.rriSiteId != null ? parseIntOrNull(mapped.rriSiteId) : null,
    sector: textOrNull(mapped.sector),
    enrollment_date: mapped.enrollmentDate || null,
    notes: textOrNull(mapped.notes),
    legacy_individual_id: mapped.legacyIndividualId != null ? parseIntOrNull(mapped.legacyIndividualId) : null,
    created_by: userId,
  };

  let existing = null;
  if (input.beneficiaryId != null) {
    const found = await pool.query(
      `SELECT beneficiary_id FROM beneficiaries WHERE beneficiary_id = $1 AND COALESCE(voided,false)=false LIMIT 1`,
      [Number(input.beneficiaryId)]
    );
    existing = found.rows?.[0] || null;
  }
  if (!existing?.beneficiary_id && payload.registry_code) {
    const found = await pool.query(
      `SELECT beneficiary_id FROM beneficiaries
       WHERE lower(trim(registry_code)) = lower(trim($1)) AND COALESCE(voided,false)=false LIMIT 1`,
      [payload.registry_code]
    );
    existing = found.rows?.[0] || null;
  } else if (payload.legacy_individual_id) {
    const found = await pool.query(
      `SELECT beneficiary_id FROM beneficiaries
       WHERE legacy_individual_id = $1 AND COALESCE(voided,false)=false LIMIT 1`,
      [payload.legacy_individual_id]
    );
    existing = found.rows?.[0] || null;
  }

  if (existing?.beneficiary_id) {
    await pool.query(
      `
      UPDATE beneficiaries SET
        beneficiary_type = $2, registry_code = COALESCE($3, registry_code), display_name = $4,
        first_name = $5, last_name = $6, gender = $7, age = $8, id_number = $9, phone = $10, email = $11,
        group_type = $12, member_count = $13, lead_contact_name = $14, lead_contact_phone = $15,
        county = $16, subcounty = $17, ward = $18, village = $19, project_id = $20,
        rri_programme_id = $21, rri_site_id = $22, sector = $23, enrollment_date = $24, notes = $25,
        updated_at = NOW(), voided = false
      WHERE beneficiary_id = $1
      `,
      [
        existing.beneficiary_id,
        payload.beneficiary_type, payload.registry_code, payload.display_name,
        payload.first_name, payload.last_name, payload.gender, payload.age,
        payload.id_number, payload.phone, payload.email, payload.group_type,
        payload.member_count, payload.lead_contact_name, payload.lead_contact_phone,
        payload.county, payload.subcounty, payload.ward, payload.village,
        payload.project_id, payload.rri_programme_id, payload.rri_site_id,
        payload.sector, payload.enrollment_date, payload.notes,
      ]
    );
    return { beneficiaryId: existing.beneficiary_id, updated: true };
  }

  if (!payload.registry_code) {
    const seq = await pool.query(`SELECT COALESCE(MAX(beneficiary_id), 0) + 1 AS next_id FROM beneficiaries`);
    const nextId = seq.rows?.[0]?.next_id || 1;
    const prefix = payload.beneficiary_type === 'group' ? 'GRP'
      : payload.beneficiary_type === 'household' ? 'HH'
        : payload.beneficiary_type === 'institution' ? 'INS' : 'IND';
    payload.registry_code = `${prefix}-${nextId}`;
  }

  const result = await pool.query(
    `
    INSERT INTO beneficiaries (
      beneficiary_type, registry_code, display_name, first_name, last_name, gender, age,
      id_number, phone, email, group_type, member_count, lead_contact_name, lead_contact_phone,
      county, subcounty, ward, village, project_id, rri_programme_id, rri_site_id,
      sector, enrollment_date, notes, legacy_individual_id, created_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
    )
    RETURNING beneficiary_id
    `,
    [
      payload.beneficiary_type, payload.registry_code, payload.display_name,
      payload.first_name, payload.last_name, payload.gender, payload.age,
      payload.id_number, payload.phone, payload.email, payload.group_type,
      payload.member_count, payload.lead_contact_name, payload.lead_contact_phone,
      payload.county, payload.subcounty, payload.ward, payload.village,
      payload.project_id, payload.rri_programme_id, payload.rri_site_id,
      payload.sector, payload.enrollment_date, payload.notes,
      payload.legacy_individual_id, payload.created_by,
    ]
  );
  return { beneficiaryId: result.rows[0].beneficiary_id, updated: false };
}

async function previewImportRows(rawRows = []) {
  const previewRows = [];
  const fullParsedData = [];
  const errors = [];
  const warnings = [];
  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    const mapped = mapImportRow(row);
    if (!mapped.displayName && !mapped.registryCode && !mapped.firstName && !mapped.lastName) continue;
    if (isExampleImportRow(mapped)) continue;
    if (!mapped.displayName) {
      errors.push({ row: index + 2, message: 'Display Name (or First/Last Name / Group Name) is required.' });
      continue;
    }
    await resolveImportRowLinks(mapped, row);
    const rowErrors = validateImportRow(mapped);
    rowErrors.forEach((message) => {
      if (message.includes('recommended')) {
        warnings.push({ row: index + 2, message });
      } else {
        errors.push({ row: index + 2, message });
      }
    });
    fullParsedData.push(mapped);
    if (previewRows.length < 25) previewRows.push(mapped);
  }
  return { previewRows, fullParsedData, totalRows: fullParsedData.length, errors, warnings };
}

function formatImportPreviewResponse(result) {
  const errorMessages = (result.errors || []).map((e) => `Row ${e.row}: ${e.message}`);
  const warningMessages = (result.warnings || []).map((w) => `Row ${w.row}: ${w.message}`);
  const parts = [`Review ${result.previewRows.length} of ${result.totalRows} rows.`];
  if (errorMessages.length) parts.push(`${errorMessages.length} error(s).`);
  if (warningMessages.length) parts.push(`${warningMessages.length} warning(s).`);
  return {
    message: `File parsed successfully. ${parts.join(' ')}`,
    previewData: result.previewRows,
    fullData: result.fullParsedData,
    details: {
      errors: errorMessages,
      warnings: warningMessages,
      errorCount: errorMessages.length,
      warningCount: warningMessages.length,
      totalRows: result.totalRows,
    },
  };
}

async function confirmImportRows(rows = [], userId = null) {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const result = await upsertBeneficiaryRecord(row, userId);
    if (result.updated) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated, total: inserted + updated };
}

async function countForProgramme(programmeId) {
  if (!(await tableExists())) return 0;
  const result = await pool.query(
    `
    SELECT COUNT(DISTINCT b.beneficiary_id)::int AS total
    FROM beneficiaries b
    WHERE COALESCE(b.voided, false) = false
      AND (
        b.rri_programme_id = $1
        OR b.project_id IN (
          SELECT rpp.project_id FROM rri_programme_projects rpp
          WHERE rpp.rri_programme_id = $1 AND COALESCE(rpp.voided, false) = false
        )
      )
    `,
    [programmeId]
  );
  return result.rows?.[0]?.total || 0;
}

async function countHeadsForProgramme(programmeId) {
  if (!(await tableExists())) return 0;
  const result = await pool.query(
    `
    SELECT COALESCE(SUM(
      CASE WHEN b.beneficiary_type IN ('group', 'household', 'institution')
        THEN GREATEST(COALESCE(b.member_count, 1), 1) ELSE 1 END
    ), 0)::int AS total
    FROM beneficiaries b
    WHERE COALESCE(b.voided, false) = false
      AND (
        b.rri_programme_id = $1
        OR b.project_id IN (
          SELECT rpp.project_id FROM rri_programme_projects rpp
          WHERE rpp.rri_programme_id = $1 AND COALESCE(rpp.voided, false) = false
        )
      )
    `,
    [programmeId]
  );
  return result.rows?.[0]?.total || 0;
}

async function getBeneficiaryById(beneficiaryId) {
  await ensureSchema();
  const result = await pool.query(
    `SELECT b.*, bt.label AS beneficiary_type_label
     FROM beneficiaries b
     LEFT JOIN beneficiary_types bt ON bt.type_code = b.beneficiary_type
     WHERE b.beneficiary_id = $1 AND COALESCE(b.voided, false) = false LIMIT 1`,
    [beneficiaryId]
  );
  return mapRow(result.rows?.[0]);
}

async function voidBeneficiary(beneficiaryId) {
  await ensureSchema();
  await pool.query(
    `UPDATE beneficiaries SET voided = true, updated_at = NOW() WHERE beneficiary_id = $1`,
    [beneficiaryId]
  );
  return { deleted: true };
}
async function listForProgramme(programmeId, limit = 50, offset = 0) {
  if (!(await tableExists())) return { rows: [], totalCount: 0, registryAvailable: false };
  const result = await pool.query(
    `
    SELECT b.*, bt.label AS beneficiary_type_label,
      CASE WHEN b.rri_programme_id = $1 THEN 'direct' ELSE 'project' END AS source
    FROM beneficiaries b
    LEFT JOIN beneficiary_types bt ON bt.type_code = b.beneficiary_type
    WHERE COALESCE(b.voided, false) = false
      AND (
        b.rri_programme_id = $1
        OR b.project_id IN (
          SELECT rpp.project_id FROM rri_programme_projects rpp
          WHERE rpp.rri_programme_id = $1 AND COALESCE(rpp.voided, false) = false
        )
      )
    ORDER BY b.display_name ASC
    LIMIT $2 OFFSET $3
    `,
    [programmeId, limit, offset]
  );
  const total = await countForProgramme(programmeId);
  return {
    rows: (result.rows || []).map((row) => ({ ...mapRow(row), source: row.source })),
    totalCount: total,
    registryAvailable: true,
  };
}

module.exports = {
  BENEFICIARY_TYPES,
  IMPORT_TEMPLATE_HEADERS,
  ensureSchema,
  tableExists,
  mapImportRow,
  mapRow,
  listBeneficiaries,
  getTypes,
  getFilterOptions,
  upsertBeneficiaryRecord,
  previewImportRows,
  formatImportPreviewResponse,
  confirmImportRows,
  countForProgramme,
  countHeadsForProgramme,
  listForProgramme,
  getBeneficiaryById,
  voidBeneficiary,
  validateImportRow,
};
