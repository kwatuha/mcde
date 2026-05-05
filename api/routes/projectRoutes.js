const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../config/db'); // Import the database connection pool
const { recordAudit, AUDIT_ACTIONS } = require('../services/auditTrailService');
const orgScope = require('../services/organizationScopeService');
const multer = require('multer');
const xlsx = require('xlsx');
const { addStatusFilter } = require('../utils/statusFilterHelper');
const privilege = require('../middleware/privilegeMiddleware');
const { isSuperAdminRequester } = require('../utils/roleUtils');

const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.actualUserId ?? null;

// --- Consolidated Imports for All Sub-Routers ---
const appointmentScheduleRoutes = require('./appointmentScheduleRoutes');
const projectAttachmentRoutes = require('./projectAttachmentRoutes');
const projectCertificateRoutes = require('./projectCertificateRoutes');
const projectFeedbackRoutes = require('./projectFeedbackRoutes');
const projectMapRoutes = require('./projectMapRoutes');
const projectMonitoringRoutes = require('./projectMonitoringRoutes');
const projectObservationRoutes = require('./projectObservationRoutes');
const projectPaymentRoutes = require('./projectPaymentRoutes');
const projectSchedulingRoutes = require('./projectSchedulingRoutes');
const projectCategoryRoutes = require('./metadata/projectCategoryRoutes');
const projectWarningRoutes = require('./projectWarningRoutes');
const projectProposalRatingRoutes = require('./projectProposalRatingRoutes');
const { projectRouter: projectPhotoRouter, photoRouter } = require('./projectPhotoRoutes'); 
const projectAssignmentRoutes = require('./projectAssignmentRoutes');
const projectJobsRoutes = require('./projectJobsRoutes');
const projectBqRoutes = require('./projectBqRoutes');
const projectTaxRateRoutes = require('./projectTaxRateRoutes');

const PROJECT_IMPORT_LOG_DIR = path.join(__dirname, '..', 'uploads', 'project-import-logs');

const ensureProjectImportLogTable = async () => {
    const runSafeDdl = async (sql) => {
        try {
            await pool.query(sql);
        } catch (err) {
            // Ignore race-condition duplicates when concurrent requests initialize the same DDL.
            // PostgreSQL can surface these as duplicate_table / duplicate_object / unique violations.
            const code = String(err?.code || '');
            // Also ignore insufficient-privilege errors: app user may be read/write only,
            // while schema DDL is handled through DBA migrations.
            if (code === '42P07' || code === '42710' || code === '23505' || code === '42501') {
                return;
            }
            throw err;
        }
    };

    await runSafeDdl(`
        CREATE TABLE IF NOT EXISTS project_import_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NULL,
            full_name TEXT NULL,
            role_name TEXT NULL,
            ministry TEXT NULL,
            state_department TEXT NULL,
            uploaded_file_name TEXT NULL,
            saved_file_path TEXT NULL,
            had_mapping_errors BOOLEAN NOT NULL DEFAULT FALSE,
            rows_inserted INTEGER NOT NULL DEFAULT 0,
            rows_updated INTEGER NOT NULL DEFAULT 0,
            rows_processed INTEGER NOT NULL DEFAULT 0,
            import_status TEXT NOT NULL DEFAULT 'success',
            import_message TEXT NULL,
            metadata_json JSONB NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_import_logs_created_at ON project_import_logs (created_at DESC)`);
    await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_import_logs_user_id ON project_import_logs (user_id)`);
    await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_import_logs_mapping_errors ON project_import_logs (had_mapping_errors)`);
    await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_import_logs_status ON project_import_logs (import_status)`);
};

const hasProjectImportLogAccess = (req) => {
    const roleRaw = req?.user?.roleName || req?.user?.role || '';
    const role = String(roleRaw).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const privileges = Array.isArray(req?.user?.privileges) ? req.user.privileges : [];
    const hasPrivilegeBypass =
        privileges.includes('admin.access') || privileges.includes('organization.scope_bypass');
    const roleAllowed =
        role === 'mda_ict_admin' ||
        role === 'super_admin' ||
        role === 'admin' ||
        role === 'administrator' ||
        role === 'ict_admin';
    return roleAllowed || hasPrivilegeBypass || privilege.isAdminLike(req?.user) || isSuperAdminRequester(req?.user);
};

const parseUploadedWorkbookCopy = (importContext = {}) => {
    const base64Payload = importContext?.importFileBase64;
    const originalName = importContext?.originalFileName || `projects-import-${Date.now()}.xlsx`;
    if (!base64Payload || typeof base64Payload !== 'string') return null;

    const cleanBase64 = base64Payload.includes(',') ? base64Payload.split(',').pop() : base64Payload;
    const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.mkdirSync(PROJECT_IMPORT_LOG_DIR, { recursive: true });
    const savedName = `${Date.now()}-${safeName}`;
    const savedPath = path.join(PROJECT_IMPORT_LOG_DIR, savedName);
    fs.writeFileSync(savedPath, Buffer.from(cleanBase64, 'base64'));
    return { originalName, savedPath };
};

const deriveHadMappingErrors = (importContext = {}, summary = {}) => {
    if (importContext?.hadMappingErrors === true) return true;
    const mappingSummary = importContext?.mappingSummary || {};
    const unmatchedCount = [
        mappingSummary?.budgets?.unmatched?.length || 0,
        mappingSummary?.departments?.unmatched?.length || 0,
        mappingSummary?.subcounties?.unmatched?.length || 0,
        mappingSummary?.wards?.unmatched?.length || 0,
        mappingSummary?.financialYears?.unmatched?.length || 0,
        mappingSummary?.counties?.unmatched?.length || 0,
        mappingSummary?.constituencies?.unmatched?.length || 0,
        mappingSummary?.kenyaWards?.unmatched?.length || 0,
        mappingSummary?.implementingAgencies?.unmatched?.length || 0,
        mappingSummary?.sectors?.unmatched?.length || 0,
        mappingSummary?.ministries?.unmatched?.length || 0,
        mappingSummary?.stateDepartments?.unmatched?.length || 0,
        summary?.errors?.length || 0
    ].reduce((a, b) => a + b, 0);
    return unmatchedCount > 0;
};

const recordProjectImportLog = async ({
    req,
    importContext = {},
    summary = {},
    rowsProcessed = 0,
    status = 'success',
    message = null,
}) => {
    try {
        await ensureProjectImportLogTable();
        const workbookCopy = parseUploadedWorkbookCopy(importContext);
        const user = req?.user || {};
        const fullName = (
            [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
            user.fullName ||
            user.name ||
            user.username ||
            null
        );
        const roleName = user.roleName || user.role || null;
        const ministry = user.ministry || user.departmentName || user.department || null;
        const stateDepartment = user.stateDepartment || user.sectionName || user.directorate || null;
        const rowsInserted = Number(summary?.projectsCreated || 0);
        const rowsUpdated = Number(summary?.projectsUpdated || 0);
        const hadMappingErrors = deriveHadMappingErrors(importContext, summary);

        await pool.query(
            `INSERT INTO project_import_logs (
                user_id, full_name, role_name, ministry, state_department,
                uploaded_file_name, saved_file_path, had_mapping_errors,
                rows_inserted, rows_updated, rows_processed, import_status, import_message, metadata_json
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
            )`,
            [
                user.id || user.userId || null,
                fullName,
                roleName,
                ministry,
                stateDepartment,
                workbookCopy?.originalName || importContext?.originalFileName || null,
                workbookCopy?.savedPath || null,
                hadMappingErrors,
                rowsInserted,
                rowsUpdated,
                Number(rowsProcessed || 0),
                status,
                message,
                JSON.stringify({
                    importContext: importContext || null,
                    summary: summary || null,
                }),
            ]
        );
    } catch (logErr) {
        console.error('Failed to record project import log:', logErr.message);
    }
};


// Base SQL query for project details with all left joins
const BASE_PROJECT_SELECT_JOINS = `
    SELECT
        p.id,
        p.projectName,
        p.projectDescription,
        p.directorate,
        p.startDate,
        p.endDate,
        p.costOfProject,
        p.paidOut,
        p.objective,
        p.expectedOutput,
        p.principalInvestigator,
        p.expectedOutcome,
        p.status,
        p.statusReason,
        p.ProjectRefNum,
        p.Contracted,
        p.createdAt,
        p.updatedAt,
        p.voided,
        p.principalInvestigatorStaffId,
        s.firstName AS piFirstName,
        s.lastName AS piLastName,
        s.email AS piEmail,
        p.departmentId,
        cd.name AS departmentName,
        cd.alias AS departmentAlias,
        p.sectionId,
        ds.name AS sectionName,
        p.finYearId,
        fy.finYearName AS financialYearName,
        p.programId,
        pr.programme AS programName,
        p.subProgramId,
        spr.subProgramme AS subProgramName,
        p.categoryId,
        projCat.categoryName,
        p.userId AS creatorUserId,
        u.firstName AS creatorFirstName,
        u.lastName AS creatorLastName,
        p.approved_for_public,
        p.approved_by,
        p.approved_at,
        p.approval_notes,
        p.revision_requested,
        p.revision_notes,
        p.revision_requested_by,
        p.revision_requested_at,
        p.revision_submitted_at,
        p.overallProgress,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS countyNames,
        GROUP_CONCAT(DISTINCT sc.name ORDER BY sc.name SEPARATOR ', ') AS subcountyNames,
        GROUP_CONCAT(DISTINCT w.name ORDER BY w.name SEPARATOR ', ') AS wardNames
    FROM
        kemri_projects p
    LEFT JOIN
        kemri_staff s ON p.principalInvestigatorStaffId = s.staffId
    LEFT JOIN
        kemri_departments cd ON p.departmentId = cd.departmentId AND (cd.voided IS NULL OR cd.voided = 0)
    LEFT JOIN
        kemri_sections ds ON p.sectionId = ds.sectionId AND (ds.voided IS NULL OR ds.voided = 0)
    LEFT JOIN
        kemri_financialyears fy ON p.finYearId = fy.finYearId AND (fy.voided IS NULL OR fy.voided = 0)
    LEFT JOIN
        kemri_programs pr ON p.programId = pr.programId
    LEFT JOIN
        kemri_subprograms spr ON p.subProgramId = spr.subProgramId
    LEFT JOIN
        kemri_project_counties pc ON p.id = pc.projectId AND (pc.voided IS NULL OR pc.voided = 0)
    LEFT JOIN
        kemri_counties c ON pc.countyId = c.countyId
    LEFT JOIN
        kemri_project_subcounties psc ON p.id = psc.projectId AND (psc.voided IS NULL OR psc.voided = 0)
    LEFT JOIN
        kemri_subcounties sc ON psc.subcountyId = sc.subcountyId AND (sc.voided IS NULL OR sc.voided = 0)
    LEFT JOIN
        kemri_project_wards pw ON p.id = pw.projectId AND (pw.voided IS NULL OR pw.voided = 0)
    LEFT JOIN
        kemri_wards w ON pw.wardId = w.wardId AND (w.voided IS NULL OR w.voided = 0)
    LEFT JOIN
        kemri_project_milestone_implementations projCat ON p.categoryId = projCat.categoryId
    LEFT JOIN
        kemri_users u ON p.userId = u.userId
