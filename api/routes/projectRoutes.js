const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../config/db'); // Import the database connection pool
const multer = require('multer');
const xlsx = require('xlsx');
const { addStatusFilter } = require('../utils/statusFilterHelper');

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
                NULL AS "countyNames",
                NULL AS "subcountyNames",
                NULL AS "wardNames"
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
    if (!projectNameValue || !projectNameValue.trim()) {
        return res.status(400).json({ message: 'Missing required field: projectName or name' });
    }
    // Normalize to projectName for consistency
    if (name && !projectName) {
        req.body.projectName = name;
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
router.use('/:projectId/monitoring', projectMonitoringRoutes);


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
    Status: ['status', 'projectstatus', 'currentstatus'],
    budget: ['budget', 'estimatedcost', 'budgetkes', 'projectcost', 'costofproject'],
    amountPaid: ['amountpaid', 'disbursed', 'expenditure', 'paidout', 'amount paid'],
    Disbursed: ['disbursed', 'amountdisbursed', 'disbursedamount', 'amountpaid', 'paidout', 'amount paid', 'expenditure'],
    financialYear: ['financialyear', 'financial-year', 'financial year', 'fy', 'adp', 'year'],
    department: ['department', 'implementingdepartment'],
    directorate: ['directorate'],
    sector: ['sector', 'sectorname', 'category', 'categoryname'],
    implementing_agency: ['implementingagency', 'implementing agency', 'agency', 'implementingagencyname', 'agency name'],
    County: ['county', 'countyname', 'county name'],
    Constituency: ['constituency', 'constituencyname', 'constituency name'],
    'sub-county': ['subcounty', 'subcountyname', 'subcountyid', 'sub-county', 'subcounty_', 'sub county'],
    ward: ['ward', 'wardname', 'wardid', 'ward name'],
    Contracted: ['contracted', 'contractamount', 'contractedamount', 'contractsum', 'contract value', 'contract value (kes)'],
    StartDate: ['startdate', 'projectstartdate', 'commencementdate', 'start', 'start date'],
    EndDate: ['enddate', 'projectenddate', 'completiondate', 'end', 'end date']
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
 * @description Check metadata mappings for import data (departments, directorates, wards, subcounties)
 */
router.post('/check-metadata-mapping', async (req, res) => {
    const { dataToImport } = req.body || {};
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

    let connection;
    const mappingSummary = {
        departments: { existing: [], new: [], unmatched: [] },
        directorates: { existing: [], new: [], unmatched: [] },
        wards: { existing: [], new: [], unmatched: [] },
        subcounties: { existing: [], new: [], unmatched: [] },
        financialYears: { existing: [], new: [], unmatched: [] },
        totalRows: dataToImport.length,
        rowsWithUnmatchedMetadata: []
    };

    try {
        connection = await pool.getConnection();

        // Collect unique values from all rows
        const uniqueDepartments = new Set();
        const uniqueDirectorates = new Set();
        const uniqueWards = new Set();
        const uniqueSubcounties = new Set();
        const uniqueFinancialYears = new Set();

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

            if (dept) uniqueDepartments.add(dept);
            if (directorate) uniqueDirectorates.add(directorate);
            if (ward) uniqueWards.add(ward);
            if (subcounty) uniqueSubcounties.add(subcounty);
            if (finYear) uniqueFinancialYears.add(finYear);
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
            
            const unmatched = [];
            if (dept && !mappingSummary.departments.existing.includes(dept) && !mappingSummary.departments.new.includes(dept)) {
                unmatched.push(`Department: ${dept}`);
            }
            if (ward && !mappingSummary.wards.existing.includes(ward) && !mappingSummary.wards.new.includes(ward)) {
                unmatched.push(`Ward: ${ward}`);
            }
            if (subcounty && !mappingSummary.subcounties.existing.includes(subcounty) && !mappingSummary.subcounties.new.includes(subcounty)) {
                unmatched.push(`Sub-county: ${subcounty}`);
            }
            if (finYear && !mappingSummary.financialYears.existing.includes(finYear) && !mappingSummary.financialYears.new.includes(finYear)) {
                unmatched.push(`Financial Year: ${finYear}`);
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
    const { dataToImport } = req.body || {};
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

    let connection;
    const batchProjectMap = new Map(); // Track projects processed in this batch to prevent duplicates
    const summary = { 
        projectsCreated: 0, 
        projectsUpdated: 0, 
        linksCreated: 0, 
        errors: [],
        dataCorrections: [], // Track date and financial year corrections
        skippedMetadata: {
            departments: [],
            directorates: []
        }
    };

    // Helper function to normalize query results for PostgreSQL
    const getQueryRows = (result) => {
        return result.rows || [];
    };

    // Helper function to update project in PostgreSQL with JSONB structure
    const updateProjectInPostgreSQL = async (connection, projectId, projectPayload, departmentId, sectionId, locationData = null) => {
        // Get department and section names if IDs are available
        let ministry = null;
        let stateDepartment = null;
        
        if (departmentId) {
            const deptResult = await connection.query(
                'SELECT name FROM kemri_departments WHERE departmentId = $1 AND (voided IS NULL OR voided = false)',
                [departmentId]
            );
            const deptRows = getQueryRows(deptResult);
            if (deptRows.length > 0) {
                ministry = deptRows[0].name;
            }
        }
        
        if (sectionId) {
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
            contracted: projectPayload.Contracted || null
        });

        const progress = JSON.stringify({
            status: projectPayload.status || null,
            percentage_complete: null
        });

        const dataSources = JSON.stringify({
            created_by_user_id: 1 // TODO: Get from authenticated user
        });

        // Build location JSONB - use provided locationData or get existing location and merge
        let location = null;
        if (locationData) {
            location = JSON.stringify({
                county: locationData.county && locationData.county.trim() !== '' ? locationData.county.trim() : null,
                constituency: locationData.constituency && locationData.constituency.trim() !== '' ? locationData.constituency.trim() : null,
                ward: locationData.ward && locationData.ward.trim() !== '' ? locationData.ward.trim() : null
            });
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
                ${location ? 'location = $11::jsonb,' : ''}
                updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ${location ? '$12' : '$11'} AND voided = false
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
            dataSources
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
                    sectionId: (sectionId != null && !isNaN(sectionId)) ? sectionId : null, // Store sectionId when directorate is resolved
                    departmentId: (departmentId != null && !isNaN(departmentId)) ? departmentId : null,
                    Contracted: toMoney(row.Contracted),
                };
                
                // Remove any properties with NaN values to prevent MySQL errors
                Object.keys(projectPayload).forEach(key => {
                    const value = projectPayload[key];
                    if (value !== null && typeof value === 'number' && isNaN(value)) {
                        console.warn(`Row ${i + 2}: Removing NaN value for field "${key}"`);
                        projectPayload[key] = null;
                    }
                });

                // Extract location data from row (county, constituency, ward) for updates
                const countyName = normalizeStr(row.County || row.county || row['County Name']);
                const constituencyName = normalizeStr(row.Constituency || row.constituency || row['Constituency Name']);
                const wardName = normalizeStr(row.ward || row.Ward || row['Ward Name']);
                const locationData = {
                    county: countyName,
                    constituency: constituencyName,
                    ward: wardName
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
                            contracted: projectPayload.Contracted || null
                        });

                        const progress = JSON.stringify({
                            status: projectPayload.status || null,
                            percentage_complete: null
                        });

                        const notes = JSON.stringify({
                            objective: null,
                            expected_output: null,
                            expected_outcome: null,
                            program_id: null,
                            subprogram_id: null
                        });

                        const dataSources = JSON.stringify({
                            created_by_user_id: 1 // TODO: Get from authenticated user
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
                            revision_submitted_at: null
                        });

                        // Store location data in location JSONB field (county, constituency, ward)
                        const location = JSON.stringify({
                            county: countyName && countyName.trim() !== '' ? countyName.trim() : null,
                            constituency: constituencyName && constituencyName.trim() !== '' ? constituencyName.trim() : null,
                            ward: wardName && wardName.trim() !== '' ? wardName.trim() : null
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

                        // Get department and section names if IDs are available
                        let ministry = null;
                        let stateDepartment = null;
                        
                        if (departmentId) {
                            const deptResult = await connection.query(
                                'SELECT name FROM kemri_departments WHERE departmentId = $1 AND (voided IS NULL OR voided = false)',
                                [departmentId]
                            );
                            const deptRows = getQueryRows(deptResult);
                            if (deptRows.length > 0) {
                                ministry = deptRows[0].name;
                            }
                        }
                        
                        if (sectionId) {
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
        
        // Build a message about skipped metadata
        const skippedMessages = [];
        if (summary.skippedMetadata.departments.length > 0) {
            skippedMessages.push(`${summary.skippedMetadata.departments.length} department(s): ${summary.skippedMetadata.departments.join(', ')}`);
        }
        if (summary.skippedMetadata.directorates.length > 0) {
            skippedMessages.push(`${summary.skippedMetadata.directorates.length} directorate(s): ${summary.skippedMetadata.directorates.join(', ')}`);
        }
        
        let message = 'Projects imported successfully';
        if (skippedMessages.length > 0) {
            message += `. Note: Some metadata was not found and was skipped: ${skippedMessages.join('; ')}. Please create these in Metadata Management.`;
        }
        
        return res.status(200).json({ success: true, message, details: summary });
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
        // Resolve the path to the projects template stored under api/templates
        const templatePath = path.resolve(__dirname, '..', 'templates', 'projects_import_template.xlsx');
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
        const [rows] = await pool.query(
            `SELECT c.* FROM kemri_contractors c
             JOIN kemri_project_contractor_assignments pca ON c.contractorId = pca.contractorId
             WHERE pca.projectId = ?`,
            [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching contractors for project:', error);
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


// NEW: Route for fetching payment requests for a project
router.get('/:projectId/payment-requests', async (req, res) => {
    const { projectId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM kemri_project_payment_requests WHERE projectId = ? ORDER BY submittedAt DESC',
            [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching payment requests for project:', error);
        res.status(500).json({ message: 'Error fetching payment requests for project', error: error.message });
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
        const {
            projectName, startDate, endDate, status, departmentId, sectionId,
            finYearId, programId, subProgramId, countyId, subcountyId, wardId, categoryId, budgetId
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
                (p.budget->>'allocated_amount_kes')::numeric AS "costOfProject",
                (p.budget->>'disbursed_amount_kes')::numeric AS "paidOut",
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
                (p.progress->>'percentage_complete')::numeric AS "overallProgress",
                (p.budget->>'budget_id')::integer AS budgetId,
                (p.location->'geocoordinates'->>'lat')::numeric AS "latitude",
                (p.location->'geocoordinates'->>'lng')::numeric AS "longitude",
                (p.public_engagement->>'feedback_enabled')::boolean AS "feedbackEnabled",
                p.location->>'county' AS "countyNames",
                p.location->>'constituency' AS "constituencyNames",
                p.location->>'ward' AS "wardNames"
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
                NULL AS wardNames
        `;
        
        // This part dynamically builds the query.
        // County, Constituency, Ward are now retrieved from location JSONB in projects table
        let fromAndJoinClauses = DB_TYPE === 'postgresql' ? `
            FROM
                projects p
            LEFT JOIN programs pr ON (p.notes->>'program_id')::integer = pr."programId" AND (pr.voided IS NULL OR pr.voided = false)
            LEFT JOIN subprograms spr ON (p.notes->>'subprogram_id')::integer = spr."subProgramId" AND (spr.voided IS NULL OR spr.voided = false)
            LEFT JOIN categories cat ON p.category_id = cat."categoryId" AND (cat.voided IS NULL OR cat.voided = false)
        ` : `
            FROM
                projects p
        `;

        let queryParams = [];
        let whereConditions = [];
        
        if (DB_TYPE === 'postgresql') {
            whereConditions = ['p.voided = false'];
        } else {
            whereConditions = ['p.voided = 0'];
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

        // Build the final query (no location select clauses needed - already in BASE_PROJECT_SELECT as NULL)
        let query = `${BASE_PROJECT_SELECT} ${fromAndJoinClauses}`;

        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
        }
        // No GROUP BY needed since we're getting location data directly from JSONB, not using STRING_AGG
        query += ` ORDER BY ${DB_TYPE === 'postgresql' ? 'p.project_id' : 'p.id'}`;

        // Convert MySQL ? placeholders to PostgreSQL $1, $2, etc. if needed
        if (DB_TYPE === 'postgresql') {
            let paramIndex = 1;
            query = query.replace(/\?/g, () => `$${paramIndex++}`);
        }
        
        // Use execute for PostgreSQL to handle placeholder conversion
        const result = await pool.execute(query, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ message: 'Error fetching projects', error: error.message });
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
    const isAdmin = req.user?.roleName === 'admin';
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
    const isAdmin = req.user?.roleName === 'admin';
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
        const query = GET_SINGLE_PROJECT_QUERY(DB_TYPE);
        const result = await pool.execute(query, [id]);
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
                feedbackEnabled
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
                    ? (budgetSource && budgetSource.trim() !== '' ? budgetSource.trim() : null)
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
                    : (existingPublicEngagement.feedback_enabled !== undefined ? existingPublicEngagement.feedback_enabled : true)
            });

            // Build location JSONB object with county, constituency, ward, and geocoordinates
            const location = JSON.stringify({
                county: county !== undefined ? (county && county.trim() !== '' ? county.trim() : null) : (existingLocation.county || null),
                constituency: constituency !== undefined ? (constituency && constituency.trim() !== '' ? constituency.trim() : null) : (existingLocation.constituency || null),
                ward: ward !== undefined ? (ward && ward.trim() !== '' ? ward.trim() : null) : (existingLocation.ward || null),
                geocoordinates: {
                    lat: latitude !== undefined 
                        ? (latitude && latitude !== '' ? parseFloat(latitude) : null)
                        : (existingGeocoordinates.lat || null),
                    lng: longitude !== undefined
                        ? (longitude && longitude !== '' ? parseFloat(longitude) : null)
                        : (existingGeocoordinates.lng || null)
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
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query('UPDATE kemri_projects SET voided = 1 WHERE id = ? AND voided = 0', [id]);
            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Project not found or already deleted' });
            }
            await connection.commit();
            res.status(200).json({ message: 'Project soft-deleted successfully' });
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