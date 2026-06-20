const ExcelJS = require('exceljs');
const pool = require('../config/db');

const MAX_DATA_ROWS = 500;
const DEFAULT_COUNTY = 'Machakos';

const GROUP_TYPES = [
  'SHG', 'CBO', 'Farmer Group', 'Youth Group', 'Women Group',
  'Cooperative', 'School', 'Health Facility', 'Market Group', 'Other',
];

const GENDERS = ['Male', 'Female', 'Other'];

const SECTOR_SAMPLES = [
  'Agriculture', 'Health', 'Education', 'Water', 'Roads & Infrastructure',
  'Trade', 'Environment', 'Social Protection', 'Youth & Sports',
];

const INSTRUCTIONS = [
  ['County Beneficiary Import Template'],
  [''],
  ['How to use'],
  ['1. Fill rows on the "Beneficiaries" sheet only. Do not rename sheets or column headers.'],
  ['2. Use dropdowns where provided — Beneficiary Type, Gender, Group Type, location, Project, RRI Programme.'],
  ['3. Sub-County and Ward cascade: pick Sub-County first, then Ward options update.'],
  ['4. Registry Code is optional — leave blank to auto-generate (IND-*, GRP-*, etc.).'],
  ['5. Required: Beneficiary Type + Display Name (or First/Last Name for individuals).'],
  ['6. Two sample rows (individual + group) are pre-filled — delete them before importing your data.'],
  ['7. For groups/households/institutions: set Member Count to the number of people reached.'],
  ['8. Link beneficiaries using Project and/or RRI Programme dropdown columns.'],
  [''],
  ['Type guidance'],
  ['individual — single person (use Gender, Age, ID Number)'],
  ['group — CBO, SHG, farmer group (use Group Type, Member Count, Lead Contact)'],
  ['household — household as one unit (optional Member Count = household size)'],
  ['institution — school, clinic, etc. (Member Count = pupils/patients/staff reached)'],
];

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