`;

// Corrected full query for fetching a single project by ID
// For PostgreSQL, use the new JSONB structure; for MySQL, use the old structure
const GET_SINGLE_PROJECT_QUERY = (DB_TYPE) => {
    if (DB_TYPE === 'postgresql') {
        // Use the same query structure as GET /api/projects/ but with WHERE clause
        return `
            SELECT
                p.project_id AS id,
                p.name AS "projectName",
                p.description AS "projectDescription",
                p.implementing_agency AS "directorate",
                (p.timeline->>'start_date')::date AS "startDate",
                (p.timeline->>'expected_completion_date')::date AS "endDate",
                (p.budget->>'allocated_amount_kes')::numeric AS "costOfProject",
                (p.budget->>'disbursed_amount_kes')::numeric AS "paidOut",
                p.budget->>'source' AS "budgetSource",
                p.notes->>'objective' AS "objective",
                p.notes->>'expected_output' AS "expectedOutput",
                NULL AS "principalInvestigator",
                p.notes->>'expected_outcome' AS "expectedOutcome",
                p.progress->>'status' AS "status",
                p.progress->>'status_reason' AS "statusReason",
                p.progress->>'latest_update_summary' AS "progressSummary",
                p.data_sources->>'project_ref_num' AS "ProjectRefNum",
                (p.budget->>'contracted')::boolean AS "Contracted",
                p.created_at AS "createdAt",
                p.updated_at AS "updatedAt",
                p.voided,
                NULL AS "principalInvestigatorStaffId",
                NULL AS "piFirstName",
                NULL AS "piLastName",
                NULL AS "piEmail",
                NULL AS "departmentId",
                p.ministry AS "departmentName",
                p.ministry AS "ministry",
                NULL AS "departmentAlias",
                NULL AS "sectionId",
                p.state_department AS "sectionName",
                p.state_department AS "stateDepartment",
                NULL AS "finYearId",
                NULL AS "financialYearName",
                (p.notes->>'program_id')::integer AS "programId",
                NULL AS "programName",
                (p.notes->>'subprogram_id')::integer AS "subProgramId",
                NULL AS "subProgramName",
                p.category_id AS "categoryId",
                p.sector AS "categoryName",
                p.sector AS "sector",
                (p.data_sources->>'created_by_user_id')::integer AS "userId",
                NULL AS "creatorFirstName",
                NULL AS "creatorLastName",
                (p.is_public->>'approved')::boolean AS "approved_for_public",
                (p.is_public->>'approved_by')::integer AS "approved_by",
                (p.is_public->>'approved_at')::timestamp AS "approved_at",
                p.is_public->>'approval_notes' AS "approval_notes",
                (p.is_public->>'revision_requested')::boolean AS "revision_requested",
                p.is_public->>'revision_notes' AS "revision_notes",
                (p.is_public->>'revision_requested_by')::integer AS "revision_requested_by",
                (p.is_public->>'revision_requested_at')::timestamp AS "revision_requested_at",
                (p.is_public->>'revision_submitted_at')::timestamp AS "revision_submitted_at",
                (p.progress->>'percentage_complete')::numeric AS "overallProgress",
                (p.budget->>'budget_id')::integer AS "budgetId",
                p.location->>'county' AS "county",
                p.location->>'constituency' AS "constituency",
                p.location->>'ward' AS "ward",
                (p.location->'geocoordinates'->>'lat')::numeric AS "latitude",
                (p.location->'geocoordinates'->>'lng')::numeric AS "longitude",
                (p.public_engagement->>'feedback_enabled')::boolean AS "feedbackEnabled",
                (p.public_engagement->>'complaints_received')::integer AS "complaintsReceived",
                p.public_engagement->>'common_feedback' AS "commonFeedback",
                p.data_sources AS "dataSources",
                (p.timeline->>'financial_year') AS "financialYear",
                p.implementing_agency AS "implementingAgency",
                p.location->>'county' AS "countyNames",
                p.location->>'constituency' AS "subcountyNames",
                p.location->>'ward' AS "wardNames"
            FROM projects p
            WHERE p.project_id = $1 AND p.voided = false
        `;
    } else {
        return `
            ${BASE_PROJECT_SELECT_JOINS}
            WHERE p.id = ? AND p.voided = 0
            GROUP BY p.id;
        `;
    }
};

// --- Validation Middleware ---
const validateProject = (req, res, next) => {
    const { projectName, name } = req.body;
    // Accept either projectName (frontend) or name (API)
    const projectNameValue = projectName || name;
    // Only enforce required project name on CREATE.
    // Updates may legitimately patch only a subset of fields (e.g. progressSummary / overallProgress).
    if (req.method === 'POST') {
        if (!projectNameValue || !projectNameValue.trim()) {
            return res.status(400).json({ message: 'Missing required field: projectName or name' });
        }
        // Normalize to projectName for consistency
        if (name && !projectName) {
            req.body.projectName = name;
        }
    } else if (req.method === 'PUT') {
        // Normalize if provided, but don't require
        if (name && !projectName) {
            req.body.projectName = name;
        }
    }
    next();
};

// Utility function to check if project exists
const checkProjectExists = async (projectId) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const tableName = DB_TYPE === 'postgresql' ? 'projects' : 'kemri_projects';
    const idColumn = DB_TYPE === 'postgresql' ? 'project_id' : 'id';
    const voidedCondition = DB_TYPE === 'postgresql' ? 'voided = false' : 'voided = 0';
    const query = `SELECT ${idColumn} FROM ${tableName} WHERE ${idColumn} = ? AND ${voidedCondition}`;
    const result = await pool.execute(query, [projectId]);
    const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
    return Array.isArray(rows) ? rows.length > 0 : (rows && rows.length > 0);
};

// Helper function to extract all coordinates from a GeoJSON geometry object
const extractCoordinates = (geometry) => {
    if (!geometry) return [];
    if (geometry.type === 'Point') return [geometry.coordinates];
    if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') return geometry.coordinates;
    if (geometry.type === 'Polygon') return geometry.coordinates[0];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(Infinity);
    return [];
};


// --- CRUD Operations for Projects (kemri_projects) ---

// Define junction table routers
const projectCountiesRouter = express.Router({ mergeParams: true });
const projectSubcountiesRouter = express.Router({ mergeParams: true });
const projectWardsRouter = express.Router({ mergeParams: true });

// Mount other route files
router.use('/appointmentschedules', appointmentScheduleRoutes);
router.use('/project_attachments', projectAttachmentRoutes);
router.use('/project_certificates', projectCertificateRoutes);
router.use('/project_feedback', projectFeedbackRoutes);
router.use('/project_maps', projectMapRoutes);
router.use('/project_observations', projectObservationRoutes);
router.use('/project_payments', projectPaymentRoutes);
router.use('/projectscheduling', projectSchedulingRoutes);
router.use('/projectcategories', projectCategoryRoutes);
router.use('/tax-rates', projectTaxRateRoutes);
router.use('/:projectId/monitoring', projectMonitoringRoutes);
router.use('/:projectId', projectJobsRoutes);
router.use('/:projectId/bq', projectBqRoutes);


// Mount junction table routers
router.use('/:projectId/counties', projectCountiesRouter);
router.use('/:projectId/subcounties', projectSubcountiesRouter);
router.use('/:projectId/wards', projectWardsRouter);
router.use('/:projectId/photos', projectPhotoRouter);

// --- Project Import Endpoints (MUST come before parameterized routes) ---
// Multer storage for temp uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Header normalization and mapping for Projects
const normalizeHeader = (header) => String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const projectHeaderMap = {
    // Canonical -> Variants (normalized)
    projectName: ['projectname', 'name', 'title', 'project', 'project_name', 'project name'],
    ProjectDescription: ['projectdescription', 'description', 'details', 'projectdesc'],
    Status: ['status', 'projectstatus', 'currentstatus', 'status ongoing complete stalled dropped', 'statusongoingcompletestalleddropped'],
    budget: ['budget', 'estimatedcost', 'budgetkes', 'projectcost', 'costofproject', 'allocated amount kes', 'allocatedamountkes', 'allocated amount', 'allocated amount kes'],
    amountPaid: ['amountpaid', 'disbursed', 'expenditure', 'paidout', 'amount paid'],
    Disbursed: ['disbursed', 'amountdisbursed', 'disbursedamount', 'amountpaid', 'paidout', 'amount paid', 'expenditure', 'disbursed amount kes', 'disbursedamountkes', 'disbursed amount', 'disbursed amount kes'],
    financialYear: ['financialyear', 'financial-year', 'financial year', 'fy', 'adp', 'year'],
    department: ['department', 'implementingdepartment'],
    directorate: ['directorate'],
    sector: ['sector', 'sectorname', 'category', 'categoryname'],
    implementing_agency: ['implementingagency', 'implementing agency', 'agency', 'implementingagencyname', 'agency name'],
    ministry: ['ministry', 'ministryname', 'ministry name'],
    state_department: ['statedepartment', 'state department', 'state_department', 'state department name', 'statedepartmentname'],
    County: ['county', 'countyname', 'county name'],
    Constituency: ['constituency', 'constituencyname', 'constituency name'],
    'sub-county': ['subcounty', 'subcountyname', 'subcountyid', 'sub-county', 'subcounty_', 'sub county'],
    ward: ['ward', 'wardname', 'wardid', 'ward name'],
    Contracted: ['contracted', 'contractamount', 'contractedamount', 'contractsum', 'contract value', 'contract value (kes)'],
    StartDate: ['startdate', 'projectstartdate', 'commencementdate', 'start', 'start date', 'start date yyyymmdd', 'startdateyyyymmdd'],
    EndDate: ['enddate', 'projectenddate', 'completiondate', 'end', 'end date', 'expected completion date yyyymmdd', 'expectedcompletiondate', 'expectedcompletiondateyyyymmdd'],
    // New columns from projects_upload_template.xlsx - include exact header names
    Latitude: ['latitude', 'lat', 'geolat', 'geocoordinateslat'],
    Longitude: ['longitude', 'lng', 'lon', 'geolng', 'geocoordinateslng'],
    BudgetSource: ['budgetsource', 'budget source', 'fundingsource', 'funding source', 'source'],
    LastUpdated: ['lastupdated', 'last updated', 'last updated yyyymmdd', 'updatedat', 'updated at', 'lastupdatedyyyymmdd'],
    PercentageComplete: ['percentagecomplete', 'percentage complete', 'progress', 'completionpercentage', 'completion percentage', 'percentage complete 0100', 'percentagecomplete0100'],
    LatestUpdateSummary: ['latestupdatesummary', 'latest update summary', 'updatesummary', 'update summary', 'progresssummary', 'progress summary'],
    FeedbackEnabled: ['feedbackenabled', 'feedback enabled', 'feedbackenabled truefalse', 'allowfeedback', 'allow feedback', 'feedbackenabledtruefalse'],
    ComplaintsReceived: ['complaintsreceived', 'complaints received', 'complaintsreceived number', 'complaints', 'numberofcomplaints', 'complaintsreceivednumber'],
    CommonFeedback: ['commonfeedback', 'common feedback', 'feedback', 'publicfeedback', 'public feedback'],
    DataSources: ['datasources', 'data sources', 'data sources json array or leave empty', 'sources', 'datasource', 'datasourcesjsonarrayorleaveempty']
};

// Reverse lookup: normalized variant -> canonical
const variantToCanonical = (() => {
    const map = {};
    Object.entries(projectHeaderMap).forEach(([canonical, variants]) => {
        variants.forEach(v => { map[v] = canonical; });
    });
    return map;
})();

// Helper function to validate and fix invalid dates
// Returns: { year, month, day, corrected, originalDay }
const validateAndFixDate = (year, month, day) => {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // Check for leap year (February can have 29 days)
    if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0))) {
        daysInMonth[1] = 29;
    }
    
    const maxDays = daysInMonth[month - 1];
    const originalDay = day;
    if (day > maxDays) {
        // Fix invalid dates: e.g., June 31 -> June 30, February 30 -> February 28/29
        const fixedDay = maxDays;
        console.warn(`Fixed invalid date: ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} -> ${year}-${String(month).padStart(2, '0')}-${String(fixedDay).padStart(2, '0')}`);
        return { year, month, day: fixedDay, corrected: true, originalDay };
    }
    
    return { year, month, day, corrected: false, originalDay };
};

// Enhanced parseDateToYMD that tracks corrections
// Returns: { date: string, corrected: boolean, originalValue: string, correctionMessage: string } or null
const parseDateToYMD = (value, trackCorrections = false) => {
    if (!value) return trackCorrections ? null : null;
    const originalValue = String(value);
    
    if (value instanceof Date && !isNaN(value.getTime())) {
        const yyyy = value.getFullYear();
        const mm = value.getMonth() + 1;
        const dd = value.getDate();
        const fixed = validateAndFixDate(yyyy, mm, dd);
        const dateStr = `${fixed.year}-${String(fixed.month).padStart(2, '0')}-${String(fixed.day).padStart(2, '0')}`;
        
        if (trackCorrections && fixed.corrected) {
            return {
                date: dateStr,
                corrected: true,
                originalValue: originalValue,
                correctionMessage: `Date corrected from ${yyyy}-${String(mm).padStart(2, '0')}-${String(fixed.originalDay).padStart(2, '0')} to ${dateStr} (invalid day for month)`
            };
        }
        return trackCorrections ? { date: dateStr, corrected: false, originalValue: originalValue } : dateStr;
    }
    if (typeof value !== 'string') return trackCorrections ? value : value;
    const s = value.trim();
    
    // Fix common typos in month names (e.g., "0ct" -> "Oct", "0CT" -> "OCT")
    let normalized = s.replace(/\b0ct\b/gi, 'Oct').replace(/\b0ctober\b/gi, 'October');
    
    // Try to parse as text date (e.g., "6 Oct 2025", "6 October 2025", "Oct 6, 2025")
    const monthNames = {
        'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
        'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
        'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
        'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
    };
    
    // Pattern: DD Month YYYY or Month DD, YYYY or DD-Month-YYYY
    let m = normalized.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/i);
    if (m) {
        const day = parseInt(m[1], 10);
        const monthName = m[2].toLowerCase();
        const year = parseInt(m[3], 10);
        if (monthNames[monthName] && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
            const month = monthNames[monthName];
            const fixed = validateAndFixDate(year, month, day);
            const dateStr = `${fixed.year}-${String(fixed.month).padStart(2, '0')}-${String(fixed.day).padStart(2, '0')}`;
            if (trackCorrections && fixed.corrected) {
                return {
                    date: dateStr,
                    corrected: true,
                    originalValue: originalValue,
                    correctionMessage: `Date corrected from ${year}-${String(month).padStart(2, '0')}-${String(fixed.originalDay).padStart(2, '0')} to ${dateStr} (invalid day for month)`
                };
            }
            return trackCorrections ? { date: dateStr, corrected: false, originalValue: originalValue } : dateStr;
        }
    }
    
    // Pattern: Month DD, YYYY or Month DD YYYY
    m = normalized.match(/\b([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (m) {
        const monthName = m[1].toLowerCase();
        const day = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        if (monthNames[monthName] && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
            const month = monthNames[monthName];
            const fixed = validateAndFixDate(year, month, day);
            const dateStr = `${fixed.year}-${String(fixed.month).padStart(2, '0')}-${String(fixed.day).padStart(2, '0')}`;
            if (trackCorrections && fixed.corrected) {
                return {
                    date: dateStr,
                    corrected: true,
                    originalValue: originalValue,
                    correctionMessage: `Date corrected from ${year}-${String(month).padStart(2, '0')}-${String(fixed.originalDay).padStart(2, '0')} to ${dateStr} (invalid day for month)`
                };
            }
            return trackCorrections ? { date: dateStr, corrected: false, originalValue: originalValue } : dateStr;
        }
    }
    
    // Replace multiple separators with a single dash for easier parsing
    const norm = normalized.replace(/[\.\/]/g, '-');
    // Try YYYY-MM-DD
    m = norm.match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/);
    if (m) {
        const yyyy = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const dd = parseInt(m[3], 10);
        if (yyyy >= 1900 && yyyy <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
            const fixed = validateAndFixDate(yyyy, mm, dd);
            const dateStr = `${fixed.year}-${String(fixed.month).padStart(2, '0')}-${String(fixed.day).padStart(2, '0')}`;
            if (trackCorrections && fixed.corrected) {
                return {
                    date: dateStr,
                    corrected: true,
                    originalValue: originalValue,
                    correctionMessage: `Date corrected from ${yyyy}-${String(mm).padStart(2, '0')}-${String(fixed.originalDay).padStart(2, '0')} to ${dateStr} (invalid day for month)`
                };
            }
            return trackCorrections ? { date: dateStr, corrected: false, originalValue: originalValue } : dateStr;
        }
    }
    // Try DD-MM-YYYY or MM-DD-YYYY (need to detect which format)
    // Common patterns: MM/DD/YYYY (US) or DD/MM/YYYY (European)
    // Since we see "06/31/2025", this is likely MM/DD/YYYY format
    m = norm.match(/^\s*(\d{1,2})-(\d{1,2})-(\d{4})\s*$/);
    if (m) {
        const first = parseInt(m[1], 10);
        const second = parseInt(m[2], 10);
        const yyyy = parseInt(m[3], 10);
        
        if (yyyy >= 1900 && yyyy <= 2100) {
            let mm, dd;
            // Heuristic: If first number > 12, it's likely DD-MM-YYYY format
            if (first > 12 && second <= 12) {
                // DD-MM-YYYY format
                dd = first;
                mm = second;
            } else if (first <= 12 && second <= 31) {
                // MM-DD-YYYY format (US format - more common in Excel)
                mm = first;
                dd = second;
            } else {
                // Try DD-MM-YYYY as fallback
                dd = first;
                mm = second;
            }
            
            if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                const fixed = validateAndFixDate(yyyy, mm, dd);
                const dateStr = `${fixed.year}-${String(fixed.month).padStart(2, '0')}-${String(fixed.day).padStart(2, '0')}`;
                if (trackCorrections && fixed.corrected) {
                    return {
                        date: dateStr,
                        corrected: true,
                        originalValue: originalValue,
                        correctionMessage: `Date corrected from ${yyyy}-${String(mm).padStart(2, '0')}-${String(fixed.originalDay).padStart(2, '0')} to ${dateStr} (invalid day for month)`
                    };
                }
                return trackCorrections ? { date: dateStr, corrected: false, originalValue: originalValue } : dateStr;
            }
        }
    }
    
    // If all parsing fails, return null instead of the original string to avoid database errors
    console.warn(`Could not parse date: "${s}"`);
    return trackCorrections ? null : null;
};

const mapRowUsingHeaderMap = (headers, row, trackCorrections = false) => {
    const obj = {};
    const corrections = [];
    
    for (let i = 0; i < headers.length; i++) {
        const rawHeader = headers[i];
        const normalized = normalizeHeader(rawHeader);
        const canonical = variantToCanonical[normalized] || rawHeader; // keep unknowns
        let value = row[i];
        
        // Normalize dates (Excel Date objects or strings) to YYYY-MM-DD
        if (canonical === 'StartDate' || canonical === 'EndDate' || /date/i.test(String(canonical))) {
            const dateResult = parseDateToYMD(value, trackCorrections);
            if (trackCorrections && dateResult && dateResult.corrected) {
                corrections.push({
                    field: canonical,
                    originalValue: dateResult.originalValue,
                    correctedValue: dateResult.date,
                    message: dateResult.correctionMessage
                });
                value = dateResult.date;
            } else if (trackCorrections && dateResult && dateResult.date) {
                value = dateResult.date;
            } else if (!trackCorrections) {
                value = dateResult;
            }
        }
        
        obj[canonical] = value === '' ? null : value;
    }
    
    if (trackCorrections) {
        return { row: obj, corrections };
    }
    return obj;
};
/**
 * @route POST /api/projects/import-data
 * @description Preview project data from uploaded file
 */
router.post('/import-data', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const filePath = req.file.path;
    try {
        const workbook = xlsx.readFile(filePath, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        if (rawData.length < 2) {
            fs.unlink(filePath, () => {});
            return res.status(400).json({ success: false, message: 'Uploaded Excel file is empty or has no data rows.' });
        }

        const headers = rawData[0];
        // Filter out completely empty rows to avoid processing millions of empty rows
        const dataRows = rawData.slice(1).filter(row => {
            if (!row || !Array.isArray(row)) return false;
            // Check if row has any non-empty cells
            return row.some(cell => {
                return cell !== undefined && cell !== null && cell !== '';
            });
        });

        // Build unrecognized headers list
        const normalizedKnown = new Set(Object.keys(variantToCanonical));
        const unrecognizedHeaders = [];
        headers.forEach(h => {
            const norm = normalizeHeader(h);
            if (!normalizedKnown.has(norm) && !Object.prototype.hasOwnProperty.call(projectHeaderMap, h)) {
                // Allow canonical headers to pass even if not normalized in map
                const isCanonical = Object.keys(projectHeaderMap).includes(h);
                if (!isCanonical && !unrecognizedHeaders.includes(h)) {
                    unrecognizedHeaders.push(h);
                }
            }
        });

        // Track corrections during preview
        const allCorrections = [];
        const fullDataWithCorrections = dataRows.map(r => {
            const result = mapRowUsingHeaderMap(headers, r, true);
            if (result.corrections && result.corrections.length > 0) {
                allCorrections.push(...result.corrections.map(c => ({
                    ...c,
                    row: dataRows.indexOf(r) + 2 // Excel row number (1-indexed header + row index)
                })));
            }
            return result.row;
        }).filter(row => {
            // Skip rows where project name is empty, null, or has less than 3 characters
            const projectName = (row.projectName || row.Project_Name || row['Project Name'] || '').toString().trim();
            return projectName && projectName.length >= 3;
        });
        
        const fullData = fullDataWithCorrections;
        const previewLimit = 10;
        const previewData = fullData.slice(0, previewLimit);

        fs.unlink(filePath, () => {});
        return res.status(200).json({
            success: true,
            message: `File parsed successfully. Review ${previewData.length} of ${fullData.length} rows.${allCorrections.length > 0 ? ` ${allCorrections.length} data correction(s) applied.` : ''}`,
            previewData,
            headers,
            fullData,
            unrecognizedHeaders,
            corrections: allCorrections.length > 0 ? allCorrections : undefined
        });
    } catch (err) {
        fs.unlink(filePath, () => {});
        console.error('Project import preview error:', err);
        return res.status(500).json({ success: false, message: `File parsing failed: ${err.message}` });
    }
});

/**
 * @route POST /api/projects/check-metadata-mapping
 * @description Check metadata mappings for import data (including scoping metadata)
 * @access Private
 * Accepts either:
 *   - FormData with 'file' field (for file upload)
 *   - JSON body with 'dataToImport' array
 */
router.post('/check-metadata-mapping', upload.single('file'), async (req, res) => {
    let dataToImport = req.body?.dataToImport;
    let filePath = req.file?.path;
    
    // If no data provided but file uploaded, parse the file
    if ((!dataToImport || !Array.isArray(dataToImport) || dataToImport.length === 0) && filePath) {
        try {
            console.log('No dataToImport provided, parsing uploaded file for metadata check');
            const workbook = xlsx.readFile(filePath, { 
                cellDates: true,
                cellNF: false,
                cellStyles: false
            });
            const sheetName = workbook.SheetNames[0];
            let worksheet = workbook.Sheets[sheetName];
            
            const rawData = xlsx.utils.sheet_to_json(worksheet, { 
                header: 1,
                defval: null,
                raw: false
            });
            
            if (rawData.length < 2) {
                fs.unlink(filePath, () => {});
                return res.status(400).json({ success: false, message: 'Uploaded Excel file is empty or has no data rows.' });
            }
            
            const headers = rawData[0];
            const dataRows = rawData.slice(1).filter(row => {
                if (!row || !Array.isArray(row)) return false;
                return row.some(cell => cell !== undefined && cell !== null && cell !== '');
            });
            
            // Map headers to canonical names (same as in import-data)
            const headerMap = {
                'projectname': 'projectName',
                'project name': 'projectName',
                'project': 'projectName',
                'county': 'county',
                'county name': 'county',
                'county_name': 'county',
                'countyname': 'county',
                'constituency': 'constituency',
                'constituency name': 'constituency',
                'constituency_name': 'constituency',
                'constituencyname': 'constituency',
                'ward': 'ward',
                'ward name': 'ward',
                'ward_name': 'ward',
                'kenya ward': 'ward',
                'kenya_ward': 'ward',
                'ward name (iebc)': 'ward',
                'iebc ward name': 'ward',
                'iebc_ward_name': 'ward',
                'sector': 'sector',
                'ministry': 'ministry',
                'state department': 'stateDepartment',
                'state_department': 'stateDepartment',
                'statedepartment': 'stateDepartment',
                'implementing agency': 'implementingAgency',
                'implementingagency': 'implementingAgency',
                'directorate': 'implementingAgency',
                'agency': 'implementingAgency',
            };
            
            dataToImport = dataRows.map(row => {
                const mappedRow = {};
                headers.forEach((header, index) => {
                    const normalizedHeader = String(header || '').toLowerCase().trim();
                    const canonicalKey = headerMap[normalizedHeader] || normalizedHeader;
                    mappedRow[canonicalKey] = row[index];
                });
                return mappedRow;
            }).filter(row => {
                const projectName = (row.projectName || '').toString().trim();
                return projectName && projectName.length >= 3;
            });
        } catch (parseErr) {
            console.error('Error parsing file in check-metadata-mapping:', parseErr);
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
            return res.status(400).json({ success: false, message: `Failed to parse uploaded file: ${parseErr.message}` });
        }
    }
    
    if (!dataToImport || !Array.isArray(dataToImport) || dataToImport.length === 0) {
        return res.status(400).json({ success: false, message: 'No data provided for metadata mapping check.' });
    }

    // Enhanced normalization: trim, normalize spaces/slashes, handle apostrophes, collapse multiple spaces
    const normalizeStr = (v) => {
        if (typeof v !== 'string') return v;
        let normalized = v.trim();
        // Remove apostrophes (handle different apostrophe characters: ', ', ', `, and Unicode variants)
        // Use a more comprehensive pattern to catch all apostrophe-like characters
        normalized = normalized.replace(/[''"`\u0027\u2018\u2019\u201A\u201B\u2032\u2035]/g, '');
        // Normalize slashes: remove spaces around existing slashes
        normalized = normalized.replace(/\s*\/\s*/g, '/');
        // Collapse multiple spaces to single space
        normalized = normalized.replace(/\s+/g, ' ');
        // Don't automatically convert spaces to slashes - this causes issues with names like "Kisumu Central"
        // The matching logic will handle both space and slash variations
        return normalized;
    };

    // Normalize alias for matching: remove &, commas, and spaces, then lowercase
    // This allows "WECV&NR", "WECVNR", "WE,CV,NR" to all match
    const normalizeAlias = (v) => {
        if (typeof v !== 'string') return v;
        return normalizeStr(v)
            .replace(/[&,]/g, '')  // Remove ampersands and commas
            .replace(/\s+/g, '')   // Remove all spaces
            .toLowerCase();         // Lowercase for case-insensitive matching
    };

    const normalizeCatalogKey = (v) => {
        if (typeof v !== 'string') return '';
        return normalizeStr(v)
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\bministry\s+of\b/g, ' ')
            .replace(/\bstate\s+department\b/g, ' ')
            .replace(/\bdepartment\b/g, ' ')
            .replace(/\bfor\b/g, ' ')
            .replace(/\bof\b/g, ' ')
            .replace(/\bthe\b/g, ' ')
            .replace(/\band\b/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const buildCatalogKeys = (value) => {
        const base = normalizeCatalogKey(value);
        if (!base) return [];
        const compact = base.replace(/\s+/g, '');
        return Array.from(new Set([base, compact].filter(Boolean)));
    };

    const buildGeoComparisonKeys = (value, label) => {
        const raw = normalizeStr(value);
        if (!raw) return [];
        const lowered = raw.toLowerCase();
        const withoutLabel = lowered
            .replace(new RegExp(`\\b${label}\\b`, 'gi'), '')
            .trim();
        const normalized = withoutLabel || lowered;
        const spaceVariant = normalized.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
        const slashVariant = normalized.replace(/\s+/g, '/').replace(/\/+/g, '/').trim();
        const compactVariant = normalized.replace(/[^a-z0-9]/g, '');
        return Array.from(new Set([normalized, spaceVariant, slashVariant, compactVariant].filter(Boolean)));
    };

    // Normalize query results from pg pool/client responses used in this route
    const getQueryRows = (result) => {
        if (!result) return [];
        if (Array.isArray(result.rows)) return result.rows;
        if (Array.isArray(result)) return result;
        return [];
    };

    let connection;
    const mappingSummary = {
        departments: { existing: [], new: [], unmatched: [] },
        directorates: { existing: [], new: [], unmatched: [] },
        wards: { existing: [], new: [], unmatched: [] },
        subcounties: { existing: [], new: [], unmatched: [] },
        financialYears: { existing: [], new: [], unmatched: [] },
        sectors: { existing: [], unmatched: [] },
        ministries: { existing: [], unmatched: [] },
        stateDepartments: { existing: [], unmatched: [] },
        counties: { existing: [], new: [], unmatched: [] },
        constituencies: { existing: [], new: [], unmatched: [] },
        kenyaWards: { existing: [], new: [], unmatched: [] },
        implementingAgencies: { existing: [], new: [], unmatched: [] },
        geoDebug: {
            tableRef: null,
            countyColumn: null,
            constituencyColumn: null,
            wardColumn: null,
            sampleConstituencyChecks: []
        },
        totalRows: dataToImport.length,
        rowsWithUnmatchedMetadata: []
    };

    try {
        connection = await pool.getConnection();
        let kenyaWardsTableRef = '"public"."kenya_wards"';
        let kenyaWardsCountyColumnRef = '"county"';
        let kenyaWardsConstituencyColumnRef = '"constituency"';
        let kenyaWardsWardColumnRef = '"ward_name"';
        try {
            const tableResult = await connection.query(
                `SELECT table_schema, table_name
                 FROM information_schema.tables
                 WHERE table_type = 'BASE TABLE'
                   AND table_name IN ('kenya_wards', 'kenyan_wards')
                   AND table_schema NOT IN ('pg_catalog', 'information_schema')
                 ORDER BY CASE table_name
                    WHEN 'kenya_wards' THEN 1
                    WHEN 'kenyan_wards' THEN 2
                    ELSE 3
                 END,
                 CASE table_schema
                    WHEN 'public' THEN 1
                    ELSE 2
                 END
                 LIMIT 1`
            );
            const tableRows = getQueryRows(tableResult);
            const wardsTable = tableRows?.[0];
            if (wardsTable?.table_schema && wardsTable?.table_name) {
                kenyaWardsTableRef = `"${wardsTable.table_schema}"."${wardsTable.table_name}"`;
            }

            const geoColumnsResult = await connection.query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_schema = $1
                   AND table_name = $2
                   AND lower(column_name) IN (
                     'county', 'county_name',
                     'constituency', 'constituency_name',
                     'ward_name', 'iebc_ward_name', 'ward', 'name'
                   )`,
                [wardsTable?.table_schema || 'public', wardsTable?.table_name || 'kenya_wards']
            );
            const geoColRows = getQueryRows(geoColumnsResult);

            const pickColumn = (candidates) => {
                const lowerCandidates = candidates.map((c) => c.toLowerCase());
                const found = geoColRows.find((r) => lowerCandidates.includes(String(r.column_name || '').toLowerCase()));
                return found?.column_name || null;
            };

            const countyCol = pickColumn(['county', 'county_name']);
            const constituencyCol = pickColumn(['constituency', 'constituency_name']);
            const wardCol = pickColumn(['ward_name', 'iebc_ward_name', 'ward', 'name']);

            if (countyCol) kenyaWardsCountyColumnRef = `"${countyCol}"`;
            if (constituencyCol) kenyaWardsConstituencyColumnRef = `"${constituencyCol}"`;
            if (wardCol) kenyaWardsWardColumnRef = `"${wardCol}"`;
        } catch (tableCheckErr) {
            console.warn('Metadata check: failed to detect wards table variant, defaulting to kenya_wards:', tableCheckErr.message);
        }
        mappingSummary.geoDebug.tableRef = kenyaWardsTableRef;
        mappingSummary.geoDebug.countyColumn = kenyaWardsCountyColumnRef;
        mappingSummary.geoDebug.constituencyColumn = kenyaWardsConstituencyColumnRef;
        mappingSummary.geoDebug.wardColumn = kenyaWardsWardColumnRef;

        // Collect unique values from all rows
        const uniqueDepartments = new Set();
        const uniqueDirectorates = new Set();
        const uniqueWards = new Set();
        const uniqueSubcounties = new Set();
        const uniqueFinancialYears = new Set();
        const uniqueCounties = new Set();
        const uniqueConstituencies = new Set();
        const uniqueKenyaWards = new Set();
        const uniqueImplementingAgencies = new Set();
        const uniqueSectors = new Set();
        const uniqueMinistries = new Set();
        const uniqueStateDepartments = new Set();

        dataToImport.forEach((row, index) => {
            // Skip rows where project name is empty, null, or has less than 3 characters
            const projectName = (row.projectName || row.Project_Name || row['Project Name'] || '').toString().trim();
            if (!projectName || projectName.length < 3) {
                return; // Skip this row
            }
            
            const dept = normalizeStr(row.department || row.Department);
            const directorate = normalizeStr(row.directorate || row.Directorate);
            const ward = normalizeStr(row.ward || row.Ward || row['Ward Name']);
            const subcounty = normalizeStr(row['sub-county'] || row.SubCounty || row['Sub County'] || row.Subcounty);
            const finYear = normalizeStr(row.financialYear || row.FinancialYear || row['Financial Year'] || row.ADP || row.Year);
            const county = normalizeStr(row.county || row.County || row['County'] || row['County Name']);
            const constituency = normalizeStr(row.constituency || row.Constituency || row['Constituency'] || row['Constituency Name']);
            const kenyaWard = normalizeStr(row.ward || row.Ward || row['Ward'] || row['Ward Name'] || row['Kenya Ward'] || row['Ward Name (IEBC)']);
            const implementingAgency = normalizeStr(row.implementingAgency || row['Implementing Agency'] || row.implementing_agency || row.directorate || row.Directorate);
            const sector = normalizeStr(row.sector || row.Sector);
            const ministry = normalizeStr(row.ministry || row.Ministry || row['Ministry Name']);
            const stateDepartment = normalizeStr(row.stateDepartment || row.state_department || row['State Department'] || row['State Department Name']);

            if (dept) uniqueDepartments.add(dept);
            if (directorate) uniqueDirectorates.add(directorate);
            if (ward) uniqueWards.add(ward);
            if (subcounty) uniqueSubcounties.add(subcounty);
            if (finYear) uniqueFinancialYears.add(finYear);
            if (county) uniqueCounties.add(county);
            if (constituency) uniqueConstituencies.add(constituency);
            if (kenyaWard) uniqueKenyaWards.add(kenyaWard);
            if (implementingAgency) uniqueImplementingAgencies.add(implementingAgency);
            if (sector) uniqueSectors.add(sector);
            if (ministry) uniqueMinistries.add(ministry);
            if (stateDepartment) uniqueStateDepartments.add(stateDepartment);
        });

        // Check sectors against sectors table (name and alias)
        if (uniqueSectors.size > 0) {
            const sectorList = Array.from(uniqueSectors);
            try {
                const sectorsResult = await connection.query(
                    `SELECT name, alias FROM sectors WHERE COALESCE(voided, false) = false`
                );
                const allSectors = getQueryRows(sectorsResult);
                const existingNames = new Set();
                const existingAliases = new Set();

                allSectors.forEach((s) => {
                    if (s.name) buildCatalogKeys(s.name).forEach((k) => existingNames.add(k));
                    if (s.alias) {
                        const fullAlias = normalizeStr(s.alias).toLowerCase();
                        const normalizedAlias = normalizeAlias(s.alias);
                        existingAliases.add(fullAlias);
                        existingAliases.add(normalizedAlias);
                        s.alias.split(',').map((a) => normalizeStr(a).toLowerCase()).forEach((a) => existingAliases.add(a));
                        s.alias.split(',').forEach((a) => buildCatalogKeys(a).forEach((k) => existingAliases.add(k)));
                    }
                });

                sectorList.forEach((sector) => {
                    const normalized = normalizeStr(sector).toLowerCase();
                    const normalizedAlias = normalizeAlias(sector);
                    const catalogKeys = buildCatalogKeys(sector);
                    const hasMatch = existingNames.has(normalized)
                        || existingAliases.has(normalized)
                        || existingAliases.has(normalizedAlias)
                        || catalogKeys.some((k) => existingNames.has(k) || existingAliases.has(k));
                    if (hasMatch) {
                        mappingSummary.sectors.existing.push(sector);
                    } else {
                        mappingSummary.sectors.unmatched.push(sector);
                    }
                });
            } catch (sectorErr) {
                console.warn('Metadata check: sectors table unavailable or unreadable:', sectorErr.message);
                mappingSummary.sectors.unmatched.push(...sectorList);
            }
        }

        // Check ministries against ministries table (name and alias)
        if (uniqueMinistries.size > 0) {
            const ministryList = Array.from(uniqueMinistries);
            try {
                const ministriesResult = await connection.query(
                    `SELECT name, alias FROM ministries WHERE COALESCE(voided, false) = false`
                );
                const allMinistries = getQueryRows(ministriesResult);
                const existingNames = new Set();
                const existingAliases = new Set();

                allMinistries.forEach((m) => {
                    if (m.name) buildCatalogKeys(m.name).forEach((k) => existingNames.add(k));
                    if (m.alias) {
                        const fullAlias = normalizeStr(m.alias).toLowerCase();
                        const normalizedAlias = normalizeAlias(m.alias);
                        existingAliases.add(fullAlias);
                        existingAliases.add(normalizedAlias);
                        m.alias.split(',').map((a) => normalizeStr(a).toLowerCase()).forEach((a) => existingAliases.add(a));
                        m.alias.split(',').forEach((a) => buildCatalogKeys(a).forEach((k) => existingAliases.add(k)));
                    }
                });

                ministryList.forEach((ministry) => {
                    const normalized = normalizeStr(ministry).toLowerCase();
                    const normalizedAlias = normalizeAlias(ministry);
                    const catalogKeys = buildCatalogKeys(ministry);
                    const hasMatch = existingNames.has(normalized)
                        || existingAliases.has(normalized)
                        || existingAliases.has(normalizedAlias)
                        || catalogKeys.some((k) => existingNames.has(k) || existingAliases.has(k));
                    if (hasMatch) {
                        mappingSummary.ministries.existing.push(ministry);
                    } else {
                        mappingSummary.ministries.unmatched.push(ministry);
                    }
                });
            } catch (ministryErr) {
                console.warn('Metadata check: ministries table unavailable or unreadable:', ministryErr.message);
                mappingSummary.ministries.unmatched.push(...ministryList);
            }
        }

        // Check state departments against departments table (name and alias)
        if (uniqueStateDepartments.size > 0) {
            const stateList = Array.from(uniqueStateDepartments);
            try {
                const stateDepartmentsResult = await connection.query(
                    `SELECT name, alias FROM departments WHERE COALESCE(voided, false) = false`
                );
                const allDepartments = getQueryRows(stateDepartmentsResult);
                const existingNames = new Set();
                const existingAliases = new Set();

                allDepartments.forEach((d) => {
                    if (d.name) buildCatalogKeys(d.name).forEach((k) => existingNames.add(k));
                    if (d.alias) {
                        const fullAlias = normalizeStr(d.alias).toLowerCase();
                        const normalizedAlias = normalizeAlias(d.alias);
                        existingAliases.add(fullAlias);
                        existingAliases.add(normalizedAlias);
                        d.alias.split(',').map((a) => normalizeStr(a).toLowerCase()).forEach((a) => existingAliases.add(a));
                        d.alias.split(',').forEach((a) => buildCatalogKeys(a).forEach((k) => existingAliases.add(k)));
                    }
                });

                stateList.forEach((stateDepartment) => {
                    const normalized = normalizeStr(stateDepartment).toLowerCase();
                    const normalizedAlias = normalizeAlias(stateDepartment);
                    const catalogKeys = buildCatalogKeys(stateDepartment);
                    const hasMatch = existingNames.has(normalized)
                        || existingAliases.has(normalized)
                        || existingAliases.has(normalizedAlias)
                        || catalogKeys.some((k) => existingNames.has(k) || existingAliases.has(k));
                    if (hasMatch) {
                        mappingSummary.stateDepartments.existing.push(stateDepartment);
                    } else {
                        mappingSummary.stateDepartments.unmatched.push(stateDepartment);
                    }
                });
            } catch (stateDeptErr) {
                console.warn('Metadata check: departments table unavailable or unreadable:', stateDeptErr.message);
                mappingSummary.stateDepartments.unmatched.push(...stateList);
            }
        }

        // Check counties against kenya_wards table
        if (uniqueCounties.size > 0) {
            const countyList = Array.from(uniqueCounties);
            try {
                const countiesResult = await connection.query(
                    `SELECT DISTINCT ${kenyaWardsCountyColumnRef} AS county_name FROM ${kenyaWardsTableRef} WHERE ${kenyaWardsCountyColumnRef} IS NOT NULL AND ${kenyaWardsCountyColumnRef} != '' AND COALESCE(voided, false) = false`
                );
                const allCounties = getQueryRows(countiesResult);
                const existingCounties = new Set();

                allCounties.forEach((c) => {
                    if (c.county_name) {
                        buildGeoComparisonKeys(c.county_name, 'county').forEach((k) => existingCounties.add(k));
                    }
                });

                countyList.forEach((county) => {
                    const countyKeys = buildGeoComparisonKeys(county, 'county');
                    const hasMatch = countyKeys.some((k) => existingCounties.has(k));
                    if (hasMatch) {
                        mappingSummary.counties.existing.push(county);
                    } else {
                        mappingSummary.counties.unmatched.push(county);
                    }
                });
            } catch (countyErr) {
                console.warn('Metadata check: kenya_wards county data unavailable or unreadable:', countyErr.message);
                mappingSummary.counties.unmatched.push(...countyList);
            }
        }

        // Check constituencies against kenya_wards table
        if (uniqueConstituencies.size > 0) {
            const constituencyList = Array.from(uniqueConstituencies);
            try {
                const constituenciesResult = await connection.query(
                    `SELECT DISTINCT ${kenyaWardsConstituencyColumnRef} AS constituency_name FROM ${kenyaWardsTableRef} WHERE ${kenyaWardsConstituencyColumnRef} IS NOT NULL AND ${kenyaWardsConstituencyColumnRef} != '' AND COALESCE(voided, false) = false`
                );
                const allConstituencies = getQueryRows(constituenciesResult);
                const existingConstituencies = new Set();

                allConstituencies.forEach((c) => {
                    if (c.constituency_name) {
                        buildGeoComparisonKeys(c.constituency_name, 'constituency').forEach((k) => existingConstituencies.add(k));
                    }
                });

                for (const constituency of constituencyList) {
                    const constituencyKeys = buildGeoComparisonKeys(constituency, 'constituency');
                    let hasMatch = constituencyKeys.some((k) => existingConstituencies.has(k));

                    if (!hasMatch) {
                        // Fallback: direct SQL fuzzy check for edge formatting/casing differences
                        // such as "Westlands", "Westlands Constituency", or slash/space variants.
                        const constituencyBase = normalizeStr(constituency || '').toLowerCase();
                        const normalizedNeedle = constituencyBase
                            .replace(/\bconstituency\b/g, ' ')
                            .replace(/[^a-z0-9\s]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (normalizedNeedle) {
                            const sqlFallbackQuery = `
                                SELECT 1
                                FROM ${kenyaWardsTableRef}
                                WHERE (${kenyaWardsConstituencyColumnRef} IS NOT NULL)
                                  AND (
                                    regexp_replace(
                                      lower(${kenyaWardsConstituencyColumnRef}),
                                      '[^a-z0-9]+',
                                      ' ',
                                      'g'
                                    ) LIKE '%' || $1 || '%'
                                  )
                                  AND (voided IS NULL OR voided = false)
                                LIMIT 1
                            `;
                            const fallbackResult = await connection.query(sqlFallbackQuery, [normalizedNeedle]);
                            const fallbackRows = getQueryRows(fallbackResult);
                            hasMatch = fallbackRows.length > 0;
                        }
                    }

                    if (hasMatch) {
                        mappingSummary.constituencies.existing.push(constituency);
                    } else {
                        mappingSummary.constituencies.unmatched.push(constituency);
                    }
                    if (mappingSummary.geoDebug.sampleConstituencyChecks.length < 10) {
                        mappingSummary.geoDebug.sampleConstituencyChecks.push({
                            value: constituency,
                            comparisonKeys: constituencyKeys,
                            matched: hasMatch
                        });
                    }
                }
            } catch (constituencyErr) {
                console.warn('Metadata check: kenya_wards constituency data unavailable or unreadable:', constituencyErr.message);
                mappingSummary.constituencies.unmatched.push(...constituencyList);
            }
        }

        // Check wards against kenya_wards table (only if ward column has values)
        if (uniqueKenyaWards.size > 0) {
            const wardList = Array.from(uniqueKenyaWards);
            try {
                const wardsResult = await connection.query(
                    `SELECT DISTINCT ${kenyaWardsWardColumnRef} AS ward_name FROM ${kenyaWardsTableRef} WHERE ${kenyaWardsWardColumnRef} IS NOT NULL AND ${kenyaWardsWardColumnRef} != '' AND COALESCE(voided, false) = false`
                );
                const allWards = getQueryRows(wardsResult);
                const existingWards = new Set();

                allWards.forEach((w) => {
                    if (w.ward_name) {
                        buildGeoComparisonKeys(w.ward_name, 'ward').forEach((k) => existingWards.add(k));
                    }
                });

                wardList.forEach((ward) => {
                    const wardKeys = buildGeoComparisonKeys(ward, 'ward');
                    const hasMatch = wardKeys.some((k) => existingWards.has(k));
                    if (hasMatch) {
                        mappingSummary.kenyaWards.existing.push(ward);
                    } else {
                        mappingSummary.kenyaWards.unmatched.push(ward);
                    }
                });
            } catch (wardErr) {
                console.warn('Metadata check: kenya_wards ward data unavailable or unreadable:', wardErr.message);
                mappingSummary.kenyaWards.unmatched.push(...wardList);
            }
        }

        // Canonical projects import metadata check:
        // only validate against sectors, ministries, departments (state departments),
        // and selected geography checks (county, constituency).
        // Skip legacy kemri_* / location metadata checks used in older flows.
        dataToImport.forEach((row, index) => {
            const projectName = (row.projectName || row.Project_Name || row['Project Name'] || '').toString().trim();
            if (!projectName || projectName.length < 3) {
                return;
            }

            const sector = normalizeStr(row.sector || row.Sector);
            const ministry = normalizeStr(row.ministry || row.Ministry || row['Ministry Name']);
            const stateDepartment = normalizeStr(row.stateDepartment || row.state_department || row['State Department'] || row['State Department Name']);
            const county = normalizeStr(row.county || row.County || row['County'] || row['County Name']);
            const constituency = normalizeStr(row.constituency || row.Constituency || row['Constituency'] || row['Constituency Name']);
            const kenyaWard = normalizeStr(row.ward || row.Ward || row['Ward'] || row['Ward Name'] || row['Kenya Ward'] || row['Ward Name (IEBC)']);

            const unmatched = [];
            if (sector && mappingSummary.sectors.unmatched.includes(sector)) {
                unmatched.push(`Sector: ${sector}`);
            }
            if (ministry && mappingSummary.ministries.unmatched.includes(ministry)) {
                unmatched.push(`Ministry: ${ministry}`);
            }
            if (stateDepartment && mappingSummary.stateDepartments.unmatched.includes(stateDepartment)) {
                unmatched.push(`State Department: ${stateDepartment}`);
            }
            if (county && mappingSummary.counties.unmatched.includes(county)) {
                unmatched.push(`County: ${county}`);
            }
            if (constituency && mappingSummary.constituencies.unmatched.includes(constituency)) {
                unmatched.push(`Constituency: ${constituency}`);
            }
            if (kenyaWard && mappingSummary.kenyaWards.unmatched.includes(kenyaWard)) {
                unmatched.push(`Ward: ${kenyaWard}`);
            }

            if (unmatched.length > 0) {
                mappingSummary.rowsWithUnmatchedMetadata.push({
                    rowNumber: index + 2,
                    projectName: normalizeStr(row.projectName || row.Project_Name || row['Project Name']) || `Row ${index + 2}`,
                    unmatched
                });
            }
        });

        return res.status(200).json({
            success: true,
            message: 'Metadata mapping check completed',
            mappingSummary
        });

        // Check departments (by name and alias)
        if (uniqueDepartments.size > 0) {
            const deptList = Array.from(uniqueDepartments);
            // Get all departments and check manually (to handle comma-separated aliases properly)
            const [allDepts] = await connection.query(
                `SELECT name, alias FROM kemri_departments 
                 WHERE (voided IS NULL OR voided = 0)`
            );
            const existingNames = new Set();
            const existingAliases = new Set();
            const aliasMap = new Map(); // Map alias -> name for tracking
            
            allDepts.forEach(d => {
                if (d.name) existingNames.add(normalizeStr(d.name).toLowerCase()); // Store lowercase for case-insensitive matching
                if (d.alias) {
                    // Store normalized alias (without &, commas, spaces) for flexible matching
                    const normalizedAlias = normalizeAlias(d.alias);
                    existingAliases.add(normalizedAlias);
                    aliasMap.set(normalizedAlias, d.name);
                    
                    // Also store split parts (for backwards compatibility)
                    const aliases = d.alias.split(',').map(a => normalizeStr(a).toLowerCase());
                    aliases.forEach(a => {
                        existingAliases.add(a);
                        aliasMap.set(a, d.name);
                    });
                    
                    // Also store full alias string (normalized)
                    const fullAlias = normalizeStr(d.alias).toLowerCase();
                    existingAliases.add(fullAlias);
                    aliasMap.set(fullAlias, d.name);
                }
            });
            
            deptList.forEach(dept => {
                const normalizedDept = normalizeStr(dept).toLowerCase(); // Case-insensitive matching
                const normalizedDeptAlias = normalizeAlias(dept); // Alias-style normalization (no &, commas, spaces)
                let found = false;
                
                // Check against existing names (case-insensitive) - direct Set lookup
                if (existingNames.has(normalizedDept)) {
                    mappingSummary.departments.existing.push(dept);
                    found = true;
                }
                
                // Check against aliases (case-insensitive) - try both normalizations
                if (!found && (existingAliases.has(normalizedDept) || existingAliases.has(normalizedDeptAlias))) {
                    mappingSummary.departments.existing.push(dept);
                    found = true;
                }
                
                if (!found) {
                    mappingSummary.departments.new.push(dept);
                }
            });
        }

        // Check directorates (sections) - by name and alias
        if (uniqueDirectorates.size > 0) {
            const dirList = Array.from(uniqueDirectorates);
            // Get all sections and check manually (to handle comma-separated aliases properly)
            const [allSections] = await connection.query(
                `SELECT name, alias FROM kemri_sections 
                 WHERE (voided IS NULL OR voided = 0)`
            );
            const existingNames = new Set();
            const existingAliases = new Set();
            
            allSections.forEach(d => {
                if (d.name) existingNames.add(normalizeStr(d.name).toLowerCase()); // Store lowercase for case-insensitive matching
                if (d.alias) {
                    // Store normalized alias (without &, commas, spaces) for flexible matching
                    const normalizedAlias = normalizeAlias(d.alias);
                    existingAliases.add(normalizedAlias);
                    
                    // Also store split parts (for backwards compatibility)
                    const aliases = d.alias.split(',').map(a => normalizeStr(a).toLowerCase());
                    aliases.forEach(a => existingAliases.add(a));
                    
                    // Also store full alias string (normalized)
                    const fullAlias = normalizeStr(d.alias).toLowerCase();
                    existingAliases.add(fullAlias);
                }
            });
            
            dirList.forEach(dir => {
                const normalizedDir = normalizeStr(dir).toLowerCase(); // Case-insensitive matching
                const normalizedDirAlias = normalizeAlias(dir); // Alias-style normalization (no &, commas, spaces)
                let found = false;
                
                // Check against existing names (case-insensitive) - direct Set lookup
                if (existingNames.has(normalizedDir)) {
                    mappingSummary.directorates.existing.push(dir);
                    found = true;
                }
                
                // Check against aliases (case-insensitive) - try both normalizations
                if (!found && (existingAliases.has(normalizedDir) || existingAliases.has(normalizedDirAlias))) {
                    mappingSummary.directorates.existing.push(dir);
                    found = true;
                }
                
                if (!found) {
                    mappingSummary.directorates.new.push(dir);
                }
            });
        }

        // Check wards (case-insensitive matching)
        if (uniqueWards.size > 0) {
            const wardList = Array.from(uniqueWards);
            // Get all wards and do case-insensitive matching
            const [allWards] = await connection.query(
                `SELECT name FROM kemri_wards WHERE (voided IS NULL OR voided = 0)`
            );
            // Create a case-insensitive map: lowercase name -> actual name
            // Store both the normalized version and variations (with/without slashes, word order variations)
            const wardNameMap = new Map();
            const wardWordSetMap = new Map(); // Map of sorted word sets -> actual name (for order-independent matching)
            
            allWards.forEach(w => {
                if (w.name) {
                    const normalized = normalizeStr(w.name).toLowerCase();
                    wardNameMap.set(normalized, w.name);
                    // Also store with space converted to slash and vice versa for flexible matching
                    const withSlash = normalized.replace(/\s+/g, '/');
                    if (withSlash !== normalized) {
                        wardNameMap.set(withSlash, w.name);
                    }
                    const withSpace = normalized.replace(/\//g, ' ');
                    if (withSpace !== normalized) {
                        wardNameMap.set(withSpace, w.name);
                    }
                    
                    // Create a word set for order-independent matching
                    const words = normalized.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
                    if (words) {
                        wardWordSetMap.set(words, w.name);
                    }
                }
            });
            
            wardList.forEach(ward => {
                // Strip "Ward" suffix if present (case-insensitive)
                let wardName = normalizeStr(ward).toLowerCase();
                wardName = wardName.replace(/\s+ward\s*$/i, '').trim();
                
                let found = false;
                
                // Try exact match first
                if (wardNameMap.has(wardName)) {
                    mappingSummary.wards.existing.push(ward);
                    found = true;
                } else {
                    // Try with space converted to slash (for compound names like "Masogo Nyangoma" -> "Masogo/Nyangoma")
                    const withSlash = wardName.replace(/\s+/g, '/');
                    if (wardNameMap.has(withSlash)) {
                        mappingSummary.wards.existing.push(ward);
                        found = true;
                    } else {
                        // Try with slash converted to space (for cases like "KISUMU/CENTRAL" -> "KISUMU CENTRAL")
                        const withSpace = wardName.replace(/\//g, ' ');
                        if (wardNameMap.has(withSpace)) {
                            mappingSummary.wards.existing.push(ward);
                            found = true;
                        } else {
                            // Try order-independent matching (e.g., "Nyangoma Masogo" matches "Masogo/Nyangoma")
                            const words = wardName.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
                            if (words && wardWordSetMap.has(words)) {
                                mappingSummary.wards.existing.push(ward);
                                found = true;
                            }
                        }
                    }
                }
                
                if (!found) {
                    mappingSummary.wards.new.push(ward);
                }
            });
        }

        // Check subcounties (case-insensitive matching)
        if (uniqueSubcounties.size > 0) {
            const subcountyList = Array.from(uniqueSubcounties);
            // Get all subcounties and do case-insensitive matching
            const [allSubcounties] = await connection.query(
                `SELECT name FROM kemri_subcounties WHERE (voided IS NULL OR voided = 0)`
            );
            // Create a case-insensitive map: lowercase name -> actual name
            // Store both the normalized version and variations (with/without slashes, word order variations)
            const subcountyNameMap = new Map();
            const subcountyWordSetMap = new Map(); // Map of sorted word sets -> actual name (for order-independent matching)
            
            allSubcounties.forEach(s => {
                if (s.name) {
                    const normalized = normalizeStr(s.name).toLowerCase();
                    subcountyNameMap.set(normalized, s.name);
                    // Also store with space converted to slash and vice versa for flexible matching
                    const withSlash = normalized.replace(/\s+/g, '/');
                    if (withSlash !== normalized) {
                        subcountyNameMap.set(withSlash, s.name);
                    }
                    const withSpace = normalized.replace(/\//g, ' ');
                    if (withSpace !== normalized) {
                        subcountyNameMap.set(withSpace, s.name);
                    }
                    
                    // Create a word set for order-independent matching
                    const words = normalized.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
                    if (words) {
                        subcountyWordSetMap.set(words, s.name);
                    }
                }
            });
            
            subcountyList.forEach(subcounty => {
                // Strip "SC" or "Subcounty" or "Sub County" suffix if present (case-insensitive)
                let subcountyName = normalizeStr(subcounty).toLowerCase();
                subcountyName = subcountyName.replace(/\s+sc\s*$/i, '').trim();
                subcountyName = subcountyName.replace(/\s+subcounty\s*$/i, '').trim();
                subcountyName = subcountyName.replace(/\s+sub\s+county\s*$/i, '').trim();
                
                let found = false;
                
                // Try exact match first
                if (subcountyNameMap.has(subcountyName)) {
                    mappingSummary.subcounties.existing.push(subcounty);
                    found = true;
                } else {
                    // Try with space converted to slash (for compound names)
                    const withSlash = subcountyName.replace(/\s+/g, '/');
                    if (subcountyNameMap.has(withSlash)) {
                        mappingSummary.subcounties.existing.push(subcounty);
                        found = true;
                    } else {
                        // Try with slash converted to space
                        const withSpace = subcountyName.replace(/\//g, ' ');
                        if (subcountyNameMap.has(withSpace)) {
                            mappingSummary.subcounties.existing.push(subcounty);
                            found = true;
                        } else {
                            // Try order-independent matching (e.g., "Nyangoma Masogo" matches "Masogo/Nyangoma")
                            const words = subcountyName.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
                            if (words && subcountyWordSetMap.has(words)) {
                                mappingSummary.subcounties.existing.push(subcounty);
                                found = true;
                            }
                        }
                    }
                }
                
                if (!found) {
                    mappingSummary.subcounties.new.push(subcounty);
                }
            });
        }

        // Check counties against kenya_wards table
        if (uniqueCounties.size > 0) {
            const countyList = Array.from(uniqueCounties);
            const [allCounties] = await connection.query(
                `SELECT DISTINCT county FROM kenya_wards WHERE county IS NOT NULL AND county != '' AND voided = false`
            );
            const existingCounties = new Set();
            allCounties.forEach(c => {
                if (c.county) {
                    existingCounties.add(normalizeStr(c.county).toLowerCase());
                }
            });
            
            countyList.forEach(county => {
                const normalizedCounty = normalizeStr(county).toLowerCase();
                if (existingCounties.has(normalizedCounty)) {
                    mappingSummary.counties.existing.push(county);
                } else {
                    mappingSummary.counties.unmatched.push(county);
                }
            });
        }

        // Check constituencies against kenya_wards table
        if (uniqueConstituencies.size > 0) {
            const constituencyList = Array.from(uniqueConstituencies);
            const [allConstituencies] = await connection.query(
                `SELECT DISTINCT constituency FROM kenya_wards WHERE constituency IS NOT NULL AND constituency != '' AND voided = false`
            );
            const existingConstituencies = new Set();
            allConstituencies.forEach(c => {
                if (c.constituency) {
                    existingConstituencies.add(normalizeStr(c.constituency).toLowerCase());
                }
            });
            
            constituencyList.forEach(constituency => {
                const normalizedConstituency = normalizeStr(constituency).toLowerCase();
                if (existingConstituencies.has(normalizedConstituency)) {
                    mappingSummary.constituencies.existing.push(constituency);
                } else {
                    mappingSummary.constituencies.unmatched.push(constituency);
                }
            });
        }

        // Check wards against kenya_wards table
        if (uniqueKenyaWards.size > 0) {
            const wardList = Array.from(uniqueKenyaWards);
            const [allWards] = await connection.query(
                `SELECT DISTINCT iebc_ward_name FROM kenya_wards WHERE iebc_ward_name IS NOT NULL AND iebc_ward_name != '' AND voided = false`
            );
            const existingWards = new Set();
            allWards.forEach(w => {
                if (w.iebc_ward_name) {
                    existingWards.add(normalizeStr(w.iebc_ward_name).toLowerCase());
                }
            });
            
            wardList.forEach(ward => {
                const normalizedWard = normalizeStr(ward).toLowerCase();
                if (existingWards.has(normalizedWard)) {
                    mappingSummary.kenyaWards.existing.push(ward);
                } else {
                    mappingSummary.kenyaWards.unmatched.push(ward);
                }
            });
        }

        // Check implementing agencies against agencies table
        if (uniqueImplementingAgencies.size > 0) {
            const agencyList = Array.from(uniqueImplementingAgencies);
            const [allAgencies] = await connection.query(
                `SELECT agency_name FROM agencies WHERE voided = false`
            );
            const existingAgencies = new Set();
            allAgencies.forEach(a => {
                if (a.agency_name) {
                    existingAgencies.add(normalizeStr(a.agency_name).toLowerCase());
                }
            });
            
            agencyList.forEach(agency => {
                const normalizedAgency = normalizeStr(agency).toLowerCase();
                if (existingAgencies.has(normalizedAgency)) {
                    mappingSummary.implementingAgencies.existing.push(agency);
                } else {
                    mappingSummary.implementingAgencies.unmatched.push(agency);
                }
            });
        }

        // Check financial years (with flexible matching for formats like "FY2014/2015", "fy2014/2015", "2014/2015", "2014-2015", "fy 2014-2015")
        if (uniqueFinancialYears.size > 0) {
            const fyList = Array.from(uniqueFinancialYears);
            // Get all financial years and do flexible matching (exclude voided)
            const [allFYs] = await connection.query(
                `SELECT finYearName FROM kemri_financialyears WHERE (voided IS NULL OR voided = 0)`
            );
            
            // Normalize financial year name: strip FY prefix, normalize separators to slash, lowercase
            // Also handles concatenated years like "20232024" -> "2023/2024"
            const normalizeFinancialYear = (name, trackCorrections = false) => {
                if (!name) return trackCorrections ? { normalized: '', corrected: false, originalValue: '' } : '';
                
                const originalValue = String(name).trim();
                
                // Convert to string if not already, and normalize
                let strValue = '';
                if (typeof name === 'string') {
                    strValue = name.trim();
                } else {
                    strValue = String(name || '').trim();
                }
                
                if (!strValue) return trackCorrections ? { normalized: '', corrected: false, originalValue: originalValue } : '';
                
                let normalized = strValue.toLowerCase();
                let wasCorrected = false;
                
                // Check for concatenated years like "20232024" (8 digits) or "2023-2024" (without separator)
                // Pattern: 4 digits followed by 4 digits (e.g., "20232024")
                const concatenatedMatch = normalized.match(/^(\d{4})(\d{4})$/);
                if (concatenatedMatch) {
                    const year1 = concatenatedMatch[1];
                    const year2 = concatenatedMatch[2];
                    // Validate years are reasonable (1900-2100 range and consecutive)
                    const y1 = parseInt(year1, 10);
                    const y2 = parseInt(year2, 10);
                    if (y1 >= 1900 && y1 <= 2100 && y2 >= 1900 && y2 <= 2100 && y2 === y1 + 1) {
                        normalized = `${year1}/${year2}`;
                        wasCorrected = true;
                    }
                }
                
                // Remove FY or fy prefix (with optional space)
                normalized = normalized.replace(/^fy\s*/i, '');
                // Normalize all separators (space, dash) to slash
                normalized = normalized.replace(/[\s\-]/g, '/');
                // Remove any extra slashes
                normalized = normalized.replace(/\/+/g, '/');
                const finalNormalized = normalized.trim();
                
                if (trackCorrections && wasCorrected) {
                    return {
                        normalized: finalNormalized,
                        corrected: true,
                        originalValue: originalValue,
                        correctionMessage: `Financial year corrected from "${originalValue}" to "${finalNormalized}" (concatenated years split)`
                    };
                }
                
                return trackCorrections ? {
                    normalized: finalNormalized,
                    corrected: false,
                    originalValue: originalValue,
                    correctionMessage: null
                } : finalNormalized;
            };
            
            // Create a map: normalized year (e.g., "2014/2015") -> actual database name (e.g., "FY2014/2015")
            const fyNormalizedMap = new Map();
            
            allFYs.forEach(fy => {
                if (fy.finYearName) {
                    const normalized = normalizeFinancialYear(fy.finYearName);
                    // Store the normalized version pointing to the actual database name
                    fyNormalizedMap.set(normalized, fy.finYearName);
                }
            });
            
            fyList.forEach(fy => {
                const normalizedFY = normalizeFinancialYear(fy);
                let found = false;
                
                // Check if normalized version exists in database
                if (normalizedFY && fyNormalizedMap.has(normalizedFY)) {
                    mappingSummary.financialYears.existing.push(fy);
                    found = true;
                }
                
                if (!found) {
                    mappingSummary.financialYears.new.push(fy);
                }
            });
        }

        // Identify rows with unmatched metadata (for warnings)
        dataToImport.forEach((row, index) => {
            // Skip rows where project name is empty, null, or has less than 3 characters
            const projectName = (row.projectName || row.Project_Name || row['Project Name'] || '').toString().trim();
            if (!projectName || projectName.length < 3) {
                return; // Skip this row
            }
            
            const dept = normalizeStr(row.department || row.Department);
            const ward = normalizeStr(row.ward || row.Ward || row['Ward Name']);
            const subcounty = normalizeStr(row['sub-county'] || row.SubCounty || row['Sub County'] || row.Subcounty);
            const finYear = normalizeStr(row.financialYear || row.FinancialYear || row['Financial Year'] || row.ADP || row.Year);
            const county = normalizeStr(row.county || row.County || row['County']);
            const constituency = normalizeStr(row.constituency || row.Constituency || row['Constituency']);
            const kenyaWard = normalizeStr(row.ward || row.Ward || row['Ward Name'] || row['Kenya Ward']);
            const implementingAgency = normalizeStr(row.implementingAgency || row['Implementing Agency'] || row.implementing_agency || row.directorate || row.Directorate);
            const sector = normalizeStr(row.sector || row.Sector);
            const ministry = normalizeStr(row.ministry || row.Ministry || row['Ministry Name']);
            const stateDepartment = normalizeStr(row.stateDepartment || row.state_department || row['State Department'] || row['State Department Name']);
            
            const unmatched = [];
            if (dept && mappingSummary.departments.new.includes(dept)) {
                unmatched.push(`Department: ${dept}`);
            }
            if (ward && mappingSummary.wards.new.includes(ward)) {
                unmatched.push(`Ward: ${ward}`);
            }
            if (subcounty && mappingSummary.subcounties.new.includes(subcounty)) {
                unmatched.push(`Sub-county: ${subcounty}`);
            }
            if (finYear && mappingSummary.financialYears.new.includes(finYear)) {
                unmatched.push(`Financial Year: ${finYear}`);
            }
            if (county && mappingSummary.counties.unmatched.includes(county)) {
                unmatched.push(`County: ${county}`);
            }
            if (constituency && mappingSummary.constituencies.unmatched.includes(constituency)) {
                unmatched.push(`Constituency: ${constituency}`);
            }
            if (kenyaWard && mappingSummary.kenyaWards.unmatched.includes(kenyaWard)) {
                unmatched.push(`Ward: ${kenyaWard}`);
            }
            if (implementingAgency && mappingSummary.implementingAgencies.unmatched.includes(implementingAgency)) {
                unmatched.push(`Implementing Agency: ${implementingAgency}`);
            }
            if (sector && mappingSummary.sectors.unmatched.includes(sector)) {
                unmatched.push(`Sector: ${sector}`);
            }
            if (ministry && mappingSummary.ministries.unmatched.includes(ministry)) {
                unmatched.push(`Ministry: ${ministry}`);
            }
            if (stateDepartment && mappingSummary.stateDepartments.unmatched.includes(stateDepartment)) {
                unmatched.push(`State Department: ${stateDepartment}`);
            }
            
            if (unmatched.length > 0) {
                mappingSummary.rowsWithUnmatchedMetadata.push({
                    rowNumber: index + 2, // +2 because index is 0-based and Excel rows start at 2 (header + 1)
                    projectName: normalizeStr(row.projectName || row.Project_Name || row['Project Name']) || 
                                `Row ${index + 2}`,
                    unmatched: unmatched
                });
            }
        });

        return res.status(200).json({
            success: true,
            message: 'Metadata mapping check completed',
            mappingSummary
        });
    } catch (err) {
        console.error('Metadata mapping check error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to check metadata mappings',
            error: err.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

/**
 * @route POST /api/projects/confirm-import-data
 * @description Confirm and import project data
 */

//========================================
router.post('/confirm-import-data', async (req, res) => {
    const { dataToImport, importContext } = req.body || {};
    if (!dataToImport || !Array.isArray(dataToImport) || dataToImport.length === 0) {
        return res.status(400).json({ success: false, message: 'No data provided for import confirmation.' });
    }

    // Debug: log how many rows the backend actually received for confirmation
    console.log(`[projects/confirm-import-data] Received ${dataToImport.length} rows to import`);

    // PostgreSQL table and column names
    const projectsTable = 'projects';
    const projectIdColumn = 'project_id';
    const voidedCondition = 'voided = false';

    const toBool = (v) => {
        if (typeof v === 'number') return v !== 0;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            return ['1','true','yes','y','contracted'].includes(s);
        }
        return false;
    };

    // Enhanced normalization: trim, normalize spaces/slashes, handle apostrophes, collapse multiple spaces
    const normalizeStr = (v) => {
        if (typeof v !== 'string') return v;
        let normalized = v.trim();
        // Remove apostrophes (handle different apostrophe characters: ', ', ', `, and Unicode variants)
        // Use a more comprehensive pattern to catch all apostrophe-like characters
        normalized = normalized.replace(/[''"`\u0027\u2018\u2019\u201A\u201B\u2032\u2035]/g, '');
        // Normalize slashes: remove spaces around existing slashes
        normalized = normalized.replace(/\s*\/\s*/g, '/');
        // Collapse multiple spaces to single space
        normalized = normalized.replace(/\s+/g, ' ');
        // Don't automatically convert spaces to slashes - this causes issues with names like "Kisumu Central"
        // The matching logic will handle both space and slash variations
        return normalized;
    };

    // Normalize alias for matching: remove &, commas, and spaces, then lowercase
    // This allows "WECV&NR", "WECVNR", "WE,CV,NR" to all match
    const normalizeAlias = (v) => {
        if (typeof v !== 'string') return v;
        return normalizeStr(v)
            .replace(/[&,]/g, '')  // Remove ampersands and commas
            .replace(/\s+/g, '')   // Remove all spaces
            .toLowerCase();         // Lowercase for case-insensitive matching
    };

    // Same catalog-key rules as POST /check-metadata-mapping so preview "Matched" matches confirm.
    const normalizeCatalogKey = (v) => {
        if (typeof v !== 'string') return '';
        return normalizeStr(v)
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\bministry\s+of\b/g, ' ')
            .replace(/\bstate\s+department\b/g, ' ')
            .replace(/\bdepartment\b/g, ' ')
            .replace(/\bfor\b/g, ' ')
            .replace(/\bof\b/g, ' ')
            .replace(/\bthe\b/g, ' ')
            .replace(/\band\b/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const buildCatalogKeys = (value) => {
        const base = normalizeCatalogKey(value);
        if (!base) return [];
        const compact = base.replace(/\s+/g, '');
        return Array.from(new Set([base, compact].filter(Boolean)));
    };

    let connection;
    const batchProjectMap = new Map(); // Track projects processed in this batch to prevent duplicates
    const summary = { 
        projectsCreated: 0, 
        projectsUpdated: 0, 
        linksCreated: 0, 
        errors: [],
        dataCorrections: [], // Track date and financial year corrections
        skippedRowsInvalidScopeMetadata: [],
        sectorClearedRows: [],
        skippedMetadata: {
            departments: [],
            directorates: []
        }
    };

    // Helper function to normalize query results for PostgreSQL
    const getQueryRows = (result) => {
        return result.rows || [];
    };

    const buildImportCatalogLookupSet = (rows, nameField = 'name', aliasField = 'alias') => {
        const set = new Set();
        (rows || []).forEach((r) => {
            const nm = r?.[nameField];
            if (nm && typeof nm === 'string') {
                const lowered = normalizeStr(nm).toLowerCase();
                if (lowered) set.add(lowered);
                buildCatalogKeys(nm).forEach((k) => set.add(k));
            }
            const al = r?.[aliasField];
            if (al && typeof al === 'string') {
                const fullAlias = normalizeStr(al).toLowerCase();
                if (fullAlias) set.add(fullAlias);
                const normalizedAlias = normalizeAlias(al);
                if (normalizedAlias) set.add(normalizedAlias);
                String(al)
                    .split(',')
                    .map((a) => normalizeStr(a))
                    .filter(Boolean)
                    .forEach((piece) => {
                        set.add(piece.toLowerCase());
                        buildCatalogKeys(piece).forEach((k) => set.add(k));
                    });
            }
        });
        return set;
    };

    const matchesImportCatalogMetadata = (value, set) => {
        if (!value || typeof value !== 'string') return false;
        const normalized = normalizeStr(value).toLowerCase();
        const normalizedAlias = normalizeAlias(value);
        const catalogKeys = buildCatalogKeys(value);
        return (
            set.has(normalized) ||
            set.has(normalizedAlias) ||
            catalogKeys.some((k) => set.has(k))
        );
    };

    // Helper function to update project in PostgreSQL with JSONB structure
    const updateProjectInPostgreSQL = async (connection, projectId, projectPayload, departmentId, sectionId, locationData = null) => {
        // Get department and section names if IDs are available
        let ministry = projectPayload.ministry || null;
        let stateDepartment = projectPayload.stateDepartment || null;
        
        if (!ministry && departmentId) {
            const deptResult = await connection.query(
                'SELECT name FROM kemri_departments WHERE departmentId = $1 AND (voided IS NULL OR voided = false)',
                [departmentId]
            );
            const deptRows = getQueryRows(deptResult);
            if (deptRows.length > 0) {
                ministry = deptRows[0].name;
            }
        }
        
        if (!stateDepartment && sectionId) {
            const sectionResult = await connection.query(
                'SELECT name FROM kemri_sections WHERE sectionId = $1 AND (voided IS NULL OR voided = false)',
                [sectionId]
            );
            const sectionRows = getQueryRows(sectionResult);
            if (sectionRows.length > 0) {
                stateDepartment = sectionRows[0].name;
            }
        }

        // Build JSONB objects for update
        const timeline = JSON.stringify({
            start_date: projectPayload.startDate || null,
            expected_completion_date: projectPayload.endDate || null
        });

        const budget = JSON.stringify({
            allocated_amount_kes: projectPayload.costOfProject || null,
            disbursed_amount_kes: projectPayload.paidOut || null,
            contracted: projectPayload.Contracted || null,
            source: projectPayload.budgetSource || null
        });

        const progress = JSON.stringify({
            status: projectPayload.status || null,
            percentage_complete: projectPayload.percentageComplete || null,
            latest_update_summary: projectPayload.latestUpdateSummary || null
        });

        // Build data_sources JSONB - preserve existing sources and add new ones if provided
        let dataSourcesObj = {
            created_by_user_id: 1 // TODO: Get from authenticated user
        };
        // Get existing data_sources to preserve them
        const existingDataSourcesResult = await connection.query(
            'SELECT data_sources FROM projects WHERE project_id = $1 AND voided = false',
            [projectId]
        );
        if (existingDataSourcesResult.rows.length > 0 && existingDataSourcesResult.rows[0].data_sources) {
            const existing = existingDataSourcesResult.rows[0].data_sources;
            if (existing.created_by_user_id) dataSourcesObj.created_by_user_id = existing.created_by_user_id;
            if (existing.project_ref_num) dataSourcesObj.project_ref_num = existing.project_ref_num;
            if (existing.sources && Array.isArray(existing.sources)) {
                dataSourcesObj.sources = existing.sources;
            }
        }
        // Add new data sources if provided
        if (projectPayload.dataSources && Array.isArray(projectPayload.dataSources) && projectPayload.dataSources.length > 0) {
            if (!dataSourcesObj.sources) dataSourcesObj.sources = [];
            // Merge new sources with existing ones, avoiding duplicates
            const existingSources = dataSourcesObj.sources || [];
            projectPayload.dataSources.forEach(source => {
                if (!existingSources.includes(source)) {
                    existingSources.push(source);
                }
            });
            dataSourcesObj.sources = existingSources;
        }
        const dataSources = JSON.stringify(dataSourcesObj);

        // Build location JSONB - use provided locationData or get existing location and merge
        let location = null;
        if (locationData) {
            const locationObj = {
                county: locationData.county && locationData.county.trim() !== '' ? locationData.county.trim() : null,
                constituency: locationData.constituency && locationData.constituency.trim() !== '' ? locationData.constituency.trim() : null,
                ward: locationData.ward && locationData.ward.trim() !== '' ? locationData.ward.trim() : null
            };
            // Add geocoordinates if provided
            if (locationData.geocoordinates && (locationData.geocoordinates.lat != null || locationData.geocoordinates.lng != null)) {
                locationObj.geocoordinates = {
                    lat: locationData.geocoordinates.lat,
                    lng: locationData.geocoordinates.lng
                };
            }
            location = JSON.stringify(locationObj);
        } else {
            // Get existing location and preserve it
            const existingLocationResult = await connection.query(
                'SELECT location FROM projects WHERE project_id = $1 AND voided = false',
                [projectId]
            );
            if (existingLocationResult.rows.length > 0 && existingLocationResult.rows[0].location) {
                location = JSON.stringify(existingLocationResult.rows[0].location);
            }
        }
        
        // Build public_engagement JSONB - preserve existing and update with new values
        let publicEngagementObj = {};
        const existingPublicEngagementResult = await connection.query(
            'SELECT public_engagement FROM projects WHERE project_id = $1 AND voided = false',
            [projectId]
        );
        if (existingPublicEngagementResult.rows.length > 0 && existingPublicEngagementResult.rows[0].public_engagement) {
            publicEngagementObj = { ...existingPublicEngagementResult.rows[0].public_engagement };
        }
        // Update with new values if provided
        if (projectPayload.feedbackEnabled !== undefined) {
            publicEngagementObj.feedback_enabled = projectPayload.feedbackEnabled;
        }
        if (projectPayload.complaintsReceived !== undefined && projectPayload.complaintsReceived !== null) {
            publicEngagementObj.complaints_received = projectPayload.complaintsReceived;
        }
        if (projectPayload.commonFeedback !== undefined && projectPayload.commonFeedback !== null) {
            publicEngagementObj.common_feedback = projectPayload.commonFeedback;
        }
        const publicEngagement = JSON.stringify(publicEngagementObj);

        // Update project using JSONB structure
        const updateQuery = `
            UPDATE projects SET
                name = $1,
                description = $2,
                implementing_agency = $3,
                sector = $4,
                ministry = $5,
                state_department = $6,
                timeline = $7::jsonb,
                budget = $8::jsonb,
                progress = $9::jsonb,
                data_sources = $10::jsonb,
                public_engagement = $11::jsonb,
                ${location ? 'location = $12::jsonb,' : ''}
                updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ${location ? '$13' : '$12'} AND voided = false
        `;
        
        const updateParams = [
            projectPayload.projectName,
            projectPayload.projectDescription,
            projectPayload.implementing_agency || projectPayload.directorate,
            projectPayload.sector,
            ministry,
            stateDepartment,
            timeline,
            budget,
            progress,
            dataSources,
            publicEngagement
        ];
        
        if (location) {
            updateParams.push(location);
        }
        updateParams.push(projectId);
        
        await connection.query(updateQuery, updateParams);
    };

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Metadata used to enforce import behavior:
        // - Ministry + State Department: if provided and not mapped, skip row.
        // - Sector: if provided and not mapped, import row but clear sector.
        const ministriesResult = await connection.query(
            `SELECT name, alias FROM ministries WHERE COALESCE(voided, false) = false`
        );
        const departmentsResult = await connection.query(
            `SELECT name, alias FROM departments WHERE COALESCE(voided, false) = false`
        );
        const sectorsResult = await connection.query(
            `SELECT name, alias FROM sectors WHERE COALESCE(voided, false) = false`
        );
        const ministryLookup = buildImportCatalogLookupSet(getQueryRows(ministriesResult), 'name', 'alias');
        const stateDepartmentLookup = buildImportCatalogLookupSet(getQueryRows(departmentsResult), 'name', 'alias');
        const sectorLookup = buildImportCatalogLookupSet(getQueryRows(sectorsResult), 'name', 'alias');

        for (let i = 0; i < dataToImport.length; i++) {
            const row = dataToImport[i] || {};
            // Use savepoint for each row so we can rollback just this row if it fails
            const savepointName = `sp_row_${i}`;
            try {
                await connection.query(`SAVEPOINT ${savepointName}`);
                const projectName = normalizeStr(row.projectName || row.Project_Name || row['Project Name']);
                
                // Skip rows where project name is empty, null, or has less than 3 characters
                const projectNameStr = (projectName || '').toString().trim();
                if (!projectNameStr || projectNameStr.length < 3) {
                    continue; // Skip this row
                }
                
                if (!projectName) {
                    throw new Error('Missing projectName');
                }

                // Resolve departmentId by name or alias (DO NOT create if missing) - case-insensitive
                const departmentName = normalizeStr(row.department || row.Department);
                let departmentId = null;
                if (departmentName) {
                    // Get all departments and check manually (to handle comma-separated aliases properly)
                    const deptResult = await connection.query(
                        `SELECT departmentId, name, alias FROM kemri_departments 
                         WHERE (voided IS NULL OR voided = false)`
                    );
                    const allDepts = getQueryRows(deptResult);
                    const normalizedDeptName = departmentName.toLowerCase(); // Case-insensitive matching
                    let found = false;
                    for (const dept of allDepts) {
                        // Check name (case-insensitive)
                        if (dept.name && normalizeStr(dept.name).toLowerCase() === normalizedDeptName) {
                            departmentId = dept.departmentId;
                            found = true;
                            break;
                        }
                        // Check alias - both full alias and split parts (case-insensitive)
                        // Also check with alias normalization (ignoring &, commas, spaces)
                        if (dept.alias) {
                            const fullAlias = normalizeStr(dept.alias).toLowerCase();
                            const normalizedAlias = normalizeAlias(dept.alias);
                            const normalizedDeptAlias = normalizeAlias(departmentName);
                            
                            if (fullAlias === normalizedDeptName || normalizedAlias === normalizedDeptAlias) {
                                departmentId = dept.departmentId;
                                found = true;
                                break;
                            }
                            // Check split aliases (case-insensitive)
                            const aliases = dept.alias.split(',').map(a => normalizeStr(a).toLowerCase());
                            if (aliases.includes(normalizedDeptName)) {
                                departmentId = dept.departmentId;
                                found = true;
                                break;
                            }
                        }
                    }
                    if (!found) {
                        // Track skipped metadata
                        if (!summary.skippedMetadata.departments.includes(departmentName)) {
                            summary.skippedMetadata.departments.push(departmentName);
                        }
                    }
                }

                // Resolve sectionId (directorate) by name or alias (DO NOT create if missing) - case-insensitive
                const directorateName = normalizeStr(row.directorate || row.Directorate);
                let sectionId = null;
                if (directorateName) {
                    // Get all sections and check manually (to handle comma-separated aliases properly)
                    const sectionResult = await connection.query(
                        `SELECT sectionId, name, alias, departmentId FROM kemri_sections 
                         WHERE (voided IS NULL OR voided = false)`
                    );
                    const allSections = getQueryRows(sectionResult);
                    const normalizedDirName = directorateName.toLowerCase(); // Case-insensitive matching
                    let matchingSections = [];
                    
                    for (const section of allSections) {
                        let matches = false;
                        // Check name (case-insensitive)
                        if (section.name && normalizeStr(section.name).toLowerCase() === normalizedDirName) {
                            matches = true;
                        }
                        // Check alias - both full alias and split parts (case-insensitive)
                        // Also check with alias normalization (ignoring &, commas, spaces)
                        if (!matches && section.alias) {
                            const fullAlias = normalizeStr(section.alias).toLowerCase();
                            const normalizedAlias = normalizeAlias(section.alias);
                            const normalizedDirAlias = normalizeAlias(directorateName);
                            
                            if (fullAlias === normalizedDirName || normalizedAlias === normalizedDirAlias) {
                                matches = true;
                            } else {
                                // Check split aliases (case-insensitive)
                                const aliases = section.alias.split(',').map(a => normalizeStr(a).toLowerCase());
                                if (aliases.includes(normalizedDirName)) {
                                    matches = true;
                                }
                            }
                        }
                        
                        if (matches) {
                            matchingSections.push(section);
                        }
                    }
                    
                    if (matchingSections.length > 0) {
                        // If we have a departmentId, prefer sections that belong to that department
                        if (departmentId) {
                            const matchingInDept = matchingSections.find(s => s.departmentId === departmentId);
                            if (matchingInDept) {
                                sectionId = matchingInDept.sectionId;
                            } else {
                                // If no match in department, use the first matching section
                                sectionId = matchingSections[0].sectionId;
                            }
                        } else {
                            // No departmentId, use the first matching section
                            sectionId = matchingSections[0].sectionId;
                        }
                    } else {
                        // Track skipped metadata
                        if (!summary.skippedMetadata.directorates.includes(directorateName)) {
                            summary.skippedMetadata.directorates.push(directorateName);
                        }
                    }
                }

                // Financial years are no longer saved - removed from template

                // Prepare project payload
                const toMoney = (v) => {
                    if (v == null || v === '') return null;
                    const cleaned = String(v).replace(/,/g, '').trim();
                    if (!cleaned) return null;
                    const num = Number(cleaned);
                    return isNaN(num) ? null : num;
                };
                // Ensure dates are in YYYY-MM-DD format - track corrections
                const normalizeDate = (dateValue, fieldName) => {
                    if (!dateValue) return { date: null, corrected: false };
                    try {
                        // If already in YYYY-MM-DD format, return as-is
                        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
                            return { date: dateValue.split(' ')[0], corrected: false }; // Take only date part if there's time
                        }
                        // Try to parse if it's a date string or object
                        const parsed = parseDateToYMD(dateValue, true);
                        // Validate the parsed date is in correct format
                        if (parsed && parsed.date && typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
                            if (parsed.corrected) {
                                summary.dataCorrections.push({
                                    row: i + 2,
                                    field: fieldName,
                                    originalValue: parsed.originalValue,
                                    correctedValue: parsed.date,
                                    message: parsed.correctionMessage
                                });
                            }
                            return { date: parsed.date, corrected: parsed.corrected };
                        }
                        // If parsing failed or returned invalid format, return null
                        return { date: null, corrected: false };
                    } catch (dateErr) {
                        console.warn(`Date parsing error for value "${dateValue}":`, dateErr.message);
                        return { date: null, corrected: false };
                    }
                };
                // Helper to parse boolean values
                const toBool = (v) => {
                    if (typeof v === 'number') return v !== 0;
                    if (typeof v === 'boolean') return v;
                    if (typeof v === 'string') {
                        const s = v.trim().toLowerCase();
                        return ['1','true','yes','y'].includes(s);
                    }
                    return false;
                };
                
                // Helper to parse number (for percentage, complaints, etc.)
                const toNumber = (v) => {
                    if (v == null || v === '') return null;
                    const cleaned = String(v).replace(/,/g, '').trim();
                    if (!cleaned) return null;
                    const num = Number(cleaned);
                    return isNaN(num) ? null : num;
                };
                
                // Helper to parse JSON array or string
                const parseDataSources = (v) => {
                    if (!v || v === '') return null;
                    if (typeof v === 'string') {
                        try {
                            // Try to parse as JSON array
                            const parsed = JSON.parse(v);
                            return Array.isArray(parsed) ? parsed : [parsed];
                        } catch (e) {
                            // If not valid JSON, treat as comma-separated string
                            return v.split(',').map(s => s.trim()).filter(s => s);
                        }
                    }
                    if (Array.isArray(v)) return v;
                    return null;
                };
                
                const projectPayload = {
                    projectName: projectName || null,
                    projectDescription: normalizeStr(row.ProjectDescription || row.Description) || null,
                    status: normalizeStr(row.Status) || null,
                    costOfProject: toMoney(row.budget),
                    paidOut: toMoney(row.Disbursed || row.amountPaid), // Support both Disbursed and amountPaid
                    startDate: normalizeDate(row.StartDate, 'StartDate').date,
                    endDate: normalizeDate(row.EndDate, 'EndDate').date,
                    directorate: normalizeStr(row.directorate || row.Directorate) || null,
                    sector: normalizeStr(row.sector || row.Sector) || null,
                    implementing_agency: normalizeStr(row.implementing_agency || row.implementingAgency || row['implementing Agency'] || row['Implementing Agency'] || row.agency || row.Agency) || null,
                    ministry: normalizeStr(row.ministry || row.Ministry || row['Ministry Name']) || null,
                    stateDepartment: normalizeStr(row.state_department || row.stateDepartment || row['State Department'] || row['State Department Name']) || null,
                    sectionId: (sectionId != null && !isNaN(sectionId)) ? sectionId : null, // Store sectionId when directorate is resolved
                    departmentId: (departmentId != null && !isNaN(departmentId)) ? departmentId : null,
                    Contracted: toMoney(row.Contracted),
                    // New fields from projects_upload_template.xlsx
                    budgetSource: normalizeStr(row.BudgetSource || row.budgetSource) || null,
                    percentageComplete: toNumber(row.PercentageComplete || row.percentageComplete),
                    latestUpdateSummary: normalizeStr(row.LatestUpdateSummary || row.latestUpdateSummary) || null,
                    feedbackEnabled: toBool(row.FeedbackEnabled || row.feedbackEnabled),
                    complaintsReceived: toNumber(row.ComplaintsReceived || row.complaintsReceived),
                    commonFeedback: normalizeStr(row.CommonFeedback || row.commonFeedback) || null,
                    dataSources: parseDataSources(row.DataSources || row.dataSources),
                    lastUpdated: normalizeDate(row.LastUpdated, 'LastUpdated').date,
                    latitude: toNumber(row.Latitude || row.latitude),
                    longitude: toNumber(row.Longitude || row.longitude),
                };
                
                // Remove any properties with NaN values to prevent MySQL errors
                Object.keys(projectPayload).forEach(key => {
                    const value = projectPayload[key];
                    if (value !== null && typeof value === 'number' && isNaN(value)) {
                        console.warn(`Row ${i + 2}: Removing NaN value for field "${key}"`);
                        projectPayload[key] = null;
                    }
                });

                const importedMinistry = normalizeStr(row.ministry || row.Ministry || row['Ministry Name']) || null;
                const importedStateDepartment = normalizeStr(row.state_department || row.stateDepartment || row['State Department'] || row['State Department Name']) || null;
                const importedSector = normalizeStr(row.sector || row.Sector) || null;

                // Registry/scoping depends on ministry + state_department quality.
                // If one/both are provided but not mapped in metadata, skip the entire row.
                const hasScopeMetadataInput = Boolean(importedMinistry || importedStateDepartment);
                if (hasScopeMetadataInput) {
                    const ministryBad = importedMinistry && !matchesImportCatalogMetadata(importedMinistry, ministryLookup);
                    const stateDepartmentBad =
                        importedStateDepartment && !matchesImportCatalogMetadata(importedStateDepartment, stateDepartmentLookup);
                    if (ministryBad || stateDepartmentBad) {
                        const reasonParts = [];
                        if (ministryBad) reasonParts.push(`Ministry "${importedMinistry || '(blank)'}" not mapped`);
                        if (stateDepartmentBad) reasonParts.push(`State Department "${importedStateDepartment || '(blank)'}" not mapped`);
                        summary.skippedRowsInvalidScopeMetadata.push({
                            rowNumber: i + 2,
                            projectName: projectPayload.projectName || `Row ${i + 2}`,
                            reason: reasonParts.join('; ')
                        });
                        continue;
                    }
                }

                // Sector mismatch should not block import; clear it and report.
                if (importedSector && !matchesImportCatalogMetadata(importedSector, sectorLookup)) {
                    summary.sectorClearedRows.push({
                        rowNumber: i + 2,
                        projectName: projectPayload.projectName || `Row ${i + 2}`,
                        providedSector: importedSector
                    });
                    projectPayload.sector = null;
                }

                // Extract location data from row (county, constituency, ward, latitude, longitude) for updates
                const countyName = normalizeStr(row.County || row.county || row['County Name']);
                const constituencyName = normalizeStr(row.Constituency || row.constituency || row['Constituency Name']);
                const wardName = normalizeStr(row.ward || row.Ward || row['Ward Name']);
                const locationData = {
                    county: countyName,
                    constituency: constituencyName,
                    ward: wardName,
                    geocoordinates: {
                        lat: projectPayload.latitude,
                        lng: projectPayload.longitude
                    }
                };

                // Upsert by projectName
                // Check batch map first to avoid duplicate inserts within same batch
                const batchKey = projectPayload.projectName 
                    ? `name:${normalizeStr(projectPayload.projectName).toLowerCase()}`
                    : null;
                
                let projectId = null;
                
                // Check if we've already processed this project in this batch
                if (batchKey && batchProjectMap.has(batchKey)) {
                    projectId = batchProjectMap.get(batchKey);
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`Row ${i + 2}: Project already processed in this batch (${batchKey}), reusing projectId: ${projectId}`);
                    }
                }
                
                // Check database if not found in batch map - lookup by projectName
                if (!projectId && projectPayload.projectName) {
                    const nameColumn = 'name';
                    const existByNameResult = await connection.query(
                        `SELECT ${projectIdColumn} FROM ${projectsTable} WHERE ${nameColumn} = $1 AND ${voidedCondition}`, 
                        [projectPayload.projectName]
                    );
                    const rows = getQueryRows(existByNameResult);
                    if (rows.length > 0) {
                        projectId = rows[0][projectIdColumn];
                        // Log payload for debugging if there are issues
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`Row ${i + 2}: Updating project ${projectId} with payload:`, JSON.stringify(projectPayload, null, 2));
                        }
                        // Update existing project with JSONB structure including location
                        await updateProjectInPostgreSQL(connection, projectId, projectPayload, departmentId, sectionId, locationData);
                        summary.projectsUpdated++;
                        if (batchKey) {
                            batchProjectMap.set(batchKey, projectId);
                        }
                    }
                }
                if (!projectId) {
                    // Log payload for debugging if there are issues
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`Row ${i + 2}: Inserting new project with payload:`, JSON.stringify(projectPayload, null, 2));
                    }
                    try {
                        // Extract location data from row (county, constituency, ward)
                        const countyName = normalizeStr(row.County || row.county || row['County Name']);
                        const constituencyName = normalizeStr(row.Constituency || row.constituency || row['Constituency Name']);
                        const wardName = normalizeStr(row.ward || row.Ward || row['Ward Name']);

                        // Build JSONB objects for PostgreSQL projects table
                        const timeline = JSON.stringify({
                            start_date: projectPayload.startDate || null,
                            expected_completion_date: projectPayload.endDate || null
                        });

                        const budget = JSON.stringify({
                            allocated_amount_kes: projectPayload.costOfProject || null,
                            disbursed_amount_kes: projectPayload.paidOut || null,
                            contracted: projectPayload.Contracted || null,
                            source: projectPayload.budgetSource || null
                        });

                        const progress = JSON.stringify({
                            status: projectPayload.status || null,
                            percentage_complete: projectPayload.percentageComplete || null,
                            latest_update_summary: projectPayload.latestUpdateSummary || null
                        });

                        const notes = JSON.stringify({
                            objective: null,
                            expected_output: null,
                            expected_outcome: null,
                            program_id: null,
                            subprogram_id: null
                        });

                        // Build data_sources JSONB - include imported data sources if provided
                        const dataSourcesObj = {
                            created_by_user_id: 1, // TODO: Get from authenticated user
                            project_ref_num: null
                        };
                        // If dataSources array is provided, add it to the object
                        if (projectPayload.dataSources && Array.isArray(projectPayload.dataSources) && projectPayload.dataSources.length > 0) {
                            dataSourcesObj.sources = projectPayload.dataSources;
                        }
                        const dataSources = JSON.stringify(dataSourcesObj);

                        const publicEngagement = JSON.stringify({
                            feedback_enabled: projectPayload.feedbackEnabled || false,
                            complaints_received: projectPayload.complaintsReceived || 0,
                            common_feedback: projectPayload.commonFeedback || null
                        });

                        // Store location data in location JSONB field (county, constituency, ward, geocoordinates)
                        const locationObj = {
                            county: countyName && countyName.trim() !== '' ? countyName.trim() : null,
                            constituency: constituencyName && constituencyName.trim() !== '' ? constituencyName.trim() : null,
                            ward: wardName && wardName.trim() !== '' ? wardName.trim() : null
                        };
                        // Add geocoordinates if latitude and longitude are provided
                        if (projectPayload.latitude != null && projectPayload.longitude != null) {
                            locationObj.geocoordinates = {
                                lat: projectPayload.latitude,
                                lng: projectPayload.longitude
                            };
                        }
                        const location = JSON.stringify(locationObj);

                        // Build is_public JSONB with default approval structure
                        const isPublic = JSON.stringify({
                            approved: false,
                            approved_by: null,
                            approved_at: null,
                            approval_notes: null,
                            revision_requested: false,
                            revision_notes: null,
                            revision_requested_by: null,
                            revision_requested_at: null,
                            revision_submitted_at: null
                        });

                        // Get department and section names if IDs are available
                        let ministry = projectPayload.ministry || null;
                        let stateDepartment = projectPayload.stateDepartment || null;
                        
                        if (!ministry && departmentId) {
                            const deptResult = await connection.query(
                                'SELECT name FROM kemri_departments WHERE departmentId = $1 AND (voided IS NULL OR voided = false)',
                                [departmentId]
                            );
                            const deptRows = getQueryRows(deptResult);
                            if (deptRows.length > 0) {
                                ministry = deptRows[0].name;
                            }
                        }
                        
                        if (!stateDepartment && sectionId) {
                            const sectionResult = await connection.query(
                                'SELECT name FROM kemri_sections WHERE sectionId = $1 AND (voided IS NULL OR voided = false)',
                                [sectionId]
                            );
                            const sectionRows = getQueryRows(sectionResult);
                            if (sectionRows.length > 0) {
                                stateDepartment = sectionRows[0].name;
                            }
                        }

                        // Insert into PostgreSQL projects table with JSONB structure
                        const insertQuery = `
                            INSERT INTO projects (
                                name, description, implementing_agency, sector, ministry, state_department,
                                timeline, budget, progress, notes, data_sources, public_engagement, location,
                                is_public, created_at, updated_at, voided
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
                            RETURNING project_id
                        `;
                        console.log('----------------------',insertQuery)
                        const insertResult = await connection.query(insertQuery, [
                            projectPayload.projectName,
                            projectPayload.projectDescription,
                            projectPayload.implementing_agency || projectPayload.directorate,
                            projectPayload.sector,
                            ministry,
                            stateDepartment,
                            timeline,
                            budget,
                            progress,
                            notes,
                            dataSources,
                            publicEngagement,
                            location,
                            isPublic
                        ]);

                        const insertRows = getQueryRows(insertResult);
                        projectId = insertRows[0]?.project_id;
                        
                        if (!projectId) {
                            throw new Error('Failed to get project_id after insert');
                        }

                        summary.projectsCreated++;
                        // Track in batch map
                        if (batchKey) {
                            batchProjectMap.set(batchKey, projectId);
                        }
                    } catch (insertErr) {
                        // Handle PostgreSQL duplicate key errors (code 23505)
                        if (insertErr.code === '23505' || 
                            (insertErr.message && insertErr.message.includes('duplicate key') && insertErr.message.includes('projects_pkey'))) {
                            console.warn(`Row ${i + 2}: Duplicate key detected, attempting to find existing project...`);
                            
                            // Try to find existing project by name
                            let findResult = null;
                            if (projectPayload.projectName) {
                                const nameColumn = 'name';
                                const result = await connection.query(
                                    `SELECT ${projectIdColumn} FROM ${projectsTable} WHERE ${nameColumn} = $1 AND ${voidedCondition} LIMIT 1`, 
                                    [projectPayload.projectName]
                                );
                                findResult = getQueryRows(result);
                            }
                            
                            if (findResult && findResult.length > 0) {
                                projectId = findResult[0][projectIdColumn];
                                console.log(`Row ${i + 2}: Found existing project ${projectId}, updating instead...`);
                                
                                // Update existing project with JSONB structure including location
                                // Location data was extracted earlier in the scope
                                await updateProjectInPostgreSQL(connection, projectId, projectPayload, departmentId, sectionId, locationData);
                                summary.projectsUpdated++;
                                // Track in batch map
                                if (batchKey) {
                                    batchProjectMap.set(batchKey, projectId);
                                }
                            } else {
                                // If we can't find it, this might be a sequence issue - log and rethrow
                                console.error(`Row ${i + 2}: Duplicate key error but could not find existing project. Error: ${insertErr.message}`);
                                throw new Error(`Duplicate key error on row ${i + 2}: ${insertErr.message}`);
                            }
                        } else {
                            // Re-throw if it's not a duplicate key error
                            throw insertErr;
                        }
                    }
                }

                // Location data is now stored in the location JSONB field of the projects table
                // No need to create project_sites entries anymore

            } catch (rowErr) {
                console.error(`Error processing row ${i + 2}:`, rowErr);
                const errorMsg = `Row ${i + 2}: ${rowErr.message || String(rowErr)}`;
                summary.errors.push(errorMsg);
                // Also log the full error for debugging
                if (rowErr.stack) {
                    console.error(`Row ${i + 2} error stack:`, rowErr.stack);
                }
                // Rollback to savepoint to undo this row's changes
                try {
                    await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                } catch (rollbackErr) {
                    console.error(`Error rolling back to savepoint for row ${i + 2}:`, rollbackErr);
                }
            }
        }

        if (summary.errors.length > 0) {
            await connection.rollback();
            console.error('Import failed with errors:', summary.errors);
            // Show first few errors in the main message for better visibility
            const errorPreview = summary.errors.slice(0, 5).join('; ');
            const errorMessage = summary.errors.length > 5 
                ? `Import failed with ${summary.errors.length} errors. First errors: ${errorPreview}...`
                : `Import failed with errors: ${errorPreview}`;
            return res.status(400).json({ 
                success: false, 
                message: errorMessage,
                details: { 
                    errors: summary.errors,
                    errorCount: summary.errors.length,
                    totalRows: dataToImport.length,
                    summary: {
                        projectsCreated: summary.projectsCreated,
                        projectsUpdated: summary.projectsUpdated,
                        linksCreated: summary.linksCreated
                    }
                } 
            });
        }

        await connection.commit();
        const rowsProcessed = summary.projectsCreated + summary.projectsUpdated;
        const rowsSkippedForScope = summary.skippedRowsInvalidScopeMetadata.length;
        
        // Build a message about skipped metadata
        const skippedMessages = [];
        if (summary.skippedMetadata.departments.length > 0) {
            skippedMessages.push(`${summary.skippedMetadata.departments.length} department(s): ${summary.skippedMetadata.departments.join(', ')}`);
        }
        if (summary.skippedMetadata.directorates.length > 0) {
            skippedMessages.push(`${summary.skippedMetadata.directorates.length} directorate(s): ${summary.skippedMetadata.directorates.join(', ')}`);
        }
        if (summary.skippedRowsInvalidScopeMetadata.length > 0) {
            skippedMessages.push(
                `${summary.skippedRowsInvalidScopeMetadata.length} row(s) skipped due to invalid Ministry/State Department metadata`
            );
        }
        if (summary.sectorClearedRows.length > 0) {
            skippedMessages.push(
                `${summary.sectorClearedRows.length} row(s) imported with blank sector because provided sector was not mapped`
            );
        }
        
        let message = 'Projects imported successfully';
        if (skippedMessages.length > 0) {
            message += `. Note: ${skippedMessages.join('; ')}. Please create/update metadata mappings in Metadata Management.`;
        }

        // If nothing was written, return a non-success response so UI does not claim records were saved.
        if (rowsProcessed === 0) {
            const failureMessage = rowsSkippedForScope > 0
                ? 'No projects were imported. All rows were skipped due to invalid Ministry/State Department mapping.'
                : 'No projects were imported. Please check your file data and mapping.';
            await recordProjectImportLog({
                req,
                importContext,
                summary,
                rowsProcessed,
                status: 'failed',
                message: failureMessage,
            });
            return res.status(400).json({
                success: false,
                message: failureMessage,
                details: {
                    ...summary,
                    totalRows: dataToImport.length,
                    rowsProcessed,
                    rowsSkippedForScope
                }
            });
        }

        await recordProjectImportLog({
            req,
            importContext,
            summary,
            rowsProcessed,
            status: 'success',
            message,
        });

        return res.status(200).json({
            success: true,
            message,
            details: {
                ...summary,
                totalRows: dataToImport.length,
                rowsProcessed,
                rowsSkippedForScope
            }
        });
    } catch (err) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error('Error during rollback:', rollbackErr.message);
            }
        }
        
        // Check if it's a connection/authentication error
        const isConnectionError = 
            err.code === 'ECONNREFUSED' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'ECONNRESET' ||
            err.code === '28P01' || // PostgreSQL authentication failure
            err.message?.includes('Connection terminated') ||
            err.message?.includes('Connection closed') ||
            err.message?.includes('password authentication failed');
        
        if (isConnectionError) {
            console.error('Project import failed due to database connection issue:', err.message);
            console.error('This may occur during long-running imports. The connection may have timed out.');
            await recordProjectImportLog({
                req,
                importContext,
                summary: {},
                rowsProcessed: 0,
                status: 'failed',
                message: 'Database connection error during import.',
            });
            return res.status(503).json({ 
                success: false, 
                message: 'Database connection error during import. This may occur with large imports. Please try again with a smaller batch or contact support.',
                details: { 
                    error: err.message,
                    suggestion: 'Try importing in smaller batches or wait a moment and retry'
                }
            });
        }
        
        console.error('Project import confirmation error:', err);
        await recordProjectImportLog({
            req,
            importContext,
            summary: {},
            rowsProcessed: 0,
            status: 'failed',
            message: err.message || 'Project import confirmation failed',
        });
        return res.status(500).json({ 
            success: false, 
            message: err.message || 'Failed to import projects',
            details: { error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined }
        });
    } finally {
        if (connection) {
            try {
                connection.release();
            } catch (releaseErr) {
                console.error('Error releasing connection:', releaseErr.message);
            }
        }
    }
});
//===========================================================================
/**
 * @route GET /api/projects/template
 * @description Download project import template
 */
router.get('/template', async (req, res) => {
    try {
        // Prefer the current import template file name, with fallback for older deployments.
        const preferredPath = path.resolve(__dirname, '..', 'templates', 'projects_import_template.xlsx');
        const legacyPath = path.resolve(__dirname, '..', 'templates', 'projects_upload_template.xlsx');
        const templatePath = fs.existsSync(preferredPath) ? preferredPath : legacyPath;
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ message: 'Projects template not found on server' });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="projects_import_template.xlsx"');
        return res.sendFile(templatePath);
    } catch (err) {
        console.error('Error serving projects template:', err);
        return res.status(500).json({ message: 'Failed to serve projects template' });
    }
});

/**
 * @route GET /api/projects/import-logs
 * @description List project import logs (admin only: MDA ICT Admin / Super Admin)
 */
router.get('/import-logs', async (req, res) => {
    try {
        if (!hasProjectImportLogAccess(req)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        await ensureProjectImportLogTable();
        const result = await pool.query(`
            SELECT
                id,
                user_id AS "userId",
                full_name AS "fullName",
                role_name AS "roleName",
                ministry,
                state_department AS "stateDepartment",
                uploaded_file_name AS "uploadedFileName",
                had_mapping_errors AS "hadMappingErrors",
                rows_inserted AS "rowsInserted",
                rows_updated AS "rowsUpdated",
                rows_processed AS "rowsProcessed",
                import_status AS "importStatus",
                import_message AS "importMessage",
                metadata_json AS "metadataJson",
                created_at AS "createdAt"
            FROM project_import_logs
            ORDER BY created_at DESC
            LIMIT 1000
        `);
        return res.status(200).json(result.rows || []);
    } catch (err) {
        console.error('Error listing project import logs:', err);
        return res.status(500).json({ message: `Failed to load project import logs: ${err.message}` });
    }
});

/**
 * @route GET /api/projects/import-logs/:id/file
 * @description Download uploaded workbook snapshot for an import log
 */
router.get('/import-logs/:id/file', async (req, res) => {
    try {
        if (!hasProjectImportLogAccess(req)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: 'Invalid log ID' });
        }
        await ensureProjectImportLogTable();
        const result = await pool.query(
            `SELECT uploaded_file_name, saved_file_path FROM project_import_logs WHERE id = $1 LIMIT 1`,
            [id]
        );
        const row = result.rows?.[0];
        if (!row) return res.status(404).json({ message: 'Upload log not found' });
        if (!row.saved_file_path || !fs.existsSync(row.saved_file_path)) {
            return res.status(404).json({ message: 'Uploaded file is not available' });
        }
        const filename = row.uploaded_file_name || `projects-import-${id}.xlsx`;
        return res.download(row.saved_file_path, filename);
    } catch (err) {
        console.error('Error downloading project import file:', err);
        return res.status(500).json({ message: `Failed to download uploaded file: ${err.message}` });
    }
});