function colLetter(index) {
  let n = index;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function fetchGeoCatalog() {
  try {
    const subcounties = await pool.query(`
      SELECT DISTINCT COALESCE(subcounty, constituency) AS name
      FROM kenya_wards
      WHERE COALESCE(voided, false) = false
        AND county ILIKE $1
        AND COALESCE(subcounty, constituency, '') <> ''
      ORDER BY 1
    `, [DEFAULT_COUNTY]);
    const wards = await pool.query(`
      SELECT DISTINCT COALESCE(subcounty, constituency) AS subcounty,
             COALESCE(iebc_ward_name, ward) AS ward
      FROM kenya_wards
      WHERE COALESCE(voided, false) = false
        AND county ILIKE $1
        AND COALESCE(iebc_ward_name, ward, '') <> ''
      ORDER BY 1, 2
    `, [DEFAULT_COUNTY]);
    return {
      subcounties: (subcounties.rows || []).map((r) => r.name).filter(Boolean),
      wardsBySubcounty: (wards.rows || []).reduce((acc, row) => {
        const key = row.subcounty;
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        if (row.ward && !acc[key].includes(row.ward)) acc[key].push(row.ward);
        return acc;
      }, {}),
    };
  } catch {
    return { subcounties: [], wardsBySubcounty: {} };
  }
}

async function fetchProjectOptions(limit = 300) {
  try {
    const result = await pool.query(`
      SELECT project_id AS id, name
      FROM projects
      WHERE COALESCE(voided, false) = false
        AND NULLIF(trim(name), '') IS NOT NULL
      ORDER BY name ASC
      LIMIT $1
    `, [limit]);
    return (result.rows || []).map((r) => ({
      id: r.id,
      label: `${r.id} — ${String(r.name).trim()}`,
    }));
  } catch {
    return [];
  }
}

async function fetchRriProgrammeContext(programmeId) {
  const id = Number(programmeId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const result = await pool.query(
    `SELECT programme_id, name, sector, subcounty, ward
     FROM rri_programmes
     WHERE programme_id = $1 AND COALESCE(voided, false) = false
     LIMIT 1`,
    [id]
  );
  if (!result.rows.length) return null;
  const prog = result.rows[0];

  const sitesResult = await pool.query(
    `SELECT site_id, site_name, subcounty, ward
     FROM rri_programme_sites
     WHERE rri_programme_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sort_order ASC, site_id ASC`,
    [id]
  );

  const projectsResult = await pool.query(
    `SELECT p.project_id AS id, p.name
     FROM rri_programme_projects rpp
     JOIN projects p ON p.project_id = rpp.project_id
     WHERE rpp.rri_programme_id = $1
       AND COALESCE(rpp.voided, false) = false
       AND COALESCE(p.voided, false) = false
     ORDER BY p.name ASC`,
    [id]
  );

  return {
    programme: {
      id: prog.programme_id,
      label: `${prog.programme_id} — ${String(prog.name).trim()}`,
      name: String(prog.name).trim(),
      sector: prog.sector || '',
      subcounty: prog.subcounty || '',
      ward: prog.ward || '',
    },
    sites: (sitesResult.rows || []).map((site) => ({
      id: site.site_id,
      label: `${site.site_id} — ${String(site.site_name || '').trim()}`,
      siteName: String(site.site_name || '').trim(),
      subcounty: site.subcounty || '',
      ward: site.ward || '',
    })),
    linkedProjects: (projectsResult.rows || []).map((project) => ({
      id: project.id,
      label: `${project.id} — ${String(project.name).trim()}`,
    })),
  };
}

async function fetchRriProgrammeOptions(limit = 200) {
  try {
    const result = await pool.query(`
      SELECT programme_id AS id, name
      FROM rri_programmes
      WHERE COALESCE(voided, false) = false
      ORDER BY name ASC
      LIMIT $1
    `, [limit]);
    return (result.rows || []).map((r) => ({
      id: r.id,
      label: `${r.id} — ${String(r.name).trim()}`,
    }));
  } catch {
    return [];
  }
}

async function fetchSectors() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT name FROM sectors
      WHERE COALESCE(voided, false) = false AND NULLIF(trim(name), '') IS NOT NULL
      ORDER BY name
    `);
    const names = (result.rows || []).map((r) => r.name).filter(Boolean);
    return names.length ? names : SECTOR_SAMPLES;
  } catch {
    return SECTOR_SAMPLES;
  }
}

function styleHeaderRow(sheet, colCount) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (let c = 1; c <= colCount; c += 1) {
    sheet.getColumn(c).width = c === 3 ? 28 : c === 24 ? 32 : 16;
  }
}

function applySampleRows(sheet, { subcounties, geo, projects, rriProgrammes, sectors, programmeContext = null }) {
  const subcounty = programmeContext?.programme?.subcounty || subcounties[0] || 'Machakos';
  const ward = programmeContext?.programme?.ward || (geo.wardsBySubcounty[subcounty] || [])[0] || '';
  const project = programmeContext?.linkedProjects?.[0]?.label || projects[0]?.label || '';
  const rriProgramme = programmeContext?.programme?.label || rriProgrammes[0]?.label || '';
  const rriSiteId = programmeContext?.sites?.[0]?.label || '';
  const sector = programmeContext?.programme?.sector || sectors[0] || 'Agriculture';
  const deleteHint = programmeContext
    ? 'Sample row for this RRI programme — delete before import.'
    : 'Sample individual row — delete before import.';

  const samples = [
    {
      beneficiaryType: 'individual',
      registryCode: '',
      displayName: programmeContext
        ? 'Jane Wambua (example — delete before import)'
        : 'Jane Wambua (example — delete before import)',
      firstName: 'Jane',
      lastName: 'Wambua',
      gender: 'Female',
      age: 34,
      idNumber: '12345678',
      phone: '0712345678',
      email: 'jane.wambua@example.com',
      groupType: '',
      memberCount: '',
      leadContactName: '',
      leadContactPhone: '',
      county: DEFAULT_COUNTY,
      subcounty,
      ward,
      village: programmeContext?.sites?.[0]?.siteName || 'Kathome',
      project,
      rriProgramme,
      rriSiteId,
      sector,
      enrollmentDate: '2025-01-15',
      notes: deleteHint,
    },
    {
      beneficiaryType: 'group',
      registryCode: '',
      displayName: programmeContext
        ? 'Kalama Sample CBO (example — delete before import)'
        : 'Mumbuni Women SHG (example — delete before import)',
      firstName: '',
      lastName: '',
      gender: '',
      age: '',
      idNumber: '',
      phone: '0722112233',
      email: 'sample.group@example.com',
      groupType: 'CBO',
      memberCount: 42,
      leadContactName: 'Mary Kamau',
      leadContactPhone: '0733445566',
      county: DEFAULT_COUNTY,
      subcounty,
      ward,
      village: programmeContext?.sites?.[1]?.siteName || programmeContext?.sites?.[0]?.siteName || 'Mumbuni',
      project: programmeContext?.linkedProjects?.[1]?.label || project,
      rriProgramme,
      rriSiteId: programmeContext?.sites?.[1]?.label || rriSiteId,
      sector,
      enrollmentDate: '2025-02-01',
      notes: programmeContext
        ? 'Sample group row for this RRI programme — delete before import.'
        : 'Sample group row — delete before import.',
    },
  ];

  const fields = [
    'beneficiaryType', 'registryCode', 'displayName', 'firstName', 'lastName', 'gender', 'age',
    'idNumber', 'phone', 'email', 'groupType', 'memberCount', 'leadContactName', 'leadContactPhone',
    'county', 'subcounty', 'ward', 'village', 'project', 'rriProgramme', 'rriSiteId', 'sector',
    'enrollmentDate', 'notes',
  ];

  samples.forEach((sample, index) => {
    const rowNum = index + 2;
    fields.forEach((field, colIndex) => {
      const value = sample[field];
      if (value !== '' && value != null) {
        sheet.getCell(rowNum, colIndex + 1).value = value;
      }
    });
    const row = sheet.getRow(rowNum);
    row.font = { italic: true, color: { argb: 'FF666666' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
  });
}

async function buildBeneficiaryImportWorkbook(options = {}) {
  const { rriProgrammeId = null } = options;
  const programmeContext = rriProgrammeId ? await fetchRriProgrammeContext(rriProgrammeId) : null;
  if (rriProgrammeId && !programmeContext) {
    throw new Error('RRI programme not found.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Machakos M&E';
  workbook.created = new Date();

  const [geo, allProjects, allRriProgrammes, sectors, typesResult] = await Promise.all([
    fetchGeoCatalog(),
    fetchProjectOptions(),
    fetchRriProgrammeOptions(),
    fetchSectors(),
    pool.query(`SELECT type_code, label FROM beneficiary_types WHERE is_active = true ORDER BY sort_order`).catch(() => ({ rows: [] })),
  ]);

  const rriProgrammes = programmeContext
    ? [{ id: programmeContext.programme.id, label: programmeContext.programme.label }]
    : allRriProgrammes;
  const projects = programmeContext?.linkedProjects?.length
    ? programmeContext.linkedProjects
    : allProjects;

  const beneficiaryTypes = (typesResult.rows || []).length
    ? typesResult.rows.map((r) => r.type_code)
    : ['individual', 'group', 'household', 'institution'];

  const instructionRows = programmeContext
    ? [
      [`Beneficiary Import Template — ${programmeContext.programme.name}`],
      [''],
      ['This workbook is pre-configured for this RRI programme.'],
      ['RRI Programme is fixed to this programme. Use RRI Site ID for coverage locations where applicable.'],
      ['Project column lists registry projects linked to this programme (if any).'],
      [''],
      ...INSTRUCTIONS.slice(2),
    ]
    : INSTRUCTIONS;

  const instructions = workbook.addWorksheet('Instructions');
  instructionRows.forEach((row, i) => {
    instructions.getCell(i + 1, 1).value = row[0] || '';
  });
  instructions.getColumn(1).width = 100;
  instructions.getCell(1, 1).font = { bold: true, size: 14 };

  const reference = workbook.addWorksheet('Reference Lists');
  reference.state = 'hidden';
  reference.getCell('A1').value = 'Beneficiary Types';
  reference.getCell('B1').value = 'Genders';
  reference.getCell('C1').value = 'Group Types';
  reference.getCell('D1').value = 'Sectors';
  reference.getCell('E1').value = 'Counties';
  beneficiaryTypes.forEach((v, i) => { reference.getCell(i + 2, 1).value = v; });
  GENDERS.forEach((v, i) => { reference.getCell(i + 2, 2).value = v; });
  GROUP_TYPES.forEach((v, i) => { reference.getCell(i + 2, 3).value = v; });
  sectors.forEach((v, i) => { reference.getCell(i + 2, 4).value = v; });
  reference.getCell('E2').value = DEFAULT_COUNTY;

  const geoLists = workbook.addWorksheet('Geo Lists');
  geoLists.state = 'hidden';
  const subcounties = geo.subcounties.length ? geo.subcounties : ['Mavoko', 'Machakos', 'Mwala', 'Yatta', 'Kangundo', 'Matungulu', 'Kathiani', 'Masinga'];
  geoLists.getCell('A1').value = 'Sub-Counties';
  subcounties.forEach((name, i) => { geoLists.getCell(i + 2, 1).value = name; });
  const subcountyEnd = Math.max(subcounties.length + 1, 2);
  workbook.definedNames.add(`'Geo Lists'!$A$2:$A$${subcountyEnd}`, 'BenSubcounties');

  const geoLookup = workbook.addWorksheet('Geo Lookup');
  geoLookup.state = 'hidden';
  geoLookup.getCell('A1').value = 'Sub-County';
  geoLookup.getCell('B1').value = 'WardRangeName';
  let geoCol = 2;
  subcounties.forEach((subcounty, index) => {
    const wards = geo.wardsBySubcounty[subcounty] || [];
    const rangeName = `BEN_WARD_${index + 1}`;
    geoLists.getCell(1, geoCol).value = `Wards - ${subcounty}`;
    wards.forEach((ward, wi) => { geoLists.getCell(wi + 2, geoCol).value = ward; });
    const endRow = Math.max(wards.length + 1, 2);
    const letter = geoLists.getColumn(geoCol).letter;
    workbook.definedNames.add(`'Geo Lists'!$${letter}$2:$${letter}$${endRow}`, rangeName);
    geoLookup.getCell(index + 2, 1).value = subcounty;
    geoLookup.getCell(index + 2, 2).value = rangeName;
    geoCol += 1;
  });

  const projectSheet = workbook.addWorksheet('Projects');
  projectSheet.state = 'hidden';
  projectSheet.getCell('A1').value = 'Project';
  projects.forEach((p, i) => { projectSheet.getCell(i + 2, 1).value = p.label; });
  const projectEnd = Math.max(projects.length + 1, 2);

  const rriSheet = workbook.addWorksheet('RRI Programmes');
  rriSheet.state = 'hidden';
  rriSheet.getCell('A1').value = 'RRI Programme';
  rriProgrammes.forEach((p, i) => { rriSheet.getCell(i + 2, 1).value = p.label; });
  const rriEnd = Math.max(rriProgrammes.length + 1, 2);

  let rriSiteRange = null;
  if (programmeContext?.sites?.length) {
    const siteSheet = workbook.addWorksheet('RRI Sites');
    siteSheet.state = 'hidden';
    siteSheet.getCell('A1').value = 'RRI Site';
    programmeContext.sites.forEach((site, i) => { siteSheet.getCell(i + 2, 1).value = site.label; });
    const siteEnd = Math.max(programmeContext.sites.length + 1, 2);
    rriSiteRange = `'RRI Sites'!$A$2:$A$${siteEnd}`;
  }

  const sheet = workbook.addWorksheet('Beneficiaries');
  HEADERS.forEach((header, i) => { sheet.getCell(1, i + 1).value = header; });
  styleHeaderRow(sheet, HEADERS.length);

  applySampleRows(sheet, { subcounties, geo, projects, rriProgrammes, sectors, programmeContext });
  sheet.state = 'visible';
  workbook.views = [{ activeTab: workbook.worksheets.indexOf(sheet), firstSheet: workbook.worksheets.indexOf(sheet) }];

  // Hidden helper for ward cascade (column Y = 25)
  sheet.getColumn('Y').hidden = true;
  sheet.getCell('Y1').value = 'Ward Range Helper';
  for (let row = 2; row <= MAX_DATA_ROWS; row += 1) {
    sheet.getCell(`Y${row}`).value = { formula: `IFERROR(VLOOKUP($P${row},'Geo Lookup'!$A:$B,2,FALSE),"")` };
  }

  const typeRange = `'Reference Lists'!$A$2:$A$${Math.max(beneficiaryTypes.length + 1, 2)}`;
  const genderRange = `'Reference Lists'!$B$2:$B$${GENDERS.length + 1}`;
  const groupTypeRange = `'Reference Lists'!$C$2:$C$${GROUP_TYPES.length + 1}`;
  const sectorRange = `'Reference Lists'!$D$2:$D$${Math.max(sectors.length + 1, 2)}`;
  const countyRange = `'Reference Lists'!$E$2:$E$2`;
  const projectRange = `'Projects'!$A$2:$A$${projectEnd}`;
  const rriRange = `'RRI Programmes'!$A$2:$A$${rriEnd}`;

  const validations = {
    A: { type: 'list', allowBlank: false, formulae: [typeRange], showErrorMessage: true, errorTitle: 'Invalid type', error: 'Select individual, group, household, or institution.' },
    F: { type: 'list', allowBlank: true, formulae: [genderRange] },
    G: { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 120], showErrorMessage: true, errorTitle: 'Invalid age', error: 'Age must be between 0 and 120.' },
    K: { type: 'list', allowBlank: true, formulae: [groupTypeRange] },
    L: { type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [1], showErrorMessage: true, errorTitle: 'Invalid member count', error: 'Member count must be at least 1.' },
    O: { type: 'list', allowBlank: true, formulae: [countyRange] },
    P: { type: 'list', allowBlank: true, formulae: ['BenSubcounties'] },
    Q: { type: 'list', allowBlank: true, formulae: ['INDIRECT($Y2)'] },
    S: { type: 'list', allowBlank: true, formulae: [projectRange] },
    T: { type: 'list', allowBlank: true, formulae: [rriRange] },
    V: { type: 'list', allowBlank: true, formulae: [sectorRange] },
  };
  if (rriSiteRange) {
    validations.U = { type: 'list', allowBlank: true, formulae: [rriSiteRange] };
  }

  for (let row = 2; row <= MAX_DATA_ROWS; row += 1) {
    Object.entries(validations).forEach(([col, validation]) => {
      const cell = sheet.getCell(`${col}${row}`);
      if (col === 'Q') {
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [`INDIRECT($Y${row})`] };
        return;
      }
      cell.dataValidation = { ...validation };
    });
  }

  return workbook;
}

module.exports = {
  buildBeneficiaryImportWorkbook,
  HEADERS,
};