// --- Analytics Endpoints (MUST come before parameterized routes) ---
/**
 * @route GET /api/projects/status-counts
 * @description Get count of projects by status with optional filters
 */
router.get('/status-counts', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const placeholder = DB_TYPE === 'postgresql' ? '$' : '?';
        let placeholderIndex = 1;
        
        const { 
            finYearId, 
            status, 
            department, 
            departmentId,
            projectType, 
            section,
            subCounty,
            ward
        } = req.query;

        let whereConditions = [
            DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0',
            DB_TYPE === 'postgresql' ? `p.progress->>'status' IS NOT NULL` : 'p.status IS NOT NULL'
        ];
        const queryParams = [];

        // Enforce organization visibility unless user is admin-like or has explicit bypass.
        const authUserId = getScopeUserId(req.user);
        const authPrivileges = req.user?.privileges || [];
        const isAdminLike = privilege.isAdminLike(req.user);
        if (DB_TYPE === 'postgresql' && authUserId && !isAdminLike && !orgScope.userHasOrganizationBypass(authPrivileges)) {
            if (await orgScope.organizationScopeTableExists()) {
                const scopeFragPg = orgScope.buildProjectListScopeFragment('p').replace(/\?/g, () => `$${placeholderIndex++}`);
                whereConditions.push(scopeFragPg);
                queryParams.push(...orgScope.projectScopeParamTriple(authUserId));
            }
        }

        if (finYearId) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`(p.timeline->>'financial_year') = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.finYearId = ${placeholder}`);
            }
            queryParams.push(finYearId);
            placeholderIndex++;
        }

        // Use shared status filter helper for consistent normalization
        const statusValue = status || req.query.projectStatus;
        if (statusValue) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.progress->>'status' = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.status = ${placeholder}`);
            }
            queryParams.push(statusValue);
            placeholderIndex++;
        }

        if (department || departmentId) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.ministry = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`(d.name = ${placeholder} OR d.alias = ${placeholder} OR p.departmentId = ${placeholder})`);
                const deptValue = department || departmentId;
                queryParams.push(deptValue, deptValue);
            }
            const deptValue = department || departmentId;
            queryParams.push(deptValue);
            placeholderIndex++;
        }

        if (projectType) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.sector = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`(pc.categoryName = ${placeholder} OR pc.name = ${placeholder})`);
                queryParams.push(projectType);
            }
            queryParams.push(projectType);
            placeholderIndex++;
        }

        if (section) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.state_department = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`s.name = ${placeholder}`);
            }
            queryParams.push(section);
            placeholderIndex++;
        }

        // Skip subcounty/ward filters for PostgreSQL (tables don't exist)
        if (subCounty && DB_TYPE !== 'postgresql') {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM kemri_project_subcounties psc 
                WHERE psc.projectId = p.id 
                AND (psc.subcountyId IN (SELECT subcountyId FROM kemri_subcounties WHERE name = ${placeholder} OR alias = ${placeholder}))
                AND psc.voided = 0
            )`);
            queryParams.push(subCounty, subCounty);
            placeholderIndex += 2;
        }

        if (ward && DB_TYPE !== 'postgresql') {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM kemri_project_wards pw 
                WHERE pw.projectId = p.id 
                AND (pw.wardId IN (SELECT wardId FROM kemri_wards WHERE name = ${placeholder} OR alias = ${placeholder}))
                AND pw.voided = 0
            )`);
            queryParams.push(ward, ward);
            placeholderIndex += 2;
        }

        let sqlQuery = `
            SELECT
                ${DB_TYPE === 'postgresql' ? `p.progress->>'status'` : 'p.status'} AS status,
                COUNT(${DB_TYPE === 'postgresql' ? 'p.project_id' : 'p.id'}) AS count
            FROM projects p
        `;
        
        // Add joins only if needed (MySQL only)
        if (DB_TYPE !== 'postgresql') {
            sqlQuery += ` LEFT JOIN kemri_departments d ON p.departmentId = d.departmentId AND d.voided = 0`;
            
            if (projectType) {
                sqlQuery += ` LEFT JOIN kemri_project_milestone_implementations pc ON p.categoryId = pc.categoryId`;
            }
            if (section) {
                sqlQuery += ` LEFT JOIN kemri_sections s ON p.sectionId = s.sectionId`;
            }
        }
        
        sqlQuery += ` WHERE ${whereConditions.join(' AND ')}
            GROUP BY ${DB_TYPE === 'postgresql' ? `p.progress->>'status'` : 'p.status'}
            ORDER BY ${DB_TYPE === 'postgresql' ? `p.progress->>'status'` : 'p.status'}
        `;
        
        const result = await pool.execute(sqlQuery, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const data = Array.isArray(rows) ? rows : [rows];
        
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching project status counts:', error);
        res.status(500).json({ message: 'Error fetching project status counts', error: error.message });
    }
});

/**
 * @route GET /api/projects/directorate-counts
 * @description Get count of projects by directorate with optional filters
 */
router.get('/directorate-counts', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const placeholder = DB_TYPE === 'postgresql' ? '$' : '?';
        let placeholderIndex = 1;
        
        const { 
            finYearId, 
            status, 
            department, 
            departmentId,
            projectType, 
            section,
            subCounty,
            ward
        } = req.query;

        let whereConditions = [
            DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0',
            DB_TYPE === 'postgresql' ? `p.implementing_agency IS NOT NULL` : 'p.directorate IS NOT NULL'
        ];
        const queryParams = [];

        // Enforce organization visibility unless user is admin-like or has explicit bypass.
        const authUserId = getScopeUserId(req.user);
        const authPrivileges = req.user?.privileges || [];
        const isAdminLike = privilege.isAdminLike(req.user);
        if (DB_TYPE === 'postgresql' && authUserId && !isAdminLike && !orgScope.userHasOrganizationBypass(authPrivileges)) {
            if (await orgScope.organizationScopeTableExists()) {
                const scopeFragPg = orgScope.buildProjectListScopeFragment('p').replace(/\?/g, () => `$${placeholderIndex++}`);
                whereConditions.push(scopeFragPg);
                queryParams.push(...orgScope.projectScopeParamTriple(authUserId));
            }
        }

        if (finYearId) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`(p.timeline->>'financial_year') = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.finYearId = ${placeholder}`);
            }
            queryParams.push(finYearId);
            placeholderIndex++;
        }

        if (status || req.query.projectStatus) {
            const statusValue = status || req.query.projectStatus;
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.progress->>'status' = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.status = ${placeholder}`);
            }
            queryParams.push(statusValue);
            placeholderIndex++;
        }

        if (department || departmentId) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.ministry = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`(d.name = ${placeholder} OR d.alias = ${placeholder} OR p.departmentId = ${placeholder})`);
                const deptValue = department || departmentId;
                queryParams.push(deptValue, deptValue);
            }
            const deptValue = department || departmentId;
            queryParams.push(deptValue);
            placeholderIndex++;
        }

        if (projectType) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.sector = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`(pc.categoryName = ${placeholder} OR pc.name = ${placeholder})`);
                queryParams.push(projectType);
            }
            queryParams.push(projectType);
            placeholderIndex++;
        }

        if (section) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.state_department = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`s.name = ${placeholder}`);
            }
            queryParams.push(section);
            placeholderIndex++;
        }

        // Skip subcounty/ward filters for PostgreSQL (tables don't exist)
        if (subCounty && DB_TYPE !== 'postgresql') {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM kemri_project_subcounties psc 
                WHERE psc.projectId = p.id 
                AND (psc.subcountyId IN (SELECT subcountyId FROM kemri_subcounties WHERE name = ${placeholder} OR alias = ${placeholder}))
                AND psc.voided = 0
            )`);
            queryParams.push(subCounty, subCounty);
            placeholderIndex += 2;
        }

        if (ward && DB_TYPE !== 'postgresql') {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM kemri_project_wards pw 
                WHERE pw.projectId = p.id 
                AND (pw.wardId IN (SELECT wardId FROM kemri_wards WHERE name = ${placeholder} OR alias = ${placeholder}))
                AND pw.voided = 0
            )`);
            queryParams.push(ward, ward);
            placeholderIndex += 2;
        }

        let sqlQuery = `
            SELECT
                ${DB_TYPE === 'postgresql' ? 'COALESCE(p.implementing_agency, \'Unassigned\')' : 'p.directorate'} AS directorate,
                COUNT(${DB_TYPE === 'postgresql' ? 'p.project_id' : 'p.id'}) AS count
            FROM projects p
        `;
        
        // Add joins only if needed (MySQL only)
        if (DB_TYPE !== 'postgresql') {
            sqlQuery += ` LEFT JOIN kemri_departments d ON p.departmentId = d.departmentId AND d.voided = 0`;
            
            if (projectType) {
                sqlQuery += ` LEFT JOIN kemri_project_milestone_implementations pc ON p.categoryId = pc.categoryId`;
            }
            if (section) {
                sqlQuery += ` LEFT JOIN kemri_sections s ON p.sectionId = s.sectionId`;
            }
        }
        
        sqlQuery += ` WHERE ${whereConditions.join(' AND ')}
            GROUP BY ${DB_TYPE === 'postgresql' ? 'COALESCE(p.implementing_agency, \'Unassigned\')' : 'p.directorate'}
            ORDER BY ${DB_TYPE === 'postgresql' ? 'COALESCE(p.implementing_agency, \'Unassigned\')' : 'p.directorate'}
        `;
        
        const result = await pool.execute(sqlQuery, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const data = Array.isArray(rows) ? rows : [rows];
        
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching project directorate counts:', error);
        res.status(500).json({ message: 'Error fetching project directorate counts', error: error.message });
    }
});

/**
 * @route GET /api/projects/organization-distribution
 * @description Aggregated project distribution by organization level (ministry/state_department/agency)
 * @query level - organization level: ministry | state_department | agency (default agency)
 * @query status - optional project status filter
 * @query limit - max rows (default 100, max 500)
 */
router.get('/organization-distribution', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const level = String(req.query.level || 'agency').toLowerCase();
        const status = req.query.status ? String(req.query.status) : '';
        const limitRaw = parseInt(String(req.query.limit || 100), 10);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;

        const safeLevel = ['ministry', 'state_department', 'agency'].includes(level) ? level : 'agency';

        const whereConditions = [DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0'];
        const queryParams = [];

        // Enforce organization visibility unless user has bypass privilege.
        const authUserId = getScopeUserId(req.user);
        const authPrivileges = req.user?.privileges || [];
        const isAdminLike = privilege.isAdminLike(req.user);
        if (DB_TYPE === 'postgresql' && authUserId && !isAdminLike && !orgScope.userHasOrganizationBypass(authPrivileges)) {
            if (await orgScope.organizationScopeTableExists()) {
                whereConditions.push(orgScope.buildProjectListScopeFragment('p'));
                queryParams.push(...orgScope.projectScopeParamTriple(authUserId));
            }
        }

        if (status) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push("p.progress->>'status' ILIKE ?");
            } else {
                whereConditions.push('p.status LIKE ?');
            }
            queryParams.push(`%${status}%`);
        }

        let sqlQuery = '';
        if (DB_TYPE === 'postgresql') {
            const ministryExpr = "COALESCE(NULLIF(TRIM(p.ministry), ''), 'Unassigned')";
            const stateExpr = "COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned')";
            const agencyExpr = "COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned')";
            let selectMinistry = `${ministryExpr} AS "ministry"`;
            let selectState = `${stateExpr} AS "stateDepartment"`;
            let selectAgency = `${agencyExpr} AS "agency"`;
            let groupByExpr = `${ministryExpr}, ${stateExpr}, ${agencyExpr}`;

            if (safeLevel === 'ministry') {
                selectState = "'All' AS \"stateDepartment\"";
                selectAgency = "'All' AS \"agency\"";
                groupByExpr = ministryExpr;
            } else if (safeLevel === 'state_department') {
                selectAgency = "'All' AS \"agency\"";
                groupByExpr = `${ministryExpr}, ${stateExpr}`;
            }

            sqlQuery = `
                SELECT
                    ${selectMinistry},
                    ${selectState},
                    ${selectAgency},
                    COUNT(p.project_id)::int AS "projectCount",
                    COALESCE(SUM(
                        CASE
                            WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                            THEN (p.budget->>'allocated_amount_kes')::numeric
                            ELSE 0
                        END
                    ), 0) AS "allocatedBudget",
                    COALESCE(SUM(
                        CASE
                            WHEN (p.budget->>'disbursed_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                            THEN (p.budget->>'disbursed_amount_kes')::numeric
                            ELSE 0
                        END
                    ), 0) AS "disbursedBudget"
                FROM projects p
                WHERE ${whereConditions.join(' AND ')}
                GROUP BY ${groupByExpr}
                ORDER BY "projectCount" DESC, "ministry", "stateDepartment", "agency"
                LIMIT ${limit}
            `;
        } else {
            // MySQL fallback (legacy schema lacks ministry/state_department on projects table)
            const ministryExpr = "'Unassigned'";
            const stateExpr = "'Unassigned'";
            const agencyExpr = "COALESCE(NULLIF(TRIM(p.directorate), ''), 'Unassigned')";
            const groupByExpr = agencyExpr;
            sqlQuery = `
                SELECT
                    ${ministryExpr} AS ministry,
                    ${stateExpr} AS stateDepartment,
                    ${agencyExpr} AS agency,
                    COUNT(p.id) AS projectCount,
                    COALESCE(SUM(p.costOfProject), 0) AS allocatedBudget,
                    COALESCE(SUM(p.paidOut), 0) AS disbursedBudget
                FROM kemri_projects p
                WHERE ${whereConditions.join(' AND ')}
                GROUP BY ${groupByExpr}
                ORDER BY projectCount DESC, agency
                LIMIT ${limit}
            `;
        }

        const result = await pool.execute(sqlQuery, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const data = Array.isArray(rows) ? rows : [rows];
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching project organization distribution:', error);
        res.status(500).json({ message: 'Error fetching project organization distribution', error: error.message });
    }
});

/**
 * @route GET /api/projects/organization-projects
 * @description List projects for a selected organization bucket (for dashboard modal drill-down)
 * @query ministry - optional exact ministry
 * @query stateDepartment - optional exact state department
 * @query agency - optional exact implementing agency
 * @query limit - optional max rows (default 300, max 1000)
 */
router.get('/organization-projects', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const ministry = req.query.ministry ? String(req.query.ministry).trim() : '';
        const stateDepartment = req.query.stateDepartment ? String(req.query.stateDepartment).trim() : '';
        const agency = req.query.agency ? String(req.query.agency).trim() : '';
        const limitRaw = parseInt(String(req.query.limit || 300), 10);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1000)) : 300;

        const whereConditions = [DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0'];
        const queryParams = [];

        const authUserId = getScopeUserId(req.user);
        const authPrivileges = req.user?.privileges || [];
        const isAdminLike = privilege.isAdminLike(req.user);
        if (DB_TYPE === 'postgresql' && authUserId && !isAdminLike && !orgScope.userHasOrganizationBypass(authPrivileges)) {
            if (await orgScope.organizationScopeTableExists()) {
                whereConditions.push(orgScope.buildProjectListScopeFragment('p'));
                queryParams.push(...orgScope.projectScopeParamTriple(authUserId));
            }
        }

        if (ministry && ministry.toLowerCase() !== 'all') {
            if (ministry.toLowerCase() === 'unassigned') {
                whereConditions.push("NULLIF(TRIM(COALESCE(p.ministry, '')), '') IS NULL");
            } else {
                if (DB_TYPE === 'postgresql') {
                    whereConditions.push("LOWER(TRIM(COALESCE(p.ministry, ''))) = LOWER(TRIM(COALESCE(?, '')))");
                } else {
                    whereConditions.push("LOWER(TRIM(COALESCE(p.ministry, ''))) = LOWER(TRIM(COALESCE(?, '')))");
                }
                queryParams.push(ministry);
            }
        }
        if (stateDepartment && stateDepartment.toLowerCase() !== 'all') {
            if (stateDepartment.toLowerCase() === 'unassigned') {
                whereConditions.push("NULLIF(TRIM(COALESCE(p.state_department, '')), '') IS NULL");
            } else {
                whereConditions.push("LOWER(TRIM(COALESCE(p.state_department, ''))) = LOWER(TRIM(COALESCE(?, '')))");
                queryParams.push(stateDepartment);
            }
        }
        if (agency && agency.toLowerCase() !== 'all') {
            const agencyColumn = DB_TYPE === 'postgresql' ? 'p.implementing_agency' : 'p.directorate';
            if (agency.toLowerCase() === 'unassigned') {
                whereConditions.push(`NULLIF(TRIM(COALESCE(${agencyColumn}, '')), '') IS NULL`);
            } else {
                whereConditions.push(`LOWER(TRIM(COALESCE(${agencyColumn}, ''))) = LOWER(TRIM(COALESCE(?, '')))`); 
                queryParams.push(agency);
            }
        }

        let sqlQuery = '';
        if (DB_TYPE === 'postgresql') {
            sqlQuery = `
                SELECT
                    p.project_id AS id,
                    p.name AS "projectName",
                    COALESCE(p.progress->>'status', 'Unknown') AS status,
                    COALESCE(NULLIF(TRIM(p.ministry), ''), 'Unassigned') AS ministry,
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "stateDepartment",
                    COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned') AS agency,
                    CASE
                        WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                        THEN (p.budget->>'allocated_amount_kes')::numeric
                        ELSE 0
                    END AS "allocatedBudget",
                    CASE
                        WHEN (p.budget->>'disbursed_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                        THEN (p.budget->>'disbursed_amount_kes')::numeric
                        ELSE 0
                    END AS "disbursedBudget",
                    p.updated_at AS "updatedAt"
                FROM projects p
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY p.updated_at DESC, p.project_id DESC
                LIMIT ${limit}
            `;
        } else {
            sqlQuery = `
                SELECT
                    p.id,
                    p.projectName,
                    COALESCE(p.status, 'Unknown') AS status,
                    COALESCE(NULLIF(TRIM(p.ministry), ''), 'Unassigned') AS ministry,
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS stateDepartment,
                    COALESCE(NULLIF(TRIM(p.directorate), ''), 'Unassigned') AS agency,
                    COALESCE(p.costOfProject, 0) AS allocatedBudget,
                    COALESCE(p.paidOut, 0) AS disbursedBudget,
                    p.updatedAt
                FROM kemri_projects p
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY p.updatedAt DESC, p.id DESC
                LIMIT ${limit}
            `;
        }

        const result = await pool.execute(sqlQuery, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(Array.isArray(rows) ? rows : []);
    } catch (error) {
        console.error('Error fetching organization projects:', error);
        res.status(500).json({ message: 'Error fetching organization projects', error: error.message });
    }
});

/**
 * @route GET /api/projects/jobs-snapshot
 * @description Aggregated jobs totals and category breakdown for dashboard cards.
 */
router.get('/jobs-snapshot', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const whereConditions = [DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0'];
        const queryParams = [];

        const authUserId = getScopeUserId(req.user);
        const authPrivileges = req.user?.privileges || [];
        const isAdminLike = privilege.isAdminLike(req.user);
        if (DB_TYPE === 'postgresql' && authUserId && !isAdminLike && !orgScope.userHasOrganizationBypass(authPrivileges)) {
            if (await orgScope.organizationScopeTableExists()) {
                whereConditions.push(orgScope.buildProjectListScopeFragment('p'));
                queryParams.push(...orgScope.projectScopeParamTriple(authUserId));
            }
        }

        if (DB_TYPE === 'postgresql') {
            const tableCheckQuery = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'project_jobs'
                ) AS exists
            `;
            const tableCheck = await pool.query(tableCheckQuery);
            const tableExists = tableCheck.rows?.[0]?.exists || false;
            if (!tableExists) {
                return res.status(200).json({
                    summary: { totalJobs: 0, totalMale: 0, totalFemale: 0, totalDirectJobs: 0, totalIndirectJobs: 0 },
                    byCategory: [],
                });
            }
        }

        const summaryQuery = DB_TYPE === 'postgresql'
            ? `
                SELECT
                    COALESCE(SUM(j.jobs_count), 0)::int AS "totalJobs",
                    COALESCE(SUM(j.male_count), 0)::int AS "totalMale",
                    COALESCE(SUM(j.female_count), 0)::int AS "totalFemale",
                    COALESCE(SUM(j.direct_jobs), 0)::int AS "totalDirectJobs",
                    COALESCE(SUM(j.indirect_jobs), 0)::int AS "totalIndirectJobs"
                FROM project_jobs j
                INNER JOIN projects p ON p.project_id = j.project_id
                WHERE j.voided = false AND ${whereConditions.join(' AND ')}
            `
            : `
                SELECT
                    COALESCE(SUM(j.jobs_count), 0) AS totalJobs,
                    COALESCE(SUM(j.male_count), 0) AS totalMale,
                    COALESCE(SUM(j.female_count), 0) AS totalFemale,
                    COALESCE(SUM(j.direct_jobs), 0) AS totalDirectJobs,
                    COALESCE(SUM(j.indirect_jobs), 0) AS totalIndirectJobs
                FROM project_jobs j
                INNER JOIN kemri_projects p ON p.id = j.project_id
                WHERE (j.voided IS NULL OR j.voided = 0) AND ${whereConditions.join(' AND ')}
            `;

        const categoryQuery = DB_TYPE === 'postgresql'
            ? `
                SELECT
                    COALESCE(NULLIF(TRIM(c.name), ''), 'Uncategorized') AS name,
                    COALESCE(SUM(j.jobs_count), 0)::int AS value
                FROM project_jobs j
                INNER JOIN projects p ON p.project_id = j.project_id
                LEFT JOIN job_categories c ON c.id = j.category_id
                WHERE j.voided = false AND ${whereConditions.join(' AND ')}
                GROUP BY COALESCE(NULLIF(TRIM(c.name), ''), 'Uncategorized')
                ORDER BY value DESC, name ASC
                LIMIT 10
            `
            : `
                SELECT
                    COALESCE(NULLIF(TRIM(c.name), ''), 'Uncategorized') AS name,
                    COALESCE(SUM(j.jobs_count), 0) AS value
                FROM project_jobs j
                INNER JOIN kemri_projects p ON p.id = j.project_id
                LEFT JOIN job_categories c ON c.id = j.category_id
                WHERE (j.voided IS NULL OR j.voided = 0) AND ${whereConditions.join(' AND ')}
                GROUP BY COALESCE(NULLIF(TRIM(c.name), ''), 'Uncategorized')
                ORDER BY value DESC, name ASC
                LIMIT 10
            `;

        const summaryResult = await pool.execute(summaryQuery, queryParams);
        const categoryResult = await pool.execute(categoryQuery, queryParams);

        const summaryRows = DB_TYPE === 'postgresql'
            ? (summaryResult.rows || summaryResult)
            : (Array.isArray(summaryResult) ? summaryResult[0] : summaryResult);
        const categoryRows = DB_TYPE === 'postgresql'
            ? (categoryResult.rows || categoryResult)
            : (Array.isArray(categoryResult) ? categoryResult[0] : categoryResult);

        const summary = (Array.isArray(summaryRows) ? summaryRows[0] : summaryRows) || {};
        const byCategory = Array.isArray(categoryRows) ? categoryRows : [];

        res.status(200).json({
            summary: {
                totalJobs: parseInt(summary.totalJobs, 10) || 0,
                totalMale: parseInt(summary.totalMale, 10) || 0,
                totalFemale: parseInt(summary.totalFemale, 10) || 0,
                totalDirectJobs: parseInt(summary.totalDirectJobs, 10) || 0,
                totalIndirectJobs: parseInt(summary.totalIndirectJobs, 10) || 0,
            },
            byCategory: byCategory.map((row) => ({
                name: row.name || 'Uncategorized',
                value: parseInt(row.value, 10) || 0,
            })),
        });
    } catch (error) {
        console.error('Error fetching jobs snapshot:', error);
        res.status(500).json({ message: 'Error fetching jobs snapshot', error: error.message });
    }
});

/**
 * @route GET /api/projects/funding-overview
 * @description Get funding overview by status
 */
router.get('/funding-overview', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                p.status AS status,
                SUM(p.costOfProject) AS totalBudget,
                SUM(p.paidOut) AS totalPaid,
                COUNT(p.id) AS projectCount
            FROM kemri_projects p
            WHERE p.voided = 0 AND p.status IS NOT NULL
            GROUP BY p.status
            ORDER BY p.status
        `);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project funding overview:', error);
        res.status(500).json({ message: 'Error fetching project funding overview', error: error.message });
    }
});

/**
 * @route GET /api/projects/pi-counts
 * @description Get count of projects by principal investigator
 */
router.get('/pi-counts', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                p.principalInvestigator AS pi,
                COUNT(p.id) AS count
            FROM kemri_projects p
            WHERE p.voided = 0 AND p.principalInvestigator IS NOT NULL
            GROUP BY p.principalInvestigator
            ORDER BY count DESC
            LIMIT 10
        `);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project PI counts:', error);
        res.status(500).json({ message: 'Error fetching project PI counts', error: error.message });
    }
});

/**
 * @route GET /api/projects/participants-per-project
 * @description Get participants per project
 */
router.get('/participants-per-project', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                p.projectName AS projectName,
                COUNT(pp.participantId) AS participantCount
            FROM kemri_projects p
            LEFT JOIN kemri_project_participants pp ON p.id = pp.projectId
            WHERE p.voided = 0
            GROUP BY p.id, p.projectName
            ORDER BY participantCount DESC
            LIMIT 10
        `);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching participants per project:', error);
        res.status(500).json({ message: 'Error fetching participants per project', error: error.message });
    }
});

// NEW: Contractor Assignment Routes
/**
 * @route GET /api/projects/:projectId/contractors
 * @description Get all contractors assigned to a specific project.
 * @access Private
 */
router.get('/:projectId/contractors', async (req, res) => {
    const { projectId } = req.params;
    try {
        // Check if table exists first
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let tableCheck;
        if (DB_TYPE === 'postgresql') {
            tableCheck = await pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'kemri_contractors'
                );
            `);
            if (!tableCheck.rows[0]?.exists) {
                return res.status(200).json([]);
            }
        }
        
        const [rows] = await pool.query(
            `SELECT c.* FROM kemri_contractors c
             JOIN kemri_project_contractor_assignments pca ON c.contractorId = pca.contractorId
             WHERE pca.projectId = ?`,
            [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching contractors for project:', error);
        // If table doesn't exist, return empty array instead of error
        const errorMessage = error.message || '';
        if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || error.code === '42P01') {
            return res.status(200).json([]);
        }
        res.status(500).json({ message: 'Error fetching contractors for project', error: error.message });
    }
});

/**
 * @route POST /api/projects/:projectId/assign-contractor
 * @description Assign a contractor to a project.
 * @access Private
 */
router.post('/:projectId/assign-contractor', async (req, res) => {
    const { projectId } = req.params;
    const { contractorId } = req.body;
    
    if (!contractorId) {
        return res.status(400).json({ message: 'Contractor ID is required.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO kemri_project_contractor_assignments (projectId, contractorId) VALUES (?, ?)',
            [projectId, contractorId]
        );
        res.status(201).json({ message: 'Contractor assigned to project successfully.', assignmentId: result.insertId });
    } catch (error) {
        console.error('Error assigning contractor to project:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This contractor is already assigned to this project.' });
        }
        res.status(500).json({ message: 'Error assigning contractor to project', error: error.message });
    }
});

/**
 * @route DELETE /api/projects/:projectId/remove-contractor/:contractorId
 * @description Remove a contractor's assignment from a project.
 * @access Private
 */
router.delete('/:projectId/remove-contractor/:contractorId', async (req, res) => {
    const { projectId, contractorId } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM kemri_project_contractor_assignments WHERE projectId = ? AND contractorId = ?',
            [projectId, contractorId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Assignment not found.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error removing contractor assignment:', error);
        res.status(500).json({ message: 'Error removing contractor assignment', error: error.message });
    }
});





// NEW: Route for fetching contractor photos for a project
router.get('/:projectId/contractor-photos', async (req, res) => {
    const { projectId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM kemri_contractor_photos WHERE projectId = ? ORDER BY submittedAt DESC',
            [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching contractor photos for project:', error);
        res.status(500).json({ message: 'Error fetching contractor photos for project', error: error.message });
    }
});


/**
 * @route GET /api/projects/maps-data
 * @description Get all project and GeoJSON data for the map, with optional filters.
 * @access Private
 */
router.get('/maps-data', async (req, res) => {
    const { countyId, subcountyId, wardId, projectType } = req.query;
    
    let query = `
        SELECT
            p.id,
            p.projectName,
            p.projectDescription,
            p.status,
            pm.mapId,
            pm.map AS geoJson
        FROM
            kemri_projects p
        JOIN
            kemri_project_maps pm ON p.id = pm.projectId
        WHERE 1=1
    `;

    const queryParams = [];
    
    // Add filtering based on the junction tables
    if (countyId) {
        query += ` AND p.id IN (
            SELECT projectId FROM kemri_project_counties WHERE countyId = ?
        )`;
        queryParams.push(countyId);
    }
    if (subcountyId) {
        query += ` AND p.id IN (
            SELECT projectId FROM kemri_project_subcounties WHERE subcountyId = ?
        )`;
        queryParams.push(subcountyId);
    }
    if (wardId) {
        query += ` AND p.id IN (
            SELECT projectId FROM kemri_project_wards WHERE wardId = ?
        )`;
        queryParams.push(wardId);
    }
    if (projectType && projectType !== 'all') {
        query += ` AND p.projectType = ?`;
        queryParams.push(projectType);
    }
    
    query += ` ORDER BY p.id;`;

    try {
        const [rows] = await pool.query(query, queryParams);

        let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;

        // Process GeoJSON to get a single bounding box and parse the data for the frontend
        const projectsWithGeoJson = rows.map(row => {
            try {
                const geoJson = JSON.parse(row.geoJson);
                
                const coordinates = extractCoordinates(geoJson.geometry);
                coordinates.forEach(coord => {
                    const [lng, lat] = coord;
                    if (isFinite(lat) && isFinite(lng)) {
                        minLat = Math.min(minLat, lat);
                        minLng = Math.min(minLng, lng);
                        maxLat = Math.max(maxLat, lat);
                        maxLng = Math.max(maxLng, lng);
                    }
                });

                return {
                    id: row.id,
                    projectName: row.projectName,
                    projectDescription: row.projectDescription,
                    status: row.status,
                    geoJson: geoJson,
                };
            } catch (e) {
                console.error("Error parsing GeoJSON for project:", row.id, e);
                return null;
            }
        }).filter(item => item !== null);

        const boundingBox = isFinite(minLat) ? { minLat, minLng, maxLat, maxLng } : null;

        const responseData = {
            projects: projectsWithGeoJson,
            boundingBox: boundingBox
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching filtered map data:', error);
        res.status(500).json({ message: 'Error fetching filtered map data', error: error.message });
    }
});


/**
 * @route GET /api/projects/
 * @description Get all active projects with optional filtering
 * @returns {Array} List of projects with joined data
 */
router.get('/', async (req, res) => {
    try {
        const requestStart = Date.now();
        const {
            projectName, startDate, endDate, status, departmentId, sectionId,
            finYearId, programId, subProgramId, countyId, subcountyId, wardId, categoryId, budgetId,
            limit, offset
        } = req.query;

        // Get DB_TYPE first
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        
        // Query using new JSONB structure for PostgreSQL
        const BASE_PROJECT_SELECT = DB_TYPE === 'postgresql' ? `
            SELECT
                p.project_id AS id,
                p.name AS "projectName",
                p.description AS "projectDescription",
                p.implementing_agency AS directorate,
                (p.timeline->>'start_date')::date AS "startDate",
                (p.timeline->>'expected_completion_date')::date AS "endDate",
                CASE
                    WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                    THEN (p.budget->>'allocated_amount_kes')::numeric
                    ELSE NULL
                END AS "costOfProject",
                CASE
                    WHEN (p.budget->>'disbursed_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                    THEN (p.budget->>'disbursed_amount_kes')::numeric
                    ELSE NULL
                END AS "paidOut",
                p.budget->>'source' AS "budgetSource",
                p.notes->>'objective' AS objective,
                p.notes->>'expected_output' AS "expectedOutput",
                NULL AS "principalInvestigator",
                p.notes->>'expected_outcome' AS "expectedOutcome",
                p.progress->>'status' AS status,
                p.progress->>'status_reason' AS "statusReason",
                p.progress->>'latest_update_summary' AS "progressSummary",
                p.data_sources->>'project_ref_num' AS "ProjectRefNum",
                (p.budget->>'contracted')::boolean AS "Contracted",
                p.created_at AS "createdAt",
                p.updated_at AS "updatedAt",
                p.voided,
                NULL AS "principalInvestigatorStaffId",
                NULL AS piFirstName,
                NULL AS piLastName,
                NULL AS piEmail,
                NULL AS "departmentId",
                p.ministry AS departmentName,
                p.ministry AS "ministry",
                NULL AS departmentAlias,
                NULL AS "sectionId",
                p.state_department AS sectionName,
                p.state_department AS "stateDepartment",
                NULL AS "finYearId",
                NULL AS financialYearName,
                (p.notes->>'program_id')::integer AS "programId",
                NULL AS programName,
                (p.notes->>'subprogram_id')::integer AS "subProgramId",
                NULL AS subProgramName,
                p.category_id AS "categoryId",
                p.sector AS categoryName,
                p.sector AS "sector",
                (p.data_sources->>'created_by_user_id')::integer AS "userId",
                NULL AS creatorFirstName,
                NULL AS creatorLastName,
                (p.is_public->>'approved')::boolean AS approved_for_public,
                (p.is_public->>'approved_by')::integer AS approved_by,
                (p.is_public->>'approved_at')::timestamp AS approved_at,
                p.is_public->>'approval_notes' AS approval_notes,
                (p.is_public->>'revision_requested')::boolean AS revision_requested,
                p.is_public->>'revision_notes' AS revision_notes,
                (p.is_public->>'revision_requested_by')::integer AS revision_requested_by,
                (p.is_public->>'revision_requested_at')::timestamp AS revision_requested_at,
                (p.is_public->>'revision_submitted_at')::timestamp AS revision_submitted_at,
                CASE
                    WHEN (p.progress->>'percentage_complete') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                    THEN (p.progress->>'percentage_complete')::numeric
                    ELSE NULL
                END AS "overallProgress",
                (p.budget->>'budget_id')::integer AS budgetId,
                CASE
                    WHEN (p.location->'geocoordinates'->>'lat') ~ '^[0-9.-]+(\\.[0-9]+){0,1}$'
                    THEN (p.location->'geocoordinates'->>'lat')::numeric
                    ELSE NULL
                END AS "latitude",
                CASE
                    WHEN (p.location->'geocoordinates'->>'lng') ~ '^[0-9.-]+(\\.[0-9]+){0,1}$'
                    THEN (p.location->'geocoordinates'->>'lng')::numeric
                    ELSE NULL
                END AS "longitude",
                (p.public_engagement->>'feedback_enabled')::boolean AS "feedbackEnabled",
                p.location->>'county' AS "countyNames",
                p.location->>'constituency' AS "constituencyNames",
                p.location->>'ward' AS "wardNames",
                COALESCE(site_counts.site_count, 0) AS "coverageCount",
                COALESCE(job_counts.jobs_count, 0) AS "jobsCount"
        ` : `
            SELECT
                p.id,
                p.projectName,
                p.projectDescription,
                p.directorate,
                p.startDate,
                p.endDate,
                p.costOfProject,
                p.paidOut,
                p.objective,
                p.expectedOutput,
                p.principalInvestigator,
                p.expectedOutcome,
                p.status,
                p.statusReason,
                p.ProjectRefNum,
                p.Contracted,
                p.createdAt,
                p.updatedAt,
                p.voided,
                p.principalInvestigatorStaffId,
                NULL AS piFirstName,
                NULL AS piLastName,
                NULL AS piEmail,
                p.departmentId,
                NULL AS departmentName,
                NULL AS departmentAlias,
                p.sectionId,
                NULL AS sectionName,
                p.finYearId,
                NULL AS financialYearName,
                p.programId,
                NULL AS programName,
                p.subProgramId,
                NULL AS subProgramName,
                p.categoryId,
                NULL AS categoryName,
                p.userId AS creatorUserId,
                NULL AS creatorFirstName,
                NULL AS creatorLastName,
                p.approved_for_public,
                p.approved_by,
                p.approved_at,
                p.approval_notes,
                p.revision_requested,
                p.revision_notes,
                p.revision_requested_by,
                p.revision_requested_at,
                NULL AS revision_submitted_at,
                p.overallProgress,
                NULL AS budgetId,
                NULL AS countyNames,
                NULL AS subcountyNames,
                NULL AS wardNames,
                COALESCE(site_counts.site_count, 0) AS "coverageCount",
                COALESCE(job_counts.jobs_count, 0) AS "jobsCount"
        `;
        
        // This part dynamically builds the query.
        /* SCOPE_DOWN: programs/subprograms tables removed. JOINs omitted so /projects list works. Re-enable when restoring. */
        let fromAndJoinClauses = DB_TYPE === 'postgresql' ? `
            FROM
                projects p
            LEFT JOIN (
                SELECT project_id, COUNT(*) AS site_count
                FROM project_sites
                GROUP BY project_id
            ) site_counts ON p.project_id = site_counts.project_id
            LEFT JOIN (
                SELECT project_id, SUM(jobs_count) AS jobs_count
                FROM project_jobs
                WHERE voided = false
                GROUP BY project_id
            ) job_counts ON p.project_id = job_counts.project_id
        ` : `
            FROM
                projects p
            LEFT JOIN (
                SELECT projectId, COUNT(*) AS site_count
                FROM project_sites
                GROUP BY projectId
            ) site_counts ON p.id = site_counts.projectId
        `;

        let queryParams = [];
        let whereConditions = [];
        
        if (DB_TYPE === 'postgresql') {
            whereConditions = ['p.voided = false'];
        } else {
            whereConditions = ['p.voided = 0'];
        }

        const authUserId = getScopeUserId(req.user);
        const authPrivileges = req.user?.privileges || [];
        if (DB_TYPE === 'postgresql' && authUserId && !isSuperAdminRequester(req.user) && !orgScope.userHasOrganizationBypass(authPrivileges)) {
            if (await orgScope.organizationScopeTableExists()) {
                const scopeRows = await orgScope.fetchOrganizationScopesForUser(authUserId);
                let hasProfileScopeContext = false;
                try {
                    const profileResult = await pool.query(
                        `SELECT agency_id, ministry, state_department
                         FROM users
                         WHERE userid = $1 AND COALESCE(voided, false) = false
                         LIMIT 1`,
                        [authUserId]
                    );
                    const profile = profileResult?.rows?.[0];
                    hasProfileScopeContext = Boolean(
                        profile &&
                        (
                            profile.agency_id !== null ||
                            (profile.ministry && String(profile.ministry).trim()) ||
                            (profile.state_department && String(profile.state_department).trim())
                        )
                    );
                } catch (profileErr) {
                    console.warn('Project scope profile lookup failed, continuing with safe fallback:', profileErr.message);
                }

                // Avoid locking users out when this database has no scope rows/profile context for them.
                if ((scopeRows || []).length > 0 || hasProfileScopeContext) {
                    whereConditions.push(orgScope.buildProjectListScopeFragment('p'));
                    queryParams = [...orgScope.projectScopeParamTriple(authUserId), ...queryParams];
                }
            }
        }

        // Location filters disabled for now (tables don't exist)
        // if (countyId) {
        //     whereConditions.push('pc.countyId = ?');
        //     queryParams.push(parseInt(countyId));
        // }
        // if (subcountyId) {
        //     whereConditions.push('psc.subcountyId = ?');
        //     queryParams.push(parseInt(subcountyId));
        // }
        // if (wardId) {
        //     whereConditions.push('pw.wardId = ?');
        //     queryParams.push(parseInt(wardId));
        // }

        // Add other non-location filters
        if (projectName) { 
            whereConditions.push(DB_TYPE === 'postgresql' ? 'p.name ILIKE ?' : 'p.projectName LIKE ?'); 
            queryParams.push(`%${projectName}%`); 
        }
        if (startDate) { 
            whereConditions.push(DB_TYPE === 'postgresql' ? "(p.timeline->>'start_date')::date >= ?" : 'p.startDate >= ?'); 
            queryParams.push(startDate); 
        }
        if (endDate) { 
            whereConditions.push(DB_TYPE === 'postgresql' ? "(p.timeline->>'expected_completion_date')::date <= ?" : 'p.endDate <= ?'); 
            queryParams.push(endDate); 
        }
        if (status) {
            if (DB_TYPE === 'postgresql') {
                // Query JSONB field for status
                whereConditions.push("p.progress->>'status' ILIKE ?");
                queryParams.push(`%${status}%`);
            } else {
                // Use the statusFilterHelper for MySQL
                addStatusFilter(status, whereConditions, queryParams);
            }
        }
        if (departmentId) { 
            // For PostgreSQL, we now use ministry text field, but can also search by name
            if (DB_TYPE === 'postgresql') {
                whereConditions.push('p.ministry ILIKE ?');
                queryParams.push(`%${departmentId}%`);
            } else {
                whereConditions.push('p.departmentId = ?'); 
                queryParams.push(parseInt(departmentId)); 
            }
        }
        if (sectionId) { 
            // For PostgreSQL, we now use state_department text field
            if (DB_TYPE === 'postgresql') {
                whereConditions.push('p.state_department ILIKE ?');
                queryParams.push(`%${sectionId}%`);
            } else {
                whereConditions.push('p.sectionId = ?'); 
                queryParams.push(parseInt(sectionId)); 
            }
        }
        if (finYearId) { 
            // Financial year is now in timeline JSONB
            if (DB_TYPE === 'postgresql') {
                whereConditions.push("p.timeline->>'financial_year' = ?");
                queryParams.push(finYearId);
            } else {
                whereConditions.push('p.finYearId = ?'); 
                queryParams.push(parseInt(finYearId)); 
            }
        }
        if (programId) { 
            // Program ID is now in notes JSONB
            if (DB_TYPE === 'postgresql') {
                whereConditions.push("(p.notes->>'program_id')::integer = ?");
                queryParams.push(parseInt(programId));
            } else {
                whereConditions.push('p.programId = ?'); 
                queryParams.push(parseInt(programId)); 
            }
        }
        if (subProgramId) { 
            // Subprogram ID is now in notes JSONB
            if (DB_TYPE === 'postgresql') {
                whereConditions.push("(p.notes->>'subprogram_id')::integer = ?");
                queryParams.push(parseInt(subProgramId));
            } else {
                whereConditions.push('p.subProgramId = ?'); 
                queryParams.push(parseInt(subProgramId)); 
            }
        }
        if (categoryId) { 
            // Category is now sector text field
            if (DB_TYPE === 'postgresql') {
                whereConditions.push('p.sector ILIKE ?');
                queryParams.push(`%${categoryId}%`);
            } else {
                whereConditions.push('p.categoryId = ?'); 
                queryParams.push(parseInt(categoryId)); 
            }
        }
        if (budgetId) { 
            // Budget ID is now in budget JSONB
            if (DB_TYPE === 'postgresql') {
                whereConditions.push("(p.budget->>'budget_id')::integer = ?");
                queryParams.push(parseInt(budgetId));
            } else {
                whereConditions.push('p.budgetId = ?'); 
                queryParams.push(parseInt(budgetId)); 
            }
        }

        // Respect list pagination from frontend to avoid loading entire registry on initial mount.
        const parsedLimit = Number.parseInt(limit, 10);
        const parsedOffset = Number.parseInt(offset, 10);
        const hasValidLimit = Number.isInteger(parsedLimit) && parsedLimit > 0;
        const hasValidOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0;

        // Build the final query (no location select clauses needed - already in BASE_PROJECT_SELECT as NULL)
        let query = `${BASE_PROJECT_SELECT} ${fromAndJoinClauses}`;

        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
        }
        // No GROUP BY needed since we're getting location data directly from JSONB, not using STRING_AGG
        query += ` ORDER BY ${DB_TYPE === 'postgresql' ? 'p.project_id' : 'p.id'}`;
        if (hasValidLimit) {
            query += ` LIMIT ?`;
            queryParams.push(parsedLimit);
        }
        if (hasValidOffset) {
            query += ` OFFSET ?`;
            queryParams.push(parsedOffset);
        }

        // Convert MySQL ? placeholders to PostgreSQL $1, $2, etc. if needed
        if (DB_TYPE === 'postgresql') {
            let paramIndex = 1;
            query = query.replace(/\?/g, () => `$${paramIndex++}`);
        }
        
        // Use execute for PostgreSQL to handle placeholder conversion
        const result = await pool.execute(query, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        console.log(
            `[projects:list] rows=${Array.isArray(rows) ? rows.length : 0} limit=${hasValidLimit ? parsedLimit : 'none'} offset=${hasValidOffset ? parsedOffset : 0} durationMs=${Date.now() - requestStart}`
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ message: 'Error fetching projects', error: error.message });
    }
});

/**
 * @route GET /api/projects/:id/sites
 * @description Get all project sites for a specific project with summary counts
 * @returns {Object} Project sites with summary counts by county, constituency, and ward
 * 
 * NOTE: This route MUST come before router.get('/:id') to ensure proper route matching
 */
router.get('/:id/sites', async (req, res) => {
    try {
        const { id } = req.params;
        const { county, constituency, ward } = req.query; // Filter parameters
        
        console.log(`[Project Sites Route] Route matched! Request for project ID: ${id}`);
        
        if (isNaN(parseInt(id))) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const DB_TYPE = process.env.DB_TYPE || 'postgresql';
        const projectId = parseInt(id);
        
        console.log(`[Project Sites] Fetching sites for project ID: ${projectId} (DB_TYPE: ${DB_TYPE})`);
        
        // First, check if project_sites table exists
        try {
            const tableCheckQuery = DB_TYPE === 'postgresql' 
                ? `SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'project_sites'
                )`
                : `SELECT COUNT(*) as count FROM information_schema.tables 
                   WHERE table_schema = DATABASE() 
                   AND table_name = 'project_sites'`;
            
            const tableCheck = await pool.execute(tableCheckQuery);
            const tableExists = DB_TYPE === 'postgresql' 
                ? tableCheck.rows?.[0]?.exists 
                : (Array.isArray(tableCheck) ? tableCheck[0]?.[0]?.count > 0 : false);
            
            if (!tableExists) {
                console.log('project_sites table does not exist, returning empty result');
                return res.status(200).json({
                    projectId: parseInt(id),
                    summary: { total: 0, byCounty: {}, byConstituency: {}, byWard: {} },
                    sites: []
                });
            }
            
            // Debug: Check if there are any sites for this project_id (only if table exists)
            try {
                const debugQuery = DB_TYPE === 'postgresql'
                    ? `SELECT COUNT(*) as count, MIN(project_id) as min_id, MAX(project_id) as max_id FROM project_sites WHERE project_id = $1`
                    : `SELECT COUNT(*) as count, MIN(projectId) as min_id, MAX(projectId) as max_id FROM project_sites WHERE projectId = ?`;
                
                const debugResult = await pool.execute(debugQuery, [projectId]);
                const debugData = DB_TYPE === 'postgresql' 
                    ? (debugResult.rows?.[0] || {})
                    : (Array.isArray(debugResult) ? debugResult[0]?.[0] : {});
                
                console.log(`[Project Sites] Debug - Sites count for project_id ${projectId}:`, debugData);
                
                // Also check what project_ids actually exist in project_sites
                const sampleQuery = DB_TYPE === 'postgresql'
                    ? `SELECT DISTINCT project_id FROM project_sites ORDER BY project_id LIMIT 10`
                    : `SELECT DISTINCT projectId FROM project_sites ORDER BY projectId LIMIT 10`;
                
                const sampleResult = await pool.execute(sampleQuery);
                const sampleData = DB_TYPE === 'postgresql'
                    ? (sampleResult.rows || [])
                    : (Array.isArray(sampleResult) ? sampleResult[0] : []);
                
                console.log(`[Project Sites] Sample project_ids in project_sites:`, sampleData.map(r => r.project_id || r.projectId));
            } catch (debugError) {
                console.warn('[Project Sites] Debug query failed (non-critical):', debugError.message);
                // Continue - debug queries are optional
            }
            
        } catch (checkError) {
            console.error('Error checking if project_sites table exists:', checkError);
            // Continue anyway - the actual query will fail if table doesn't exist
        }
        
        let query;
        let queryParams = [projectId];
        
        if (DB_TYPE === 'postgresql') {
            // Build WHERE clause for filters
            // NOTE: In the current PostgreSQL schema, county/constituency/ward are plain text columns
            // on project_sites – there is NO location JSONB column on this table.
            // Keep this logic simple and only use the real columns that exist.
            let whereConditions = ['ps.project_id = $1'];
            
            console.log(`[Project Sites] PostgreSQL query - project_id = ${projectId}`);
            // Only add voided check if the column exists (it does not currently), so we skip it.
            
            if (county) {
                whereConditions.push('ps.county ILIKE $' + (queryParams.length + 1));
                queryParams.push(`%${county}%`);
            }
            if (constituency) {
                whereConditions.push('ps.constituency ILIKE $' + (queryParams.length + 1));
                queryParams.push(`%${constituency}%`);
            }
            if (ward) {
                whereConditions.push('ps.ward ILIKE $' + (queryParams.length + 1));
                queryParams.push(`%${ward}%`);
            }
            
            // Simple query: select all columns plus the three location fields
            query = `
                SELECT 
                    ps.*,
                    ps.county AS county,
                    ps.constituency AS constituency,
                    ps.ward AS ward
                FROM project_sites ps
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY 
                    COALESCE(ps.county, ''),
                    COALESCE(ps.constituency, ''),
                    COALESCE(ps.ward, '')
            `;
        } else {
            // MySQL version
            let whereConditions = ['ps.projectId = ?'];
            // Only add voided check if the column exists
            // For now, we'll skip the voided check since the column may not exist
            
            if (county) {
                whereConditions.push('ps.county LIKE ?');
                queryParams.push(`%${county}%`);
            }
            if (constituency) {
                whereConditions.push('ps.constituency LIKE ?');
                queryParams.push(`%${constituency}%`);
            }
            if (ward) {
                whereConditions.push('ps.ward LIKE ?');
                queryParams.push(`%${ward}%`);
            }
            
            query = `
                SELECT 
                    ps.*,
                    ps.county,
                    ps.constituency,
                    ps.ward
                FROM project_sites ps
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY ps.county, ps.constituency, ps.ward
            `;
        }
        
        // Convert MySQL ? placeholders to PostgreSQL $1, $2, etc. if needed
        if (DB_TYPE === 'postgresql') {
            let paramIndex = 1;
            query = query.replace(/\?/g, () => `$${paramIndex++}`);
        }
        
        console.log(`[Project Sites] Executing query with params:`, queryParams);
        console.log(`[Project Sites] Query:`, query.substring(0, 200) + '...');
        
        const result = await pool.execute(query, queryParams);
        const sites = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        // Ensure sites is an array
        const sitesArray = Array.isArray(sites) ? sites : [];
        
        console.log(`[Project Sites] Found ${sitesArray.length} sites for project ID ${projectId}`);
        
        // Calculate summary counts
        const summary = {
            total: sitesArray.length,
            byCounty: {},
            byConstituency: {},
            byWard: {}
        };
        
        sitesArray.forEach(site => {
            // Handle different possible column names
            const county = site.county || site.county_name || site.location?.county || 'Unknown';
            const constituency = site.constituency || site.constituency_name || site.location?.constituency || 'Unknown';
            const ward = site.ward || site.ward_name || site.location?.ward || 'Unknown';
            
            summary.byCounty[county] = (summary.byCounty[county] || 0) + 1;
            summary.byConstituency[constituency] = (summary.byConstituency[constituency] || 0) + 1;
            summary.byWard[ward] = (summary.byWard[ward] || 0) + 1;
        });
        
        const response = {
            projectId: projectId,
            summary,
            sites: sitesArray
        };
        
        console.log(`[Project Sites] Returning response for project ${projectId}:`, {
            totalSites: sitesArray.length,
            summaryTotal: summary.total,
            sampleSite: sitesArray[0] || null
        });
        
        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching project sites:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            projectId: projectId
        });
        
        // Return empty result instead of error if table/column doesn't exist or any query error
        // This ensures the frontend can gracefully handle missing data
        const errorMessage = error.message || '';
        const isSchemaError = (
            errorMessage.includes('does not exist') || 
            errorMessage.includes('relation') ||
            errorMessage.includes('column') ||
            errorMessage.includes('syntax error') ||
            errorMessage.includes('invalid input') ||
            error.code === '42P01' || // PostgreSQL: relation does not exist
            error.code === '42703'    // PostgreSQL: column does not exist
        );
        
        if (isSchemaError) {
            console.log('Schema error detected, returning empty result:', errorMessage);
            return res.status(200).json({
                projectId: parseInt(id),
                summary: { total: 0, byCounty: {}, byConstituency: {}, byWard: {} },
                sites: [],
                message: 'Project sites table or columns may not exist yet. No sites found for this project.'
            });
        }
        
        // For any other error, also return empty result with a message (don't crash the frontend)
        console.log('Unexpected error, returning empty result to prevent frontend crash:', errorMessage);
        return res.status(200).json({
            projectId: parseInt(id),
            summary: { total: 0, byCounty: {}, byConstituency: {}, byWard: {} },
            sites: [],
            message: 'Unable to fetch project sites at this time. Please try again later.'
        });
    }
});

/**
 * @route POST /api/projects/:id/sites
 * @description Create a new site for a project
 */
router.post('/:id/sites', async (req, res) => {
    try {
        const { id } = req.params;
        const projectId = parseInt(id, 10);
        const DB_TYPE = process.env.DB_TYPE || 'postgresql';

        if (isNaN(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const {
            siteName,
            county,
            constituency,
            ward,
            status,
            progress,
            approvedCost,
        } = req.body;

        if (!siteName) {
            return res.status(400).json({ message: 'Site name is required' });
        }

        let query;
        let params;

        if (DB_TYPE === 'postgresql') {
            // site_id has no DEFAULT; generate next id from current max
            query = `
                INSERT INTO project_sites (
                    site_id,
                    project_id,
                    site_name,
                    county,
                    constituency,
                    ward,
                    status_norm,
                    percent_complete,
                    approved_cost_kes
                )
                SELECT (COALESCE(MAX(ps.site_id), 0) + 1), $1, $2, $3, $4, $5, $6, $7, $8
                FROM project_sites ps
                RETURNING *
            `;
            params = [
                projectId,
                siteName,
                county || null,
                constituency || null,
                ward || null,
                status || null,
                progress !== undefined && progress !== '' ? Number(progress) : null,
                approvedCost !== undefined && approvedCost !== '' ? Number(approvedCost) : null,
            ];
        } else {
            // MySQL-style schema (camelCase identifiers)
            query = `
                INSERT INTO project_sites (
                    projectId,
                    siteName,
                    county,
                    constituency,
                    ward,
                    statusNorm,
                    percentComplete,
                    approvedCostKes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                projectId,
                siteName,
                county || null,
                constituency || null,
                ward || null,
                status || null,
                progress !== undefined && progress !== '' ? Number(progress) : null,
                approvedCost !== undefined && approvedCost !== '' ? Number(approvedCost) : null,
            ];
        }

        const result = await pool.execute(query, params);
        const row =
            DB_TYPE === 'postgresql'
                ? result.rows?.[0]
                : Array.isArray(result) && result[0] ? result[0][0] : null;

        return res.status(201).json(row || {});
    } catch (error) {
        console.error('Error creating project site:', error);
        return res.status(500).json({
            message: 'Failed to create site',
            details: error.message,
        });
    }
});

/**
 * @route PUT /api/projects/:projectId/sites/:siteId
 * @description Update an existing project site (status / progress / budget)
 */
router.put('/:projectId/sites/:siteId', async (req, res) => {
    try {
        const { projectId, siteId } = req.params;
        const DB_TYPE = process.env.DB_TYPE || 'postgresql';

        const projectIdNum = parseInt(projectId, 10);
        const siteIdNum = parseInt(siteId, 10);

        if (isNaN(projectIdNum) || isNaN(siteIdNum)) {
            return res.status(400).json({ message: 'Invalid project or site ID' });
        }

        const {
            status,
            percent_complete,
            approved_cost_kes,
        } = req.body;

        let query;
        let params;

        if (DB_TYPE === 'postgresql') {
            query = `
                UPDATE project_sites
                SET
                    status_norm = COALESCE($3, status_norm),
                    percent_complete = COALESCE($4, percent_complete),
                    approved_cost_kes = COALESCE($5, approved_cost_kes)
                WHERE project_id = $1 AND site_id = $2
                RETURNING *
            `;
            params = [
                projectIdNum,
                siteIdNum,
                status || null,
                percent_complete !== undefined && percent_complete !== '' ? Number(percent_complete) : null,
                approved_cost_kes !== undefined && approved_cost_kes !== '' ? Number(approved_cost_kes) : null,
            ];
        } else {
            query = `
                UPDATE project_sites
                SET
                    statusNorm = COALESCE(?, statusNorm),
                    percentComplete = COALESCE(?, percentComplete),
                    approvedCostKes = COALESCE(?, approvedCostKes)
                WHERE projectId = ? AND siteId = ?
            `;
            params = [
                status || null,
                percent_complete !== undefined && percent_complete !== '' ? Number(percent_complete) : null,
                approved_cost_kes !== undefined && approved_cost_kes !== '' ? Number(approved_cost_kes) : null,
                projectIdNum,
                siteIdNum,
            ];
        }

        const result = await pool.execute(query, params);
        const row =
            DB_TYPE === 'postgresql'
                ? result.rows?.[0]
                : Array.isArray(result) && result[0] ? result[0][0] : null;

        if (!row) {
            return res.status(404).json({ message: 'Site not found' });
        }

        return res.status(200).json(row);
    } catch (error) {
        console.error('Error updating project site:', error);
        return res.status(500).json({
            message: 'Failed to update site',
            details: error.message,
        });
    }
});

/**
 * @route DELETE /api/projects/:projectId/sites/:siteId
 * @description Delete a project site
 */
router.delete('/:projectId/sites/:siteId', async (req, res) => {
    try {
        const { projectId, siteId } = req.params;
        const DB_TYPE = process.env.DB_TYPE || 'postgresql';

        const projectIdNum = parseInt(projectId, 10);
        const siteIdNum = parseInt(siteId, 10);

        if (isNaN(projectIdNum) || isNaN(siteIdNum)) {
            return res.status(400).json({ message: 'Invalid project or site ID' });
        }

        let query;
        let params;

        if (DB_TYPE === 'postgresql') {
            query = `
                DELETE FROM project_sites
                WHERE project_id = $1 AND site_id = $2
                RETURNING site_id
            `;
            params = [projectIdNum, siteIdNum];
        } else {
            query = `
                DELETE FROM project_sites
                WHERE projectId = ? AND siteId = ?
            `;
            params = [projectIdNum, siteIdNum];
        }

        const result = await pool.execute(query, params);
        const row =
            DB_TYPE === 'postgresql'
                ? result.rows?.[0]
                : Array.isArray(result) && result[0] ? result[0][0] : null;

        if (!row) {
            return res.status(404).json({ message: 'Site not found' });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting project site:', error);
        return res.status(500).json({
            message: 'Failed to delete site',
            details: error.message,
        });
    }
});

/**
 * @route GET /api/projects/:projectId/sites/:siteId/history
 * @description Get history updates for a specific project site
 */
router.get('/:projectId/sites/:siteId/history', async (req, res) => {
    try {
        const { projectId, siteId } = req.params;
        const DB_TYPE = process.env.DB_TYPE || 'postgresql';

        const projectIdNum = parseInt(projectId, 10);
        const siteIdNum = parseInt(siteId, 10);

        if (isNaN(projectIdNum) || isNaN(siteIdNum)) {
            return res.status(400).json({ message: 'Invalid project or site ID' });
        }

        let query;
        let params;

        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT
                    id,
                    project_id,
                    site_id,
                    status,
                    change_date,
                    notes,
                    budget_kes,
                    challenges,
                    recommendations,
                    created_at
                FROM project_site_history
                WHERE project_id = $1 AND site_id = $2
                ORDER BY change_date DESC, created_at DESC, id DESC
            `;
            params = [projectIdNum, siteIdNum];
        } else {
            query = `
                SELECT
                    id,
                    projectId AS project_id,
                    siteId AS site_id,
                    status,
                    changeDate AS change_date,
                    notes,
                    budgetKes AS budget_kes,
                    challenges,
                    recommendations,
                    createdAt AS created_at
                FROM project_site_history
                WHERE projectId = ? AND siteId = ?
                ORDER BY changeDate DESC, createdAt DESC, id DESC
            `;
            params = [projectIdNum, siteIdNum];
        }

        const result = await pool.execute(query, params);
        const rows =
            DB_TYPE === 'postgresql'
                ? result.rows || []
                : Array.isArray(result) && result[0]
                    ? result[0]
                    : [];

        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project site history:', error);
        return res.status(500).json({
            message: 'Failed to fetch site history',
            details: error.message,
        });
    }
});

/**
 * @route POST /api/projects/:projectId/sites/:siteId/history
 * @description Create a history update entry for a specific project site
 */
router.post('/:projectId/sites/:siteId/history', async (req, res) => {
    try {
        const { projectId, siteId } = req.params;
        const DB_TYPE = process.env.DB_TYPE || 'postgresql';

        const projectIdNum = parseInt(projectId, 10);
        const siteIdNum = parseInt(siteId, 10);

        if (isNaN(projectIdNum) || isNaN(siteIdNum)) {
            return res.status(400).json({ message: 'Invalid project or site ID' });
        }

        const {
            status,
            change_date,
            notes,
            budget_kes,
            challenges,
            recommendations,
        } = req.body;

        let query;
        let params;

        if (DB_TYPE === 'postgresql') {
            query = `
                INSERT INTO project_site_history (
                    project_id,
                    site_id,
                    status,
                    change_date,
                    notes,
                    budget_kes,
                    challenges,
                    recommendations
                )
                VALUES ($1, $2, $3, COALESCE($4, NOW()), $5, $6, $7, $8)
                RETURNING *
            `;
            params = [
                projectIdNum,
                siteIdNum,
                status || null,
                change_date || null,
                notes || null,
                budget_kes !== undefined && budget_kes !== '' ? Number(budget_kes) : null,
                challenges || null,
                recommendations || null,
            ];
        } else {
            query = `
                INSERT INTO project_site_history (
                    projectId,
                    siteId,
                    status,
                    changeDate,
                    notes,
                    budgetKes,
                    challenges,
                    recommendations
                )
                VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?)
            `;
            params = [
                projectIdNum,
                siteIdNum,
                status || null,
                change_date || null,
                notes || null,
                budget_kes !== undefined && budget_kes !== '' ? Number(budget_kes) : null,
                challenges || null,
                recommendations || null,
            ];
        }

        const result = await pool.execute(query, params);
        const row =
            DB_TYPE === 'postgresql'
                ? result.rows?.[0]
                : Array.isArray(result) && result[0]
                    ? result[0][0]
                    : null;

        return res.status(201).json(row || {});
    } catch (error) {
        console.error('Error creating project site history:', error);
        return res.status(500).json({
            message: 'Failed to create site update',
            details: error.message,
        });
    }
});


// ==================== PROJECT APPROVAL ROUTE (must be before /:id route) ====================

/**
 * @route PUT /api/projects/:id/approval
 * @description Approve, revoke, or request revision for a project (for public viewing)
 * @access Protected - requires public_content.approve privilege or admin role
 */
router.put('/:id/approval', async (req, res) => {
    // Check if user is authenticated
    if (!req.user) {
        return res.status(401).json({ 
            error: 'Authentication required' 
        });
    }
    
    // Check if user is admin or has public_content.approve privilege
    const isAdmin = privilege.isAdminLike(req.user);
    const hasPrivilege = req.user?.privileges?.includes('public_content.approve');
    
    if (!isAdmin && !hasPrivilege) {
        return res.status(403).json({ 
            error: 'Access denied. You do not have the necessary privileges to perform this action.' 
        });
    }
    
    try {
        const DB_TYPE = process.env.DB_TYPE || 'postgresql';
        const { id } = req.params;
        const { 
            approved_for_public, 
            approval_notes, 
            approved_by, 
            approved_at,
            revision_requested,
            revision_notes,
            revision_requested_by,
            revision_requested_at
        } = req.body;

        if (DB_TYPE === 'postgresql') {
            // PostgreSQL implementation using is_public JSONB field
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Get existing is_public JSONB data
                const existingQuery = `SELECT is_public FROM projects WHERE project_id = $1 AND voided = false`;
                const existingResult = await client.query(existingQuery, [id]);
                
                if (existingResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Project not found' });
                }

                // Get existing is_public JSONB or default to empty object
                const existingIsPublic = existingResult.rows[0].is_public || { approved: false };
                
                // Build updated is_public JSONB object
                let updatedIsPublic = { ...existingIsPublic };

                // Update approval details when approved_for_public is provided
                if (approved_for_public !== undefined) {
                    updatedIsPublic.approved = approved_for_public === true || approved_for_public === 1 || approved_for_public === 'true';
                    updatedIsPublic.approved_by = approved_by || req.user.userId;
                    updatedIsPublic.approved_at = approved_at || new Date().toISOString();
                    updatedIsPublic.approval_notes = approval_notes || null;
                    
                    // Clear revision request when approving/rejecting (unless revision_requested is also being set)
                    if (revision_requested === undefined) {
                        updatedIsPublic.revision_requested = false;
                        updatedIsPublic.revision_notes = null;
                        updatedIsPublic.revision_requested_by = null;
                        updatedIsPublic.revision_requested_at = null;
                    }
                }

                // Handle revision request
                if (revision_requested !== undefined) {
                    updatedIsPublic.revision_requested = revision_requested === true || revision_requested === 1 || revision_requested === 'true';
                    updatedIsPublic.revision_notes = revision_notes || null;
                    updatedIsPublic.revision_requested_by = revision_requested_by || req.user.userId;
                    updatedIsPublic.revision_requested_at = revision_requested_at || new Date().toISOString();
                    
                    // Reset approved when revision is requested
                    if (revision_requested) {
                        updatedIsPublic.approved = false;
                    }
                }

                // Update is_public JSONB field
                const updateQuery = `
                    UPDATE projects
                    SET is_public = $1, updated_at = CURRENT_TIMESTAMP
                    WHERE project_id = $2 AND voided = false
                `;

                const updateResult = await client.query(updateQuery, [JSON.stringify(updatedIsPublic), id]);

                if (updateResult.rowCount === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Project not found' });
                }

                await client.query('COMMIT');

                let message = 'Project updated successfully';
                if (revision_requested) {
                    message = 'Revision requested successfully';
                } else if (approved_for_public !== undefined) {
                    message = `Project ${approved_for_public ? 'approved' : 'revoked'} for public viewing`;
                }

                res.json({
                    success: true,
                    message
                });
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } else {
            // MySQL implementation (legacy - keeping for backward compatibility)
            let updateFields = [];
            let updateValues = [];

            if (revision_requested !== undefined) {
                updateFields.push('revision_requested = ?');
                updateValues.push(revision_requested ? 1 : 0);
                
                if (revision_requested) {
                    updateFields.push('revision_notes = ?');
                    updateFields.push('revision_requested_by = ?');
                    updateFields.push('revision_requested_at = ?');
                    updateValues.push(revision_notes || null);
                    updateValues.push(revision_requested_by || req.user.userId);
                    const revisionRequestedAt = revision_requested_at ? new Date(revision_requested_at) : new Date();
                    updateValues.push(revisionRequestedAt.toISOString().slice(0, 19).replace('T', ' '));
                    updateFields.push('approved_for_public = 0');
                } else {
                    updateFields.push('revision_notes = NULL');
                    updateFields.push('revision_requested_by = NULL');
                    updateFields.push('revision_requested_at = NULL');
                }
            }

            if (approved_for_public !== undefined) {
                updateFields.push('approved_for_public = ?');
                updateFields.push('approval_notes = ?');
                updateFields.push('approved_by = ?');
                updateFields.push('approved_at = ?');
                updateValues.push(approved_for_public ? 1 : 0);
                updateValues.push(approval_notes || null);
                updateValues.push(approved_by || req.user.userId);
                const approvedAt = approved_at ? new Date(approved_at) : new Date();
                updateValues.push(approvedAt.toISOString().slice(0, 19).replace('T', ' '));
                
                if (revision_requested === undefined) {
                    updateFields.push('revision_requested = 0');
                    updateFields.push('revision_notes = NULL');
                }
            }

            if (updateFields.length === 0) {
                return res.status(400).json({ error: 'No update fields provided' });
            }

            updateValues.push(id);

            const query = `
                UPDATE kemri_projects
                SET ${updateFields.join(', ')}
                WHERE id = ? AND voided = 0
            `;

            const [result] = await pool.query(query, updateValues);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Project not found' });
            }

            let message = 'Project updated successfully';
            if (revision_requested) {
                message = 'Revision requested successfully';
            } else if (approved_for_public !== undefined) {
                message = `Project ${approved_for_public ? 'approved' : 'revoked'} for public viewing`;
            }

            res.json({
                success: true,
                message
            });
        }
    } catch (error) {
        console.error('=== ERROR UPDATING PROJECT APPROVAL ===');
        console.error('Error:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Request params:', req.params);
        console.error('Request body:', req.body);
        console.error('========================================');
        res.status(500).json({ 
            error: 'Failed to update approval status',
            details: error.message 
        });
    }
});

/**
 * @route PUT /api/projects/:id/progress
 * @description Update overall progress for a project (0, 25, 50, 75, 100)
 * @access Protected - requires public_content.approve privilege or admin role
 */
router.put('/:id/progress', async (req, res) => {
    // Check if user is authenticated
    if (!req.user) {
        return res.status(401).json({ 
            error: 'Authentication required' 
        });
    }
    
    // Check if user is admin or has public_content.approve privilege
    const isAdmin = privilege.isAdminLike(req.user);
    const hasPrivilege = req.user?.privileges?.includes('public_content.approve');
    
    if (!isAdmin && !hasPrivilege) {
        return res.status(403).json({ 
            error: 'Access denied. You do not have the necessary privileges to perform this action.' 
        });
    }
    
    try {
        const DB_TYPE = process.env.DB_TYPE || 'postgresql';
        const { id } = req.params;
        const { overallProgress } = req.body;

        // Validate progress value
        const validProgressValues = [0, 25, 50, 75, 100];
        if (overallProgress === undefined || overallProgress === null) {
            return res.status(400).json({ error: 'overallProgress is required' });
        }
        
        const progressValue = parseInt(overallProgress);
        if (isNaN(progressValue) || !validProgressValues.includes(progressValue)) {
            return res.status(400).json({ 
                error: 'overallProgress must be one of: 0, 25, 50, 75, 100' 
            });
        }

        console.log('=== UPDATING PROJECT PROGRESS ===');
        console.log('DB_TYPE:', DB_TYPE);
        console.log('Project ID:', id);
        console.log('Progress Value:', progressValue);

        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: Update progress JSONB field
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Get existing progress JSONB to merge
                const existingQuery = `SELECT progress FROM projects WHERE project_id = $1 AND voided = false`;
                const existingResult = await client.query(existingQuery, [id]);
                
                if (existingResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Project not found' });
                }

                const existingProgress = existingResult.rows[0].progress || {};
                
                // Merge new percentage_complete into existing progress JSONB
                const updatedProgress = {
                    ...existingProgress,
                    percentage_complete: progressValue
                };

                const updateQuery = `
                    UPDATE projects
                    SET progress = $1::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE project_id = $2 AND voided = false
                `;

                const updateResult = await client.query(updateQuery, [JSON.stringify(updatedProgress), id]);

                if (updateResult.rowCount === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Project not found' });
                }

                await client.query('COMMIT');

                console.log('=== PROGRESS UPDATE SUCCESSFUL (PostgreSQL) ===');

                res.json({
                    success: true,
                    message: `Project progress updated to ${progressValue}%`,
                    overallProgress: progressValue
                });
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } else {
            // MySQL: Update overallProgress column directly
            const query = `
                UPDATE kemri_projects
                SET overallProgress = ?
                WHERE id = ? AND voided = 0
            `;

            console.log('Query:', query);
            console.log('Query Params:', [progressValue, id]);

            const [result] = await pool.query(query, [progressValue, id]);

            console.log('Update result:', {
                affectedRows: result.affectedRows,
                insertId: result.insertId,
                changedRows: result.changedRows
            });

            if (result.affectedRows === 0) {
                console.log('No rows affected - project not found or already voided');
                return res.status(404).json({ error: 'Project not found' });
            }

            // Verify the update by fetching the updated value
            const [verifyRows] = await pool.query(
                'SELECT overallProgress FROM kemri_projects WHERE id = ? AND voided = 0',
                [id]
            );
            
            if (verifyRows.length > 0) {
                console.log('Verified updated progress:', verifyRows[0].overallProgress);
            }

            console.log('=== PROGRESS UPDATE SUCCESSFUL (MySQL) ===');

            res.json({
                success: true,
                message: `Project progress updated to ${progressValue}%`,
                overallProgress: progressValue
            });
        }
    } catch (error) {
        console.error('Error updating project progress:', error);
        res.status(500).json({ 
            error: 'Failed to update project progress',
            details: error.message 
        });
    }
});

async function ensureProjectUpdateHistoryTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_update_history (
            update_id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            status TEXT NULL,
            status_reason TEXT NULL,
            progress_summary TEXT NULL,
            overall_progress NUMERIC(6,2) NULL,
            created_by INTEGER NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
}

/**
 * @route GET /api/projects/:id/updates
 * @description Get project update history (newest first)
 */
router.get('/:id/updates', async (req, res) => {
    const projectId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(projectId)) {
        return res.status(400).json({ message: 'Invalid project ID' });
    }
    try {
        await ensureProjectUpdateHistoryTable();
        const result = await pool.query(
            `
            SELECT
                update_id AS "updateId",
                project_id AS "projectId",
                status,
                status_reason AS "statusReason",
                progress_summary AS "progressSummary",
                overall_progress AS "overallProgress",
                created_by AS "createdBy",
                created_at AS "createdAt"
            FROM project_update_history
            WHERE project_id = $1
              AND COALESCE(voided, false) = false
            ORDER BY created_at DESC, update_id DESC
            `,
            [projectId]
        );
        return res.status(200).json(result.rows || []);
    } catch (error) {
        console.error('Error fetching project updates:', error);
        return res.status(500).json({ message: 'Error fetching project updates', error: error.message });
    }
});

/**
 * @route POST /api/projects/:id/updates
 * @description Append a new project progress update and sync project latest fields.
 */
router.post('/:id/updates', async (req, res) => {
    const projectId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(projectId)) {
        return res.status(400).json({ message: 'Invalid project ID' });
    }

    const {
        status,
        statusReason,
        progressSummary,
        overallProgress,
    } = req.body || {};

    const hasAnyUpdate =
        (status && String(status).trim() !== '') ||
        (statusReason && String(statusReason).trim() !== '') ||
        (progressSummary && String(progressSummary).trim() !== '') ||
        (overallProgress !== undefined && overallProgress !== null && String(overallProgress).trim() !== '');
    if (!hasAnyUpdate) {
        return res.status(400).json({ message: 'Provide at least one update field.' });
    }

    try {
        await ensureProjectUpdateHistoryTable();
        const createdBy = req.user?.id ?? req.user?.userId ?? null;
        const progressNumber =
            overallProgress === undefined || overallProgress === null || String(overallProgress).trim() === ''
                ? null
                : Number(overallProgress);

        const insertResult = await pool.query(
            `
            INSERT INTO project_update_history
                (project_id, status, status_reason, progress_summary, overall_progress, created_by, created_at, voided)
            VALUES
                ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, false)
            RETURNING
                update_id AS "updateId",
                project_id AS "projectId",
                status,
                status_reason AS "statusReason",
                progress_summary AS "progressSummary",
                overall_progress AS "overallProgress",
                created_by AS "createdBy",
                created_at AS "createdAt"
            `,
            [
                projectId,
                status && String(status).trim() !== '' ? String(status).trim() : null,
                statusReason && String(statusReason).trim() !== '' ? String(statusReason).trim() : null,
                progressSummary && String(progressSummary).trim() !== '' ? String(progressSummary).trim() : null,
                Number.isFinite(progressNumber) ? progressNumber : null,
                createdBy,
            ]
        );
        const created = insertResult.rows?.[0] || null;

        // Keep latest project fields in sync with newest update (best-effort).
        if (created) {
            await pool.query(
                `
                UPDATE projects
                SET
                    status = COALESCE($1, status),
                    "statusReason" = COALESCE($2, "statusReason"),
                    "progressSummary" = COALESCE($3, "progressSummary"),
                    "overallProgress" = COALESCE($4, "overallProgress"),
                    updated_at = CURRENT_TIMESTAMP
                WHERE project_id = $5
                `,
                [created.status, created.statusReason, created.progressSummary, created.overallProgress, projectId]
            ).catch(() => {});
        }

        return res.status(201).json(created);
    } catch (error) {
        console.error('Error creating project update:', error);
        return res.status(500).json({ message: 'Error creating project update', error: error.message });
    }
});

/**
 * @route GET /api/projects/:id
 * @description Get a single active project by ID with joined data
 * @returns {Object} Project details with joined data
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ message: 'Invalid project ID' });
    }
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query = GET_SINGLE_PROJECT_QUERY(DB_TYPE);
        let params = [id];

        const authUserId = getScopeUserId(req.user);
        const authPrivileges = req.user?.privileges || [];
        if (DB_TYPE === 'postgresql' && authUserId && !isSuperAdminRequester(req.user) && !orgScope.userHasOrganizationBypass(authPrivileges)) {
            if (await orgScope.organizationScopeTableExists()) {
                const scopeRows = await orgScope.fetchOrganizationScopesForUser(authUserId);
                let hasProfileScopeContext = false;
                try {
                    const profileResult = await pool.query(
                        `SELECT agency_id, ministry, state_department
                         FROM users
                         WHERE userid = $1 AND COALESCE(voided, false) = false
                         LIMIT 1`,
                        [authUserId]
                    );
                    const profile = profileResult?.rows?.[0];
                    hasProfileScopeContext = Boolean(
                        profile &&
                        (
                            profile.agency_id !== null ||
                            (profile.ministry && String(profile.ministry).trim()) ||
                            (profile.state_department && String(profile.state_department).trim())
                        )
                    );
                } catch (profileErr) {
                    console.warn('Single project scope profile lookup failed, continuing with safe fallback:', profileErr.message);
                }

                if ((scopeRows || []).length > 0 || hasProfileScopeContext) {
                    query = orgScope.appendSingleProjectScopeWhereClause(query);
                    params = orgScope.singleProjectScopeParams(id, authUserId);
                }
            }
        }

        const result = await pool.execute(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const project = Array.isArray(rows) ? rows[0] : rows;
        if (project) {
            res.status(200).json(project);
        } else {
            res.status(404).json({ message: 'Project not found' });
        }
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ message: 'Error fetching project', error: error.message });
    }
});

/**
 * @route POST /api/projects/
 * @description Create a new project, with optional milestone generation
 * @returns {Object} Created project with joined data
 */
router.post('/', validateProject, async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId, ...projectData } = req.body;
    
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = req.user?.id || req.user?.userId || 1; // Placeholder for now

    let connection;
    try {
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: Use pool.query with BEGIN/COMMIT
            await pool.query('BEGIN');
        } else {
            // MySQL: Use connection transaction
            connection = await pool.getConnection();
            await connection.beginTransaction();
        }

        try {
            let newProjectId;
            
            if (DB_TYPE === 'postgresql') {
                // PostgreSQL: Map data to new JSONB structure
                const {
                    projectName,
                    projectDescription,
                    directorate,
                    startDate,
                    endDate,
                    costOfProject,
                    paidOut,
                    objective,
                    expectedOutput,
                    expectedOutcome,
                    status,
                    statusReason,
                    ProjectRefNum,
                    Contracted,
                    ministry,
                    stateDepartment,
                    sector,
                    finYearId,
                    programId,
                    subProgramId,
                    overallProgress,
                    county,
                    constituency,
                    ward,
                    budgetSource,
                    progressSummary,
                    latitude,
                    longitude,
                    feedbackEnabled
                } = projectData;
                
                // categoryId was extracted separately from req.body, use it here

                // Build JSONB objects
                const timeline = JSON.stringify({
                    start_date: startDate || null,
                    expected_completion_date: endDate || null,
                    financial_year: finYearId ? String(finYearId) : null
                });

                const budget = JSON.stringify({
                    allocated_amount_kes: costOfProject || 0,
                    disbursed_amount_kes: paidOut || 0,
                    contracted: Contracted || false,
                    budget_id: null,
                    source: budgetSource && budgetSource.trim() !== '' ? budgetSource.trim() : null
                });

                const progress = JSON.stringify({
                    status: status || 'Not Started',
                    status_reason: statusReason || null,
                    percentage_complete: overallProgress || 0,
                    latest_update_summary: progressSummary && progressSummary.trim() !== '' ? progressSummary.trim() : null
                });

                const notes = JSON.stringify({
                    objective: objective || null,
                    expected_output: expectedOutput || null,
                    expected_outcome: expectedOutcome || null,
                    program_id: programId || null,
                    subprogram_id: subProgramId || null
                });

                const dataSources = JSON.stringify({
                    project_ref_num: ProjectRefNum || null,
                    created_by_user_id: userId
                });

                const publicEngagement = JSON.stringify({
                    approved_for_public: false,
                    approved_by: null,
                    approved_at: null,
                    approval_notes: null,
                    revision_requested: false,
                    revision_notes: null,
                    revision_requested_by: null,
                    revision_requested_at: null,
                    revision_submitted_at: null,
                    feedback_enabled: feedbackEnabled !== undefined ? (feedbackEnabled === true || feedbackEnabled === 'true' || feedbackEnabled === 1) : true
                });

                const location = JSON.stringify({
                    county: county && county.trim() !== '' ? county.trim() : null,
                    constituency: constituency && constituency.trim() !== '' ? constituency.trim() : null,
                    ward: ward && ward.trim() !== '' ? ward.trim() : null,
                    geocoordinates: {
                        lat: latitude && latitude !== '' ? parseFloat(latitude) : null,
                        lng: longitude && longitude !== '' ? parseFloat(longitude) : null
                    }
                });

                // Build is_public JSONB with default approval structure
                const isPublic = JSON.stringify({
                    approved: false,
                    approved_by: null,
                    approved_at: null,
                    approval_notes: null,
                    revision_requested: false,
                    revision_notes: null,
                    revision_requested_by: null,
                    revision_requested_at: null,
                    revision_submitted_at: null
                });

                // Insert into PostgreSQL with JSONB structure
                const insertQuery = `
                    INSERT INTO projects (
                        name, description, implementing_agency, sector, ministry, state_department, category_id,
                        timeline, budget, progress, notes, data_sources, public_engagement, location,
                        is_public, created_at, updated_at, voided
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
                    RETURNING project_id
                `;
                
                const result = await pool.query(insertQuery, [
                    projectName,
                    projectDescription || null,
                    directorate || null,
                    sector !== undefined ? (sector || null) : null,
                    ministry || null,
                    stateDepartment || null,
                    categoryId ? parseInt(categoryId, 10) : null,
                    timeline,
                    budget,
                    progress,
                    notes,
                    dataSources,
                    publicEngagement,
                    location,
                    isPublic
                ]);
                
                newProjectId = result.rows[0].project_id;
            } else {
                // MySQL: Use old structure
                const newProject = {
                    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    userId,
                    ...projectData,
                };

                const [result] = await connection.query('INSERT INTO kemri_projects SET ?', newProject);
                newProjectId = result.insertId;
            }

            // NEW: Automatically create milestones from the category template
            // NOTE: PostgreSQL production schema currently does not have the expected milestone_name/sequence_order columns.
            // To avoid 500 errors when creating projects, we only run the legacy MySQL milestone template logic for now.
            if (categoryId && DB_TYPE !== 'postgresql') {
                const milestoneQuery =
                    'SELECT milestoneName, description, sequenceOrder FROM category_milestones WHERE categoryId = ?';

                const milestoneResult = await connection.query(milestoneQuery, [categoryId]);
                const milestoneTemplates = Array.isArray(milestoneResult) ? milestoneResult[0] : milestoneResult;

                if (milestoneTemplates && milestoneTemplates.length > 0) {
                    const milestoneValues = milestoneTemplates.map(m => [
                        newProjectId,
                        m.milestoneName,
                        m.description,
                        m.sequenceOrder,
                        'Not Started',
                        userId,
                        new Date().toISOString().slice(0, 19).replace('T', ' ')
                    ]);

                    await connection.query(
                        'INSERT INTO kemri_project_milestones (projectId, milestoneName, description, sequenceOrder, status, userId, createdAt) VALUES ?',
                        [milestoneValues]
                    );
                }
            }

            // Fetch the created project
            const query = GET_SINGLE_PROJECT_QUERY(DB_TYPE);
            const result = DB_TYPE === 'postgresql' 
                ? await pool.query(query, [newProjectId])
                : await connection.query(query, [newProjectId]);
            
            const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
            const project = Array.isArray(rows) ? rows[0] : rows;
            
            if (DB_TYPE === 'postgresql') {
                await pool.query('COMMIT');
            } else {
                await connection.commit();
            }

            const displayName = project?.name || project?.projectName || project?.project_name;
            void recordAudit({
                req,
                action: AUDIT_ACTIONS.PROJECT_CREATE,
                entityType: 'project',
                entityId: String(newProjectId),
                details: { name: displayName || null },
            });

            res.status(201).json(project || { id: newProjectId, message: 'Project created' });
        } catch (error) {
            if (DB_TYPE === 'postgresql') {
                await pool.query('ROLLBACK');
            } else {
                await connection.rollback();
                connection.release();
            }
            throw error;
        } finally {
            if (DB_TYPE !== 'postgresql' && connection) {
                connection.release();
            }
        }
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ message: 'Error creating project', error: error.message });
    }
});

// NEW: API Route to Apply Latest Milestone Templates
/**
 * @route POST /api/projects/:projectId/apply-template
 * @description Applies the latest milestones from a category template to an existing project.
 * @access Private (requires authentication and privilege)
 */
router.post('/apply-template/:projectId', async (req, res) => {
    const { projectId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        const [projectRows] = await pool.query('SELECT categoryId FROM kemri_projects WHERE id = ? AND voided = 0', [projectId]);
        const project = projectRows[0];

        if (!project || !project.categoryId) {
            return res.status(400).json({ message: 'Project not found or has no associated category' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [milestoneTemplates] = await connection.query(
                'SELECT milestoneName, description, sequenceOrder FROM category_milestones WHERE categoryId = ?',
                [project.categoryId]
            );

            // Fetch existing milestone names for the project to prevent duplicates
            const [existingMilestones] = await connection.query(
                'SELECT milestoneName FROM kemri_project_milestones WHERE projectId = ?',
                [projectId]
            );
            const existingMilestoneNames = new Set(existingMilestones.map(m => m.milestoneName));

            // Filter out templates that already exist in the project
            const milestonesToAdd = milestoneTemplates.filter(m => !existingMilestoneNames.has(m.milestoneName));

            if (milestonesToAdd.length > 0) {
                const milestoneValues = milestonesToAdd.map(m => [
                    projectId,
                    m.milestoneName,
                    m.description,
                    m.sequenceOrder,
                    'Not Started', // Initial status
                    userId, // Creator of the milestone
                    new Date().toISOString().slice(0, 19).replace('T', ' '),
                ]);

                await connection.query(
                    'INSERT INTO kemri_project_milestones (projectId, milestoneName, description, sequenceOrder, status, userId, createdAt) VALUES ?',
                    [milestoneValues]
                );
            }

            await connection.commit();
            res.status(200).json({ message: `${milestonesToAdd.length} new milestones applied from template` });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error applying milestone template:', error);
        res.status(500).json({ message: 'Error applying milestone template', error: error.message });
    }
});

/**
 * @route PUT /api/projects/:id
 * @description Update an existing project
 * @returns {Object} Updated project with joined data
 */
router.put('/:id', validateProject, async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) { return res.status(400).json({ message: 'Invalid project ID' }); }
    const projectData = { ...req.body };
    delete projectData.id;
    
    try {
        // PostgreSQL: Use pool.query with BEGIN/COMMIT
        await pool.query('BEGIN');
        
        try {
            // Map incoming fields to PostgreSQL JSONB structure
            const {
                projectName,
                projectDescription,
                directorate,
                startDate,
                endDate,
                costOfProject,
                paidOut,
                objective,
                expectedOutput,
                expectedOutcome,
                status,
                statusReason,
                ProjectRefNum,
                Contracted,
                ministry,
                stateDepartment,
                sector,
                categoryId,
                finYearId,
                programId,
                subProgramId,
                overallProgress,
                county,
                constituency,
                ward,
                budgetSource,
                progressSummary,
                latitude,
                longitude,
                feedbackEnabled,
                complaintsReceived,
                commonFeedback
            } = projectData;

            // Debug logging for sector, ministry, stateDepartment
            console.log('=== UPDATE PROJECT DEBUG ===');
            console.log('Project ID:', id);
            console.log('Sector value:', sector, 'Type:', typeof sector, 'Undefined:', sector === undefined);
            console.log('Ministry value:', ministry, 'Type:', typeof ministry, 'Undefined:', ministry === undefined);
            console.log('StateDepartment value:', stateDepartment, 'Type:', typeof stateDepartment, 'Undefined:', stateDepartment === undefined);
            console.log('Full projectData keys:', Object.keys(projectData));
            console.log('Full projectData:', JSON.stringify(projectData, null, 2));

            // Build JSONB objects for update
            // First, fetch existing project to merge with existing JSONB data
            const existingResult = await pool.query(
                'SELECT timeline, budget, progress, notes, data_sources, public_engagement, location FROM projects WHERE project_id = $1 AND voided = false',
                [id]
            );

            if (existingResult.rows.length === 0) {
                await pool.query('ROLLBACK');
                return res.status(404).json({ message: 'Project not found or already deleted' });
            }

            const existing = existingResult.rows[0];
            
            // Merge existing JSONB data with new values
            const existingTimeline = existing.timeline || {};
            const existingBudget = existing.budget || {};
            const existingProgress = existing.progress || {};
            const existingNotes = existing.notes || {};
            const existingDataSources = existing.data_sources || {};
            const existingPublicEngagement = existing.public_engagement || {};
            const existingLocation = existing.location || {};
            const existingGeocoordinates = existingLocation.geocoordinates || {};
            const normalizeOptionalText = (value) => {
                if (value === undefined || value === null) return null;
                const text = typeof value === 'string' ? value : String(value);
                const trimmed = text.trim();
                return trimmed === '' ? null : trimmed;
            };

            // Convert empty strings to null for dates
            const normalizedStartDate = startDate !== undefined 
                ? (startDate === '' || startDate === null ? null : startDate)
                : (existingTimeline.start_date || null);
            const normalizedEndDate = endDate !== undefined 
                ? (endDate === '' || endDate === null ? null : endDate)
                : (existingTimeline.expected_completion_date || null);

            const timeline = JSON.stringify({
                start_date: normalizedStartDate,
                expected_completion_date: normalizedEndDate,
                financial_year: finYearId !== undefined ? (finYearId ? String(finYearId) : null) : (existingTimeline.financial_year || null)
            });

            const budget = JSON.stringify({
                allocated_amount_kes: costOfProject !== undefined ? (costOfProject || 0) : (existingBudget.allocated_amount_kes || 0),
                disbursed_amount_kes: paidOut !== undefined ? (paidOut || 0) : (existingBudget.disbursed_amount_kes || 0),
                contracted: Contracted !== undefined ? Contracted : (existingBudget.contracted || false),
                budget_id: existingBudget.budget_id || null,
                source: budgetSource !== undefined 
                    ? normalizeOptionalText(budgetSource)
                    : (existingBudget.source || null)
            });

            const progress = JSON.stringify({
                status: status !== undefined ? status : (existingProgress.status || 'Not Started'),
                status_reason: statusReason !== undefined ? statusReason : (existingProgress.status_reason || null),
                percentage_complete: overallProgress !== undefined ? (overallProgress || 0) : (existingProgress.percentage_complete || 0),
                latest_update_summary: progressSummary !== undefined
                    ? (progressSummary && progressSummary.trim() !== '' ? progressSummary.trim() : null)
                    : (existingProgress.latest_update_summary || null)
            });

            const notes = JSON.stringify({
                objective: objective !== undefined ? objective : (existingNotes.objective || null),
                expected_output: expectedOutput !== undefined ? expectedOutput : (existingNotes.expected_output || null),
                expected_outcome: expectedOutcome !== undefined ? expectedOutcome : (existingNotes.expected_outcome || null),
                program_id: programId !== undefined ? programId : (existingNotes.program_id || null),
                subprogram_id: subProgramId !== undefined ? subProgramId : (existingNotes.subprogram_id || null)
            });

            const dataSources = JSON.stringify({
                project_ref_num: ProjectRefNum !== undefined ? ProjectRefNum : (existingDataSources.project_ref_num || null),
                created_by_user_id: existingDataSources.created_by_user_id || 1
            });

            // Build publicEngagement JSONB object
            const publicEngagement = JSON.stringify({
                approved_for_public: existingPublicEngagement.approved_for_public || false,
                approved_by: existingPublicEngagement.approved_by || null,
                approved_at: existingPublicEngagement.approved_at || null,
                approval_notes: existingPublicEngagement.approval_notes || null,
                revision_requested: existingPublicEngagement.revision_requested || false,
                revision_notes: existingPublicEngagement.revision_notes || null,
                revision_requested_by: existingPublicEngagement.revision_requested_by || null,
                revision_requested_at: existingPublicEngagement.revision_requested_at || null,
                revision_submitted_at: existingPublicEngagement.revision_submitted_at || null,
                feedback_enabled: feedbackEnabled !== undefined 
                    ? (feedbackEnabled === true || feedbackEnabled === 'true' || feedbackEnabled === 1)
                    : (existingPublicEngagement.feedback_enabled !== undefined ? existingPublicEngagement.feedback_enabled : true),
                complaints_received: complaintsReceived !== undefined && complaintsReceived !== null
                    ? Number(complaintsReceived)
                    : (existingPublicEngagement.complaints_received ?? 0),
                common_feedback: commonFeedback !== undefined && commonFeedback !== null
                    ? (typeof commonFeedback === 'string' ? commonFeedback.trim() || null : commonFeedback)
                    : (existingPublicEngagement.common_feedback ?? null)
            });

            // Build location JSONB object with county, constituency, ward, and geocoordinates
            const location = JSON.stringify({
                county: county !== undefined ? normalizeOptionalText(county) : (existingLocation.county || null),
                constituency: constituency !== undefined ? normalizeOptionalText(constituency) : (existingLocation.constituency || null),
                ward: ward !== undefined ? normalizeOptionalText(ward) : (existingLocation.ward || null),
                geocoordinates: {
                    lat: latitude !== undefined 
                        ? (latitude && latitude !== '' ? parseFloat(latitude) : null)
                        : (existingGeocoordinates.lat ?? null),
                    lng: longitude !== undefined
                        ? (longitude && longitude !== '' ? parseFloat(longitude) : null)
                        : (existingGeocoordinates.lng ?? null)
                }
            });

            // Build dynamic update query - only update fields that are provided
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;

            if (projectName !== undefined) {
                updateFields.push(`name = $${paramIndex++}`);
                updateValues.push(projectName);
            }
            if (projectDescription !== undefined) {
                updateFields.push(`description = $${paramIndex++}`);
                updateValues.push(projectDescription);
            }
            if (directorate !== undefined) {
                updateFields.push(`implementing_agency = $${paramIndex++}`);
                updateValues.push(directorate);
            }
            // Use 'in' operator to check if key exists in projectData, even if value is empty string or undefined
            if ('sector' in projectData) {
                console.log('Adding sector to update:', sector, 'Type:', typeof sector, 'Raw value:', projectData.sector);
                updateFields.push(`sector = $${paramIndex++}`);
                // Preserve the value if it's a non-empty string, otherwise set to null
                const sectorValue = (sector && typeof sector === 'string' && sector.trim() !== '') ? sector.trim() : null;
                console.log('Sector value to save:', sectorValue);
                updateValues.push(sectorValue);
            } else {
                console.log('Sector not in projectData, skipping update');
            }
            if ('ministry' in projectData) {
                console.log('Adding ministry to update:', ministry, 'Raw value:', projectData.ministry);
                updateFields.push(`ministry = $${paramIndex++}`);
                const ministryValue = (ministry && typeof ministry === 'string' && ministry.trim() !== '') ? ministry.trim() : null;
                console.log('Ministry value to save:', ministryValue);
                updateValues.push(ministryValue);
            } else {
                console.log('Ministry not in projectData, skipping update');
            }
            if ('stateDepartment' in projectData) {
                console.log('Adding stateDepartment to update:', stateDepartment, 'Raw value:', projectData.stateDepartment);
                updateFields.push(`state_department = $${paramIndex++}`);
                const stateDeptValue = (stateDepartment && typeof stateDepartment === 'string' && stateDepartment.trim() !== '') ? stateDepartment.trim() : null;
                console.log('StateDepartment value to save:', stateDeptValue);
                updateValues.push(stateDeptValue);
            } else {
                console.log('StateDepartment not in projectData, skipping update');
            }
            if ('categoryId' in projectData) {
                console.log('Adding categoryId to update:', categoryId, 'Raw value:', projectData.categoryId);
                updateFields.push(`category_id = $${paramIndex++}`);
                const categoryIdValue = (categoryId && categoryId !== '') ? parseInt(categoryId, 10) : null;
                console.log('CategoryId value to save:', categoryIdValue);
                updateValues.push(categoryIdValue);
            } else {
                console.log('CategoryId not in projectData, skipping update');
            }

            // Always update JSONB fields (they merge with existing data)
            updateFields.push(`timeline = $${paramIndex++}::jsonb`);
            updateValues.push(timeline);
            updateFields.push(`budget = $${paramIndex++}::jsonb`);
            updateValues.push(budget);
            updateFields.push(`progress = $${paramIndex++}::jsonb`);
            updateValues.push(progress);
            updateFields.push(`notes = $${paramIndex++}::jsonb`);
            updateValues.push(notes);
            updateFields.push(`data_sources = $${paramIndex++}::jsonb`);
            updateValues.push(dataSources);
            updateFields.push(`public_engagement = $${paramIndex++}::jsonb`);
            updateValues.push(publicEngagement);
            updateFields.push(`location = $${paramIndex++}::jsonb`);
            updateValues.push(location);

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

            // Add the project_id parameter for WHERE clause
            const whereParamIndex = paramIndex;
            updateValues.push(id);

            const updateQuery = `
                UPDATE projects SET
                    ${updateFields.join(', ')}
                WHERE project_id = $${whereParamIndex} AND voided = false
            `;
            
            const updateResult = await pool.query(updateQuery, updateValues);

            if (updateResult.rowCount === 0) {
                await pool.query('ROLLBACK');
                return res.status(404).json({ message: 'Project not found or already deleted' });
            }

            // Fetch the updated project
            const query = GET_SINGLE_PROJECT_QUERY('postgresql');
            const result = await pool.query(query, [id]);
            const project = result.rows && result.rows.length > 0 ? result.rows[0] : null;
            
            await pool.query('COMMIT');

            const displayName = project?.name || project?.projectName || project?.project_name;
            void recordAudit({
                req,
                action: AUDIT_ACTIONS.PROJECT_UPDATE,
                entityType: 'project',
                entityId: String(id),
                details: { name: displayName || null },
            });

            res.status(200).json(project);
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ message: 'Error updating project', error: error.message });
    }
});

/**
 * @route DELETE /api/projects/:id
 * @description Soft delete a project
 * @returns No content on success
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) { return res.status(400).json({ message: 'Invalid project ID' }); }
    
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                'UPDATE projects SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE project_id = $1 AND voided = false',
                [id]
            );
            if (!result.rowCount) {
                return res.status(404).json({ message: 'Project not found or already deleted' });
            }
            void recordAudit({
                req,
                action: AUDIT_ACTIONS.PROJECT_DELETE,
                entityType: 'project',
                entityId: String(id),
                details: { soft: true },
            });
            return res.status(200).json({ message: 'Project soft-deleted successfully' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query('UPDATE kemri_projects SET voided = 1 WHERE id = ? AND voided = 0', [id]);
            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Project not found or already deleted' });
            }
            await connection.commit();
            void recordAudit({
                req,
                action: AUDIT_ACTIONS.PROJECT_DELETE,
                entityType: 'project',
                entityId: String(id),
                details: { soft: true },
            });
            return res.status(200).json({ message: 'Project soft-deleted successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error soft-deleting project:', error);
        res.status(500).json({ message: 'Error soft-deleting project', error: error.message });
    }
});

// --- Junction Table Routes ---
router.get('/:projectId/counties', async (req, res) => {
    const { projectId } = req.params;
    if (isNaN(parseInt(projectId))) { return res.status(400).json({ message: 'Invalid project ID' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const [rows] = await pool.query(
            `SELECT pc.countyId, c.name AS countyName, pc.assignedAt
             FROM kemri_project_counties pc
             JOIN kemri_counties c ON pc.countyId = c.countyId
             WHERE pc.projectId = ?`, [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project counties:', error);
        res.status(500).json({ message: 'Error fetching project counties', error: error.message });
    }
});
router.post('/:projectId/counties', async (req, res) => {
    const { projectId } = req.params;
    const { countyId } = req.body;
    if (isNaN(parseInt(projectId)) || isNaN(parseInt(countyId))) { return res.status(400).json({ message: 'Invalid projectId or countyId' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                'INSERT INTO kemri_project_counties (projectId, countyId, assignedAt) VALUES (?, ?, NOW())', [projectId, countyId]
            );
            await connection.commit();
            res.status(201).json({ projectId: parseInt(projectId), countyId: parseInt(countyId), assignedAt: new Date() });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    } catch (error) {
        console.error('Error adding project county association:', error);
        if (error.code === 'ER_DUP_ENTRY') { return res.status(409).json({ message: 'This county is already associated with this project' }); }
        res.status(500).json({ message: 'Error adding project county association', error: error.message });
    }
});
router.delete('/:countyId', async (req, res) => {
    const { projectId, countyId } = req.params;
    if (isNaN(parseInt(projectId)) || isNaN(parseInt(countyId))) { return res.status(400).json({ message: 'Invalid projectId or countyId' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                'DELETE FROM kemri_project_counties WHERE projectId = ? AND countyId = ?', [projectId, countyId]
            );
            if (result.affectedRows === 0) { await connection.rollback(); return res.status(404).json({ message: 'Project-county association not found' }); }
            await connection.commit();
            res.status(204).send();
        } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch (error) {
        console.error('Error deleting project county association:', error);
        res.status(500).json({ message: 'Error deleting project county association', error: error.message });
    }
});

router.get('/:projectId/subcounties', async (req, res) => {
    const { projectId } = req.params;
    if (isNaN(parseInt(projectId))) { return res.status(400).json({ message: 'Invalid project ID' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const [rows] = await pool.query(
            `SELECT psc.subcountyId, sc.name AS subcountyName, sc.geoLat, sc.geoLon, psc.assignedAt
             FROM kemri_project_subcounties psc
             JOIN kemri_subcounties sc ON psc.subcountyId = sc.subcountyId
             WHERE psc.projectId = ? AND sc.voided = 0`, [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project subcounties:', error);
        res.status(500).json({ message: 'Error fetching project subcounties', error: error.message });
    }
});
router.post('/:projectId/subcounties', async (req, res) => {
    const { projectId } = req.params;
    const { subcountyId } = req.body;
    if (isNaN(parseInt(projectId)) || isNaN(parseInt(subcountyId))) { return res.status(400).json({ message: 'Invalid projectId or subcountyId' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                'INSERT INTO kemri_project_subcounties (projectId, subcountyId, assignedAt) VALUES (?, ?, NOW())', [projectId, subcountyId]
            );
            await connection.commit();
            res.status(201).json({ projectId: parseInt(projectId), subcountyId: parseInt(subcountyId), assignedAt: new Date() });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    } catch (error) {
        console.error('Error adding project subcounty association:', error);
        if (error.code === 'ER_DUP_ENTRY') { return res.status(409).json({ message: 'This subcounty is already associated with this project' }); }
        res.status(500).json({ message: 'Error adding project subcounty association', error: error.message });
    }
});
router.delete('/:subcountyId', async (req, res) => {
    const { projectId, subcountyId } = req.params;
    if (isNaN(parseInt(projectId)) || isNaN(parseInt(subcountyId))) { return res.status(400).json({ message: 'Invalid projectId or subcountyId' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                'DELETE FROM kemri_project_subcounties WHERE projectId = ? AND subcountyId = ?', [projectId, subcountyId]
            );
            if (result.affectedRows === 0) { await connection.rollback(); return res.status(404).json({ message: 'Project-subcounty association not found' }); }
            await connection.commit();
            res.status(204).send();
        } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch (error)
    {
        console.error('Error deleting project subcounty association:', error);
        res.status(500).json({ message: 'Error deleting project subcounty association', error: error.message });
    }
});

router.get('/:projectId/wards', async (req, res) => {
    const { projectId } = req.params;
    if (isNaN(parseInt(projectId))) { return res.status(400).json({ message: 'Invalid project ID' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const [rows] = await pool.query(
            `SELECT pw.wardId, w.name AS wardName, w.geoLat, w.geoLon, pw.assignedAt
             FROM kemri_project_wards pw
             JOIN kemri_wards w ON pw.wardId = w.wardId
             WHERE pw.projectId = ? AND w.voided = 0`, [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project wards:', error);
        res.status(500).json({ message: 'Error fetching project wards', error: error.message });
    }
});
router.post('/:projectId/wards', async (req, res) => {
    const { projectId } = req.params;
    const { wardId } = req.body;
    if (isNaN(parseInt(projectId)) || isNaN(parseInt(wardId))) { return res.status(400).json({ message: 'Invalid projectId or wardId' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                'INSERT INTO kemri_project_wards (projectId, wardId, assignedAt) VALUES (?, ?, NOW())', [projectId, wardId]
            );
            await connection.commit();
            res.status(201).json({ projectId: parseInt(projectId), wardId: parseInt(wardId), assignedAt: new Date() });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    } catch (error) {
        console.error('Error adding project ward association:', error);
        if (error.code === 'ER_DUP_ENTRY') { return res.status(409).json({ message: 'This ward is already associated with this project' }); }
        res.status(500).json({ message: 'Error adding project ward association', error: error.message });
    }
});
router.delete('/:wardId', async (req, res) => {
    const { projectId, wardId } = req.params;
    if (isNaN(parseInt(projectId)) || isNaN(parseInt(wardId))) { return res.status(400).json({ message: 'Invalid projectId or wardId' }); }
    if (!(await checkProjectExists(projectId))) { return res.status(404).json({ message: 'Project not found' }); }
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                'DELETE FROM kemri_project_wards WHERE projectId = ? AND wardId = ?', [projectId, wardId]
            );
            if (result.affectedRows === 0) { await connection.rollback(); return res.status(404).json({ message: 'Project-ward association not found' }); }
            await connection.commit();
            res.status(204).send();
        } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch (error)
    {
        console.error('Error deleting project ward association:', error);
        res.status(500).json({ message: 'Error deleting project ward association', error: error.message });
    }
});


/* */

module.exports = router;