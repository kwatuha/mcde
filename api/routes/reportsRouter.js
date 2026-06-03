const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Adjust the path as needed
const { addStatusFilter } = require('../utils/statusFilterHelper');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const orgScope = require('../services/organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');

// Helper function to get DB type
const getDBType = () => process.env.DB_TYPE || 'mysql';
const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.actualUserId ?? null;

async function addProjectScopeWhere(req, whereConditions, queryParams, projectAlias = 'p', placeholderIndex = null) {
    const DB_TYPE = getDBType();
    if (DB_TYPE !== 'postgresql') return placeholderIndex;

    const authUserId = getScopeUserId(req.user);
    const authPrivileges = req.user?.privileges || [];
    if (!authUserId) {
        whereConditions.push('FALSE');
        return placeholderIndex;
    }
    if (isSuperAdminRequester(req.user) || orgScope.userHasOrganizationBypass(authPrivileges)) {
        return placeholderIndex;
    }
    if (!(await orgScope.organizationScopeTableExists())) {
        whereConditions.push('FALSE');
        return placeholderIndex;
    }

    let nextIndex = Number.isFinite(Number(placeholderIndex))
        ? Number(placeholderIndex)
        : queryParams.length + 1;
    const scopeFragment = orgScope
        .buildProjectListScopeFragment(projectAlias)
        .replace(/\?/g, () => `$${nextIndex++}`);
    whereConditions.push(scopeFragment);
    queryParams.push(...orgScope.projectScopeParamTriple(authUserId));
    return nextIndex;
}

function cloneCellStyle(targetCell, sourceCell) {
    if (!targetCell || !sourceCell) return;
    if (sourceCell.style) targetCell.style = JSON.parse(JSON.stringify(sourceCell.style));
    if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
}

function fillTemplateFromSampleRow(ws, sampleRowIndex, dataRows) {
    if (!ws || !Number.isFinite(sampleRowIndex) || sampleRowIndex < 1) return;
    const sampleRow = ws.getRow(sampleRowIndex);
    const sampleCellCount = Math.max(sampleRow.cellCount || 0, sampleRow.actualCellCount || 0, 1);
    const sampleDefaults = [];
    for (let c = 1; c <= sampleCellCount; c++) {
        sampleDefaults[c] = sampleRow.getCell(c).value;
    }

    const rows = Array.isArray(dataRows) ? dataRows : [];
    if (rows.length === 0) {
        ws.spliceRows(sampleRowIndex, 1);
        return;
    }

    const existingFromSample = Math.max(0, ws.rowCount - sampleRowIndex + 1);
    if (rows.length > existingFromSample) {
        for (let k = 0; k < rows.length - existingFromSample; k++) {
            ws.insertRow(sampleRowIndex + existingFromSample + k, []);
        }
    } else if (rows.length < existingFromSample) {
        ws.spliceRows(sampleRowIndex + rows.length, existingFromSample - rows.length);
    }

    for (let r = 0; r < rows.length; r++) {
        const rowIndex = sampleRowIndex + r;
        const row = ws.getRow(rowIndex);
        row.height = sampleRow.height;
        for (let c = 1; c <= sampleCellCount; c++) {
            const cell = row.getCell(c);
            const src = sampleRow.getCell(c);
            cloneCellStyle(cell, src);
            const provided = rows[r][c - 1];
            cell.value = provided !== undefined ? provided : sampleDefaults[c];
        }
        row.commit();
    }
}

// Helper function to get project status field based on DB type
const getStatusField = (prefix = 'p') => {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        return `${prefix}.progress->>'status'`;
    }
    return `${prefix}.status`;
};

// Helper function to get project start date field based on DB type
const getStartDateField = (prefix = 'p') => {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        return `(${prefix}.timeline->>'start_date')::date`;
    }
    return `${prefix}.startDate`;
};

// Helper function to get project end date field based on DB type
const getEndDateField = (prefix = 'p') => {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        return `(${prefix}.timeline->>'expected_completion_date')::date`;
    }
    return `${prefix}.endDate`;
};

// Helper function to get project cost field based on DB type
const getCostField = (prefix = 'p') => {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        return `(${prefix}.budget->>'allocated_amount_kes')::numeric`;
    }
    return `${prefix}.costOfProject`;
};

// Helper function to get project paid field based on DB type
const getPaidField = (prefix = 'p') => {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        return `(${prefix}.budget->>'disbursed_amount_kes')::numeric`;
    }
    return `${prefix}.paidOut`;
};

// Helper function to get project ID field based on DB type
const getProjectIdField = (prefix = 'p') => {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        return `${prefix}.project_id`;
    }
    return `${prefix}.id`;
};

// Helper function to get department ID field based on DB type
const getDepartmentIdField = (prefix = 'p') => {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        return `${prefix}.state_department`; // County department text in PostgreSQL.
    }
    return `${prefix}.departmentId`;
};

// --- Department Summary Report Calls ---
/**
 * @route GET /api/reports/department-summary
 * @description Get aggregated project data grouped by department
 * @access Private (assuming authentication middleware is applied)
 * @returns {Array} List of departments with aggregated project metrics
 */
router.get('/department-summary', async (req, res) => {
    try {
        const { 
            finYearId, 
            status, 
            department, 
            projectType, 
            cidpPeriod, 
            financialYear, 
            startDate, 
            endDate, 
            projectStatus,
            section,
            subCounty,
            ward
        } = req.query;

        const DB_TYPE = getDBType();
        const placeholder = DB_TYPE === 'postgresql' ? '$' : '?';
        let placeholderIndex = 1;
        
        let whereConditions = [DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0'];
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
        const statusValue = status || projectStatus;
        if (statusValue) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`${getStatusField()} = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`${getStatusField()} = ${placeholder}`);
            }
            queryParams.push(statusValue);
            placeholderIndex++;
        }

        if (department) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.state_department = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`d.name = ${placeholder}`);
            }
            queryParams.push(department);
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
                whereConditions.push(`p.implementing_agency = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`(s.name = ${placeholder} OR s.sectionName = ${placeholder})`);
                queryParams.push(section);
            }
            queryParams.push(section);
            placeholderIndex++;
        }
        
        if (subCounty) {
            // Skip subcounty filter for PostgreSQL for now (table doesn't exist)
            if (DB_TYPE !== 'postgresql') {
                whereConditions.push(`EXISTS (
                    SELECT 1 FROM project_subcounties psc 
                    JOIN subcounties sc ON psc.subcountyId = sc.subcountyId
                    WHERE psc.projectId = ${getProjectIdField()} 
                    AND (sc.name = ${placeholder} OR sc.alias = ${placeholder})
                    AND psc.voided = 0
                )`);
                queryParams.push(subCounty, subCounty);
                placeholderIndex += 2;
            }
        }
        
        if (ward) {
            // Skip ward filter for PostgreSQL for now (table doesn't exist)
            if (DB_TYPE !== 'postgresql') {
                whereConditions.push(`EXISTS (
                    SELECT 1 FROM project_wards pw 
                    JOIN wards w ON pw.wardId = w.wardId
                    WHERE pw.projectId = ${getProjectIdField()} 
                    AND (w.name = ${placeholder} OR w.alias = ${placeholder})
                    AND pw.voided = 0
                )`);
                queryParams.push(ward, ward);
                placeholderIndex += 2;
            }
        }

        if (startDate) {
            whereConditions.push(`${getStartDateField()} >= ${placeholder}${placeholderIndex}`);
            queryParams.push(startDate);
            placeholderIndex++;
        }

        if (endDate) {
            whereConditions.push(`${getEndDateField()} <= ${placeholder}${placeholderIndex}`);
            queryParams.push(endDate);
            placeholderIndex++;
        }

        placeholderIndex = await addProjectScopeWhere(req, whereConditions, queryParams, 'p', placeholderIndex);

        let sqlQuery = `
            SELECT
                ${DB_TYPE === 'postgresql' ? 'COALESCE(p.state_department, \'Unassigned\')' : 'd.name'} AS "departmentName",
                ${DB_TYPE === 'postgresql' ? 'NULL' : 'd.alias'} AS "departmentAlias",
                COUNT(${getProjectIdField()}) AS "numProjects",
                SUM(${getCostField()}) AS "allocatedBudget",
                SUM(${getCostField()}) AS "contractSum",
                SUM(${getPaidField()}) AS "amountPaid",
                
                -- Calculate progress percentages using project fields directly
                CASE 
                    WHEN COUNT(${getProjectIdField()}) > 0 THEN 
                        (COUNT(CASE WHEN ${getStatusField()} = 'Completed' THEN 1 END) * 100.0 / COUNT(${getProjectIdField()}))
                    ELSE 0 
                END AS "percentCompleted",
                
                -- For quick figures, assume contract sum = allocated budget
                100.0 AS "percentBudgetContracted",
                
                CASE 
                    WHEN SUM(${getCostField()}) > 0 THEN 
                        (SUM(${getPaidField()}) * 100.0 / SUM(${getCostField()}))
                    ELSE 0 
                END AS "percentContractSumPaid",
                
                CASE 
                    WHEN SUM(${getCostField()}) > 0 THEN 
                        (SUM(${getPaidField()}) * 100.0 / SUM(${getCostField()}))
                    ELSE 0 
                END AS "percentAbsorptionRate"
            FROM
                projects p
        `;
        
        if (DB_TYPE !== 'postgresql') {
            sqlQuery += `
            LEFT JOIN
                departments d ON ${getDepartmentIdField()} = d.departmentId AND d.voided = 0
            `;
        }
        
        // Add project categories join if filtering by projectType (MySQL only)
        if (projectType && DB_TYPE !== 'postgresql') {
            sqlQuery += ` LEFT JOIN project_milestone_implementations pc ON p.categoryId = pc.categoryId`;
        }
        
        // Add sections join if filtering by section (MySQL only)
        if (section && DB_TYPE !== 'postgresql') {
            sqlQuery += ` LEFT JOIN sections s ON p.sectionId = s.sectionId`;
        }
        
        // Add subcounty/ward joins if filtering by location (MySQL only)
        if ((subCounty || ward) && DB_TYPE !== 'postgresql') {
            if (subCounty) {
                sqlQuery += ` LEFT JOIN project_subcounties psc ON ${getProjectIdField()} = psc.projectId AND psc.voided = 0`;
            }
            if (ward) {
                sqlQuery += ` LEFT JOIN project_wards pw ON ${getProjectIdField()} = pw.projectId AND pw.voided = 0`;
            }
        }
        
        const whereClause = whereConditions.length > 0 ? whereConditions.join(' AND ') : '1=1';
        if (DB_TYPE === 'postgresql') {
            sqlQuery += ` WHERE ${whereClause}
                GROUP BY
                    COALESCE(p.state_department, 'Unassigned')
                ORDER BY
                    COALESCE(p.state_department, 'Unassigned');
            `;
        } else {
            sqlQuery += ` WHERE ${whereClause} AND d.name IS NOT NULL
                GROUP BY
                    d.name, d.alias
                ORDER BY
                    d.name;
            `;
        }

        const result = await pool.execute(sqlQuery, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching department summary report:', error);
        res.status(500).json({
            message: 'Error fetching department summary report',
            error: error.message
        });
    }
});

/**
 * @route GET /api/reports/projects-by-department
 * @description Get individual projects for a specific department
 * @access Private
 * @param {string} departmentName - Name of the department
 * @returns {Array} List of projects for the specified department
 */
router.get('/projects-by-department', async (req, res) => {
    try {
        const { departmentName } = req.query;

        if (!departmentName) {
            return res.status(400).json({
                message: 'Department name is required',
                error: 'Missing departmentName parameter'
            });
        }

        const sqlQuery = `
            SELECT
                p.id,
                p.projectName,
                p.projectDescription,
                p.directorate,
                p.startDate,
                p.endDate,
                p.costOfProject AS allocatedBudget,
                p.costOfProject AS contractSum,
                p.paidOut AS amountPaid,
                p.objective,
                p.expectedOutput,
                p.principalInvestigator,
                p.expectedOutcome,
                p.status,
                p.statusReason,
                p.createdAt,
                p.updatedAt,
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
                s.firstName AS piFirstName,
                s.lastName AS piLastName,
                s.email AS piEmail,
                -- Calculate progress based on status
                CASE 
                    WHEN p.status = 'Completed' THEN 100
                    WHEN p.status = 'In Progress' THEN 75
                    WHEN p.status = 'At Risk' THEN 25
                    WHEN p.status = 'Delayed' THEN 50
                    WHEN p.status = 'Stalled' THEN 10
                    ELSE 0
                END AS percentCompleted,
                -- Calculate health score based on status and progress
                CASE 
                    WHEN p.status = 'Completed' THEN 100
                    WHEN p.status = 'In Progress' THEN 85
                    WHEN p.status = 'At Risk' THEN 30
                    WHEN p.status = 'Delayed' THEN 60
                    WHEN p.status = 'Stalled' THEN 20
                    ELSE 0
                END AS healthScore,
                -- Calculate absorption rate
                CASE 
                    WHEN p.costOfProject > 0 THEN 
                        ROUND((p.paidOut * 100.0 / p.costOfProject), 2)
                    ELSE 0
                END AS absorptionRate
            FROM
                projects p
            LEFT JOIN
                departments cd ON p.departmentId = cd.departmentId AND cd.voided = 0
            LEFT JOIN
                sections ds ON p.sectionId = ds.sectionId AND ds.voided = 0
            LEFT JOIN
                financialyears fy ON p.finYearId = fy.finYearId AND fy.voided = 0
            LEFT JOIN
                programs pr ON p.programId = pr.programId AND pr.voided = 0
            LEFT JOIN
                subprograms spr ON p.subProgramId = spr.subProgramId AND spr.voided = 0
            LEFT JOIN
                categories projCat ON p.categoryId = projCat.categoryId AND projCat.voided = 0
            LEFT JOIN
                staff s ON p.principalInvestigatorStaffId = s.staffId AND s.voided = 0
            WHERE
                p.voided = 0
                AND (cd.name = ? OR cd.alias = ?)
            ORDER BY
                p.projectName;
        `;

        const [rows] = await pool.query(sqlQuery, [departmentName, departmentName]);
        
        // Transform the data to match the expected format
        const transformedProjects = rows.map(project => ({
            id: project.id,
            projectName: project.projectName,
            department: project.departmentName,
            departmentAlias: project.departmentAlias,
            status: project.status,
            percentCompleted: project.percentCompleted,
            healthScore: project.healthScore,
            startDate: project.startDate,
            endDate: project.endDate,
            allocatedBudget: project.allocatedBudget,
            contractSum: project.contractSum,
            amountPaid: project.amountPaid,
            absorptionRate: project.absorptionRate,
            objective: project.objective,
            expectedOutput: project.expectedOutput,
            principalInvestigator: project.principalInvestigator,
            expectedOutcome: project.expectedOutcome,
            statusReason: project.statusReason,
            sectionName: project.sectionName,
            financialYearName: project.financialYearName,
            programName: project.programName,
            subProgramName: project.subProgramName,
            categoryName: project.categoryName,
            piFirstName: project.piFirstName,
            piLastName: project.piLastName,
            piEmail: project.piEmail
        }));

        res.status(200).json(transformedProjects);

    } catch (error) {
        console.error('Error fetching projects by department:', error);
        res.status(500).json({
            message: 'Error fetching projects by department',
            error: error.message
        });
    }
});


// --- Project Summary Report Calls ---
/**
 * @route GET /api/reports/project-status-summary
 * @description Get the count of projects by their status, with optional filters.
 */
router.get('/project-status-summary', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const placeholder = DB_TYPE === 'postgresql' ? '$' : '?';
        let placeholderIndex = 1;
        
        const { finYearId, departmentId, countyId, subcountyId, wardId } = req.query;
        let whereConditions = [
            DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0',
            DB_TYPE === 'postgresql' ? `${getStatusField()} IS NOT NULL` : 'p.status IS NOT NULL'
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
        if (departmentId) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.state_department = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.departmentId = ${placeholder}`);
            }
            queryParams.push(departmentId);
            placeholderIndex++;
        }
        // Location filters will require joins, similar to the main projects API
        // For simplicity, we'll assume a direct lookup for now
        // A more robust solution would involve conditional joins here
        placeholderIndex = await addProjectScopeWhere(req, whereConditions, queryParams, 'p', placeholderIndex);
        
        const pgWhereConditions = whereConditions;
        
        const sqlQuery = `
            SELECT
                ${getStatusField()} AS name,
                COUNT(${getProjectIdField()}) AS value
            FROM
                projects p
            ${pgWhereConditions.length > 0 ? `WHERE ${pgWhereConditions.join(' AND ')}` : ''}
            GROUP BY
                ${getStatusField()}
            ORDER BY
                name;
        `;
        
        const result = await pool.execute(sqlQuery, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching project status summary:', error);
        res.status(500).json({ message: 'Error fetching project status summary', error: error.message });
    }
});

/**
 * @route GET /api/reports/project-category-summary
 * @description Get the count of projects by their category, with optional filters.
 */
router.get('/project-category-summary', async (req, res) => {
    try {
        const DB_TYPE = getDBType();

        // For PostgreSQL, categories are stored as sector text on projects table.
        // For MySQL, we use the legacy project_milestone_implementations table.
        if (DB_TYPE === 'postgresql') {
            const { finYearId, departmentId } = req.query;
            const queryParams = [];
            let whereConditions = ['p.voided = false'];

            if (finYearId) {
                whereConditions.push(`(p.timeline->>'financial_year') = $${queryParams.length + 1}`);
                queryParams.push(finYearId);
            }
            if (departmentId) {
                whereConditions.push(`p.state_department = $${queryParams.length + 1}`);
                queryParams.push(departmentId);
            }
            await addProjectScopeWhere(req, whereConditions, queryParams, 'p');

            const sqlQuery = `
                SELECT
                    COALESCE(p.sector, 'Uncategorized') AS name,
                    COUNT(p.project_id) AS value
                FROM
                    projects p
                ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
                GROUP BY
                    COALESCE(p.sector, 'Uncategorized')
                ORDER BY
                    name;
            `;

            const result = await pool.execute(sqlQuery, queryParams);
            const rows = result.rows || result;
            return res.status(200).json(rows);
        } else {
            const { finYearId, departmentId } = req.query;
            let whereConditions = ['p.voided = 0', 'p.categoryId IS NOT NULL'];
            const queryParams = [];

            if (finYearId) {
                whereConditions.push('p.finYearId = ?');
                queryParams.push(finYearId);
            }
            if (departmentId) {
                whereConditions.push('p.departmentId = ?');
                queryParams.push(departmentId);
            }
            
            const sqlQuery = `
                SELECT
                    pc.categoryName AS name,
                    COUNT(p.id) AS value
                FROM
                    projects p
                LEFT JOIN
                    project_milestone_implementations pc ON p.categoryId = pc.categoryId
                ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
                GROUP BY
                    pc.categoryName
                ORDER BY
                    name;
            `;
            
            const [rows] = await pool.query(sqlQuery, queryParams);
            return res.status(200).json(rows);
        }

    } catch (error) {
        console.error('Error fetching project category summary:', error);
        // If table or column is missing, return empty data instead of 500
        if (error.message && (error.message.includes('does not exist') || error.message.includes('relation'))) {
            return res.status(200).json([]);
        }
        res.status(500).json({ message: 'Error fetching project category summary', error: error.message });
    }
});


// --- NEW: New Routes for Frontend Visualizations ---

/**
 * @route GET /api/reports/project-cost-by-department
 * @description Get the total budget and paid amounts grouped by department.
 */
router.get('/project-cost-by-department', async (req, res) => {
    try {
        const { finYearId, departmentId, countyId, subcountyId, wardId } = req.query;
        let whereConditions = ['p.voided = 0'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }
        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        
        // This query returns total cost and paid amounts by department
        const sqlQuery = `
            SELECT
                d.name AS departmentName,
                SUM(p.costOfProject) AS totalBudget,
                SUM(p.paidOut) AS totalPaid
            FROM
                projects p
            LEFT JOIN
                departments d ON p.departmentId = d.departmentId AND d.voided = 0
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                d.name
            ORDER BY
                totalBudget DESC;
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project cost by department:', error);
        res.status(500).json({ message: 'Error fetching project cost by department', error: error.message });
    }
});

/**
 * @route GET /api/reports/projects-over-time
 * @description Get the number of projects, total budget, and paid amounts grouped by financial year.
 */
router.get('/projects-over-time', async (req, res) => {
    try {
        const { departmentId, countyId, subcountyId, status } = req.query;
        let whereConditions = ['p.voided = 0', 'p.finYearId IS NOT NULL'];
        const queryParams = [];

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        if (countyId) {
            whereConditions.push('c.countyId = ?');
            queryParams.push(countyId);
        }
        if (subcountyId) {
            whereConditions.push('sc.subcountyId = ?');
            queryParams.push(subcountyId);
        }
        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        const sqlQuery = `
            SELECT
                fy.finYearName AS name,
                COUNT(p.id) AS value,
                SUM(p.costOfProject) AS totalBudget,
                SUM(p.paidOut) AS totalPaid
            FROM
                projects p
            JOIN
                financialyears fy ON p.finYearId = fy.finYearId
            LEFT JOIN
                project_counties pc ON p.id = pc.projectId
            LEFT JOIN
                counties c ON pc.countyId = c.countyId
            LEFT JOIN
                project_subcounties psc ON p.id = psc.projectId
            LEFT JOIN
                subcounties sc ON psc.subcountyId = sc.subcountyId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                fy.finYearName
            ORDER BY
                fy.finYearName;
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching yearly trends:', error);
        res.status(500).json({ message: 'Error fetching yearly trends', error: error.message });
    }
});


// --- Project List & Location Reports ---
/**
 * @route GET /api/reports/project-list-detailed
 * @description Get a detailed list of projects with filters.
 */
router.get('/project-list-detailed', async (req, res) => {
    try {
        const { finYearId, departmentId, status } = req.query;
        let whereConditions = ['p.voided = 0'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }
        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        const sqlQuery = `
            SELECT
                p.projectName,
                p.status,
                p.costOfProject,
                p.paidOut,
                p.startDate,
                p.endDate,
                p.id,
                fy.finYearName AS financialYearName,
                d.name AS departmentName,
                pc.categoryName AS projectCategory,
                c.name as countyName,   sc.name as subCountyName, w.name as wardName
            FROM
                projects p
            LEFT JOIN
                departments d ON p.departmentId = d.departmentId AND d.voided = 0
            LEFT JOIN
                financialyears fy ON p.finYearId = fy.finYearId 
            LEFT JOIN
                project_milestone_implementations pc ON p.categoryId = pc.categoryId
            LEFT JOIN
        project_counties pcc ON p.id = pcc.projectId
        LEFT JOIN
            counties c ON pcc.countyId = c.countyId
        LEFT JOIN
            project_subcounties psc ON p.id = psc.projectId
        LEFT JOIN
            subcounties sc ON psc.subcountyId = sc.subcountyId
        LEFT JOIN
            project_wards pw ON p.id = pw.projectId
        LEFT JOIN
            wards w ON pw.wardId = w.wardId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            ORDER BY
                p.id;
        `;
        console.log(sqlQuery)
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching detailed project list:', error);
        res.status(500).json({ message: 'Error fetching detailed project list', error: error.message });
    }
});

/**
 * @route GET /api/reports/subcounty-summary
 * @description Get project counts and financial metrics grouped by subcounty.
 */
router.get('/subcounty-summary', async (req, res) => {
    try {
        const { finYearId, departmentId, countyId, status } = req.query;
        let whereConditions = ['p.voided = 0', 'psc.subcountyId IS NOT NULL'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }
        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        if (countyId) {
            whereConditions.push('sc.countyId = ?');
            queryParams.push(countyId);
        }
        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        const sqlQuery = `
            SELECT
                sc.name AS name,
                c.name AS countyName,
                COUNT(p.id) AS projectCount,
                SUM(p.costOfProject) AS totalBudget,
                SUM(p.paidOut) AS totalPaid
            FROM
                projects p
            JOIN
                project_subcounties psc ON p.id = psc.projectId
            JOIN
                subcounties sc ON psc.subcountyId = sc.subcountyId
            JOIN
                counties c ON sc.countyId = c.countyId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                sc.name, c.name
            ORDER BY
                name;
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching subcounty summary:', error);
        res.status(500).json({ message: 'Error fetching subcounty summary', error: error.message });
    }
});

/**
 * @route GET /api/reports/ward-summary
 * @description Get project counts and financial metrics grouped by ward.
 */
router.get('/ward-summary', async (req, res) => {
    try {
        const { finYearId, departmentId, countyId, subcountyId, status } = req.query;
        let whereConditions = ['p.voided = 0', 'pw.wardId IS NOT NULL'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }
        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        if (countyId) {
            whereConditions.push('c.countyId = ?');
            queryParams.push(countyId);
        }
        if (subcountyId) {
            whereConditions.push('sc.subcountyId = ?');
            queryParams.push(subcountyId);
        }
        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        const sqlQuery = `
            SELECT
                w.name AS name,
                sc.name AS subcountyName,
                c.name AS countyName,
                COUNT(p.id) AS projectCount,
                SUM(p.costOfProject) AS totalBudget,
                SUM(p.paidOut) AS totalPaid
            FROM
                projects p
            JOIN
                project_wards pw ON p.id = pw.projectId
            JOIN
                wards w ON pw.wardId = w.wardId
            JOIN
                subcounties sc ON w.subcountyId = sc.subcountyId
            JOIN
                counties c ON sc.countyId = c.countyId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                w.name, sc.name, c.name
            ORDER BY
                name;
        `;
       
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching ward summary:', error);
        res.status(500).json({ message: 'Error fetching ward summary', error: error.message });
    }
});

/**
 * @route GET /api/reports/yearly-trends
 * @description Get total budget and paid amounts grouped by financial year.
 */
router.get('/yearly-trends', async (req, res) => {
    try {
        const { departmentId, countyId, subcountyId, status } = req.query;
        let whereConditions = ['p.voided = 0', 'p.finYearId IS NOT NULL'];
        const queryParams = [];

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        if (countyId) {
            whereConditions.push('c.countyId = ?');
            queryParams.push(countyId);
        }
        if (subcountyId) {
            whereConditions.push('sc.subcountyId = ?');
            queryParams.push(subcountyId);
        }
        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        const sqlQuery = `
            SELECT
                fy.finYearName AS name,
                COUNT(p.id) AS projectCount,
                SUM(p.costOfProject) AS totalBudget,
                SUM(p.paidOut) AS totalPaid
            FROM
                projects p
            JOIN
                financialyears fy ON p.finYearId = fy.finYearId
            LEFT JOIN
                project_counties pc ON p.id = pc.projectId
            LEFT JOIN
                counties c ON pc.countyId = c.countyId
            LEFT JOIN
                project_subcounties psc ON p.id = psc.projectId
            LEFT JOIN
                subcounties sc ON psc.subcountyId = sc.subcountyId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                fy.finYearName
            ORDER BY
                fy.finYearName;
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching yearly trends:', error);
        res.status(500).json({ message: 'Error fetching yearly trends', error: error.message });
    }
});

// --- NEWLY ADDED ROUTES ---

/**
 * @route GET /api/reports/projects-at-risk-budget
 * @description Get the total budget for projects that are 'At Risk' or 'Delayed'.
 */
/**
 * @route GET /api/reports/projects-at-risk-budget
 * @description Get the total budget for projects at risk compared to the total project budget.
 */
router.get('/projects-at-risk-budget', async (req, res) => {
    try {
        const { finYearId, departmentId, countyId, subcountyId, wardId } = req.query;
        let whereConditions = ['p.voided = 0'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }
        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        // NOTE: Additional location filters can be added here if needed.

        const sqlQuery = `
            SELECT
                SUM(p.costOfProject) AS totalProjectBudget,
                SUM(CASE WHEN p.status IN ('At Risk', 'Delayed') THEN p.costOfProject ELSE 0 END) AS atRiskBudget
            FROM
                projects p
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''};
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        
        // Transform the result into a format suitable for the frontend chart
        const chartData = [
            { name: 'Total Project Budget', value: rows[0].totalProjectBudget || 0 },
            { name: 'At-Risk Budget', value: rows[0].atRiskBudget || 0 }
        ];

        res.status(200).json(chartData);

    } catch (error) {
        console.error('Error fetching at-risk budget report:', error);
        res.status(500).json({ message: 'Error fetching at-risk budget report', error: error.message });
    }
});
/**
 * @route GET /api/reports/project-status-over-time
 * @description Get the count of projects in each status, grouped by year.
 */
router.get('/project-status-over-time', async (req, res) => {
    try {
        const { finYearId, departmentId } = req.query;
        let whereConditions = ['p.voided = 0', 'p.status IS NOT NULL', 'fy.finYearName IS NOT NULL'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }
        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        
        const sqlQuery = `
            SELECT
                fy.finYearName AS year,
                p.status AS status,
                COUNT(p.id) AS projectCount
            FROM
                projects p
            JOIN
                financialyears fy ON p.finYearId = fy.finYearId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                fy.finYearName, p.status
            ORDER BY
                fy.finYearName;
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching project status over time:', error);
        res.status(500).json({ message: 'Error fetching project status over time', error: error.message });
    }
});

// --- NEW: Summary KPIs Route ---
/**
 * @route GET /api/reports/summary-kpis
 * @description Get high-level summary KPIs (total projects, budget, paid) with filters.
 */
router.get('/summary-kpis', async (req, res) => {
    try {
        const { finYearId, departmentId, countyId, subcountyId, wardId, status } = req.query;
        let whereConditions = ['p.voided = 0'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }
        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        if (countyId) {
            whereConditions.push('pc.countyId = ?');
            queryParams.push(countyId);
        }
        if (subcountyId) {
            whereConditions.push('psc.subcountyId = ?');
            queryParams.push(subcountyId);
        }
        if (wardId) {
            whereConditions.push('pw.wardId = ?');
            queryParams.push(wardId);
        }
        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        const sqlQuery = `
            SELECT
                COUNT(DISTINCT p.id) AS totalProjects,
                SUM(p.costOfProject) AS totalBudget,
                SUM(p.paidOut) AS totalPaid
            FROM
                projects p
            LEFT JOIN
                project_counties pc ON p.id = pc.projectId
            LEFT JOIN
                project_subcounties psc ON p.id = psc.projectId
            LEFT JOIN
                project_wards pw ON p.id = pw.projectId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''};
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows[0] || {});

    } catch (error) {
        console.error('Error fetching summary KPIs:', error);
        res.status(500).json({ message: 'Error fetching summary KPIs', error: error.message });
    }
});

/**
 * @route GET /api/reports/projects-by-status-and-year
 * @description Get the count of projects in each status, grouped by financial year.
 */
router.get('/projects-by-status-and-year', async (req, res) => {
    try {
        const { departmentId, countyId, subcountyId, wardId } = req.query;
        let whereConditions = ['p.voided = 0', 'p.status IS NOT NULL', 'fy.finYearName IS NOT NULL'];
        const queryParams = [];

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }
        if (countyId) {
            whereConditions.push('c.countyId = ?');
            queryParams.push(countyId);
        }
        if (subcountyId) {
            whereConditions.push('sc.subcountyId = ?');
            queryParams.push(subcountyId);
        }
        if (wardId) {
            whereConditions.push('w.wardId = ?');
            queryParams.push(wardId);
        }

        const sqlQuery = `
            SELECT
                fy.finYearName AS year,
                p.status AS status,
                COUNT(p.id) AS projectCount
            FROM
                projects p
            JOIN
                financialyears fy ON p.finYearId = fy.finYearId
            LEFT JOIN
                project_counties pc ON p.id = pc.projectId
            LEFT JOIN
                counties c ON pc.countyId = c.countyId
            LEFT JOIN
                project_subcounties psc ON p.id = psc.projectId
            LEFT JOIN
                subcounties sc ON psc.subcountyId = sc.subcountyId
            LEFT JOIN
                project_wards pw ON p.id = pw.projectId
            LEFT JOIN
                wards w ON pw.wardId = w.wardId
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                fy.finYearName, p.status
            ORDER BY
                fy.finYearName, p.status;
        `;
        
        const [rows] = await pool.query(sqlQuery, queryParams);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching projects by status and year:', error);
        res.status(500).json({ message: 'Error fetching projects by status and year', error: error.message });
    }
});

/**
 * @route GET /api/reports/financial-status-by-project-status
 * @description Get the total budget and paid amounts grouped by project status.
 */
router.get('/financial-status-by-project-status', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const { finYearId, departmentId, countyId, subcountyId, wardId } = req.query;
        let whereConditions = [
            DB_TYPE === 'postgresql' ? 'p.voided = false' : 'p.voided = 0',
            `${getStatusField()} IS NOT NULL`
        ];
        const queryParams = [];
        const placeholder = DB_TYPE === 'postgresql' ? '$' : '?';
        let placeholderIndex = 1;

        if (finYearId) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`(p.timeline->>'financial_year') = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.finYearId = ${placeholder}`);
            }
            queryParams.push(finYearId);
            placeholderIndex++;
        }
        if (departmentId) {
            if (DB_TYPE === 'postgresql') {
                whereConditions.push(`p.state_department = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.departmentId = ${placeholder}`);
            }
            queryParams.push(departmentId);
            placeholderIndex++;
        }
        // Location filters can be added here with appropriate joins
        // For example, if (countyId) { whereConditions.push('c.countyId = ?'); queryParams.push(countyId); }
        placeholderIndex = await addProjectScopeWhere(req, whereConditions, queryParams, 'p', placeholderIndex);

        const sqlQuery = `
            SELECT
                ${getStatusField()} AS status,
                SUM(${getCostField()}) AS totalBudget,
                SUM(${getPaidField()}) AS totalPaid
            FROM
                projects p
            ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
            GROUP BY
                ${getStatusField()}
            ORDER BY
                ${getStatusField()};
        `;
        
        const result = DB_TYPE === 'postgresql' ? await pool.query(sqlQuery, queryParams) : await pool.query(sqlQuery, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching financial status by project status:', error);
        res.status(500).json({ message: 'Error fetching financial status by project status', error: error.message });
    }
});

// --- Filter Options Endpoints ---
/**
 * @route GET /api/reports/filter-options
 * @description Get all available filter options for the dashboard
 * @access Public (for now)
 * @returns {Object} Object containing arrays of filter options
 */
router.get('/filter-options', async (req, res) => {
    try {
        // Get departments
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let departments;
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL projects table might have different schema - try both
            try {
                const result = await pool.execute(`
                    SELECT DISTINCT d.name, d.alias 
                    FROM departments d
                    WHERE d.voided = false
                    ORDER BY d.name
                `);
                departments = result.rows || result;
            } catch (e) {
                // Fallback: just get all departments
                const result = await pool.execute(`
                    SELECT DISTINCT name, alias 
                    FROM departments
                    ORDER BY name
                `);
                departments = result.rows || result;
            }
        } else {
            const result = await pool.execute(`
                SELECT DISTINCT d.name, d.alias 
                FROM departments d
                INNER JOIN projects p ON d.departmentId = p.departmentId
                WHERE p.voided = 0
                ORDER BY d.name
            `);
            departments = Array.isArray(result) ? result[0] : result.rows || result;
        }

        // Get project types/categories (since projects don't have categoryId, get all categories)
        let projectTypes;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.execute(`
                SELECT DISTINCT pc."categoryName" as name 
                FROM categories pc
                WHERE (pc.voided = false OR pc.voided IS NULL)
                ORDER BY pc."categoryName"
            `);
            projectTypes = result.rows || result;
        } else {
            const result = await pool.execute(`
                SELECT DISTINCT pc.categoryName as name 
                FROM categories pc
                WHERE pc.voided = 0 OR pc.voided IS NULL
                ORDER BY pc.categoryName
            `);
            projectTypes = Array.isArray(result) ? result[0] : result.rows || result;
        }

        // Get project statuses
        let projectStatuses;
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL projects table stores status in JSONB progress field
            try {
                const result = await pool.execute(`
                    SELECT DISTINCT ${getStatusField()} AS status
                    FROM projects p
                    WHERE (p.voided = false OR p.voided IS NULL) AND ${getStatusField()} IS NOT NULL AND ${getStatusField()} != ''
                    ORDER BY ${getStatusField()}
                `);
                projectStatuses = result.rows || result;
            } catch (e) {
                // If status column doesn't exist, return empty array
                console.error('Error fetching project statuses:', e);
                projectStatuses = [];
            }
        } else {
            const result = await pool.execute(`
                SELECT DISTINCT p.status 
                FROM projects p
                WHERE p.voided = 0 AND p.status IS NOT NULL AND p.status != ''
                ORDER BY p.status
            `);
            projectStatuses = Array.isArray(result) ? result[0] : result.rows || result;
        }

        // Get financial years (since projects don't have finYearId, get all financial years)
        let financialYears;
        try {
            if (DB_TYPE === 'postgresql') {
                const result = await pool.execute(`
                    SELECT DISTINCT fy.finYearName as name, fy.finYearId as id
                    FROM financialyears fy
                    WHERE (fy.voided = false OR fy.voided IS NULL)
                    ORDER BY fy.finYearName DESC
                `);
                financialYears = result.rows || result;
            } else {
                const result = await pool.execute(`
                    SELECT DISTINCT fy.finYearName as name, fy.finYearId as id
                    FROM financialyears fy
                    WHERE fy.voided = 0 OR fy.voided IS NULL
                    ORDER BY fy.finYearName DESC
                `);
                financialYears = Array.isArray(result) ? result[0] : result.rows || result;
            }
        } catch (e) {
            financialYears = [];
        }

        // Get sections (using sectionId - we'll need to join with sections table if it exists)
        let sections;
        try {
            if (DB_TYPE === 'postgresql') {
                const result = await pool.execute(`
                    SELECT DISTINCT p.sectionId as name
                    FROM projects p
                    WHERE (p.voided = false OR p.voided IS NULL) AND p.sectionId IS NOT NULL
                    ORDER BY p.sectionId
                `);
                sections = result.rows || result;
            } else {
                const result = await pool.execute(`
                    SELECT DISTINCT p.sectionId as name
                    FROM projects p
                    WHERE p.voided = 0 AND p.sectionId IS NOT NULL
                    ORDER BY p.sectionId
                `);
                sections = Array.isArray(result) ? result[0] : result.rows || result;
            }
        } catch (e) {
            sections = [];
        }

        // Get sub-counties (not available in current schema)
        const subCounties = [];

        // Get wards (not available in current schema)
        const wards = [];

        res.json({
            departments: (departments || []).map(d => ({ name: d.name, alias: d.alias })),
            projectTypes: (projectTypes || []).map(pt => ({ name: pt.name })),
            projectStatuses: (projectStatuses || []).map(ps => ({ name: ps.status || ps.name })),
            financialYears: (financialYears || []).map(fy => ({ id: fy.id, name: fy.name })),
            sections: (sections || []).map(s => ({ name: s.section || s.name })),
            subCounties: (subCounties || []).map(sc => ({ name: sc.subCounty || sc.name })),
            wards: (wards || []).map(w => ({ name: w.ward || w.name }))
        });

    } catch (error) {
        console.error('Error fetching filter options:', error);
        res.status(500).json({ 
            error: 'Failed to fetch filter options',
            details: error.message 
        });
    }
});

// --- Annual Trends Endpoints ---
/**
 * @route GET /api/reports/annual-trends
 * @description Get historical trends data from earliest project date (2013/2014) to present
 * @query {number} [startYear] - Optional start year (defaults to earliest project year or 2013)
 * @query {number} [endYear] - Optional end year (defaults to current year)
 * @access Public (for now)
 * @returns {Object} Object containing arrays of trend data
 */
router.get('/annual-trends', async (req, res) => {
    try {
        const { startYear: queryStartYear, endYear: queryEndYear } = req.query;
        const currentYear = new Date().getFullYear();
        
        // Determine the actual year range from data
        let actualStartYear, actualEndYear;
        
        if (queryStartYear && queryEndYear) {
            // Use provided query parameters
            actualStartYear = parseInt(queryStartYear);
            actualEndYear = parseInt(queryEndYear);
        } else {
            // Find the earliest project startDate in the database
            const DB_TYPE = getDBType();
            let earliestProject;
            if (DB_TYPE === 'postgresql') {
                const earliestWhere = [
                    'p.voided = false',
                    `(p.timeline->>'start_date') IS NOT NULL`,
                ];
                const earliestParams = [];
                await addProjectScopeWhere(req, earliestWhere, earliestParams, 'p');
                const result = await pool.query(`
                    SELECT MIN(EXTRACT(YEAR FROM (p.timeline->>'start_date')::date)) as "earliestYear"
                    FROM projects p
                    WHERE ${earliestWhere.join(' AND ')}
                `, earliestParams);
                earliestProject = result.rows || result;
            } else {
                [earliestProject] = await pool.execute(`
                    SELECT MIN(YEAR(p.startDate)) as earliestYear
                    FROM projects p
                    WHERE p.voided = 0 AND p.startDate IS NOT NULL
                `);
            }
            
            const earliestYear = DB_TYPE === 'postgresql' 
                ? (earliestProject[0]?.earliestYear || earliestProject?.[0]?.['earliestYear'])
                : earliestProject[0]?.earliestYear;
            // Default to 2013 if no data found, or use query parameter if provided
            actualStartYear = queryStartYear ? parseInt(queryStartYear) : (earliestYear || 2013);
            actualEndYear = queryEndYear ? parseInt(queryEndYear) : currentYear;
        }
        
        // Ensure valid year range
        if (actualStartYear > actualEndYear) {
            return res.status(400).json({ 
                error: 'Invalid year range: startYear must be less than or equal to endYear' 
            });
        }
        
        const DB_TYPE = getDBType();
        const annualPgWhere = [
            'p.voided = false',
            `(p.timeline->>'start_date') IS NOT NULL`,
            `EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) >= $1`,
            `EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) <= $2`,
        ];
        const annualPgParams = [actualStartYear, actualEndYear];
        if (DB_TYPE === 'postgresql') {
            await addProjectScopeWhere(req, annualPgWhere, annualPgParams, 'p', 3);
        }
        // Get project performance trends
        let projectPerformance;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(`
                SELECT 
                    EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) as year,
                    COUNT(p.project_id) as "totalProjects",
                    COUNT(CASE WHEN ${getStatusField()} = 'Completed' THEN 1 END) as "completedProjects",
                    AVG((p.progress->>'percentage_complete')::numeric) as "avgProgress",
                    AVG(EXTRACT(EPOCH FROM ((${getEndDateField()}) - (${getStartDateField()}))) / 86400) as "avgDuration"
                FROM projects p
                WHERE ${annualPgWhere.join(' AND ')}
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date)
                ORDER BY year
            `, annualPgParams);
            projectPerformance = result.rows || result;
        } else {
            [projectPerformance] = await pool.execute(`
                SELECT 
                    YEAR(p.startDate) as year,
                    COUNT(p.id) as totalProjects,
                    COUNT(CASE WHEN p.status = 'Completed' THEN 1 END) as completedProjects,
                    AVG(p.overallProgress) as avgProgress,
                    AVG(DATEDIFF(p.endDate, p.startDate)) as avgDuration
                FROM projects p
                WHERE p.voided = 0 
                    AND p.startDate IS NOT NULL
                    AND YEAR(p.startDate) >= ?
                    AND YEAR(p.startDate) <= ?
                GROUP BY YEAR(p.startDate)
                ORDER BY year
            `, [actualStartYear, actualEndYear]);
        }

        // Get financial trends
        let financialTrends;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(`
                SELECT 
                    EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) as year,
                    SUM((${getCostField()})) as "totalBudget",
                    SUM((${getPaidField()})) as "totalExpenditure",
                    CASE 
                        WHEN SUM((${getCostField()})) > 0 THEN 
                            (SUM((${getPaidField()})) * 100.0 / SUM((${getCostField()})))
                        ELSE 0 
                    END as "absorptionRate"
                FROM projects p
                WHERE ${annualPgWhere.join(' AND ')}
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date)
                ORDER BY year
            `, annualPgParams);
            financialTrends = result.rows || result;
        } else {
            [financialTrends] = await pool.execute(`
                SELECT 
                    YEAR(p.startDate) as year,
                    SUM(p.costOfProject) as totalBudget,
                    SUM(p.paidOut) as totalExpenditure,
                    CASE 
                        WHEN SUM(p.costOfProject) > 0 THEN 
                            (SUM(p.paidOut) * 100.0 / SUM(p.costOfProject))
                        ELSE 0 
                    END as absorptionRate
                FROM projects p
                WHERE p.voided = 0 
                    AND p.startDate IS NOT NULL
                    AND YEAR(p.startDate) >= ?
                    AND YEAR(p.startDate) <= ?
                GROUP BY YEAR(p.startDate)
                ORDER BY year
            `, [actualStartYear, actualEndYear]);
        }

        // Get department trends
        let departmentTrends;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(`
                SELECT 
                    EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) as year,
                    p.state_department as "departmentName",
                    NULL as "departmentAlias",
                    COUNT(p.project_id) as "projectCount",
                    SUM((${getCostField()})) as "departmentBudget",
                    SUM((${getPaidField()})) as "departmentExpenditure"
                FROM projects p
                WHERE ${annualPgWhere.join(' AND ')}
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date), p.state_department
                ORDER BY year, p.state_department
            `, annualPgParams);
            departmentTrends = result.rows || result;
        } else {
            [departmentTrends] = await pool.execute(`
                SELECT 
                    YEAR(p.startDate) as year,
                    d.name as departmentName,
                    d.alias as departmentAlias,
                    COUNT(p.id) as projectCount,
                    SUM(p.costOfProject) as departmentBudget,
                    SUM(p.paidOut) as departmentExpenditure
                FROM projects p
                INNER JOIN departments d ON p.departmentId = d.departmentId
                WHERE p.voided = 0 
                    AND p.startDate IS NOT NULL
                    AND YEAR(p.startDate) >= ?
                    AND YEAR(p.startDate) <= ?
                GROUP BY YEAR(p.startDate), d.departmentId, d.name, d.alias
                ORDER BY year, d.name
            `, [actualStartYear, actualEndYear]);
        }

        // Get project status trends
        let statusTrends;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(`
                SELECT 
                    EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) as year,
                    ${getStatusField()} as status,
                    COUNT(p.project_id) as count
                FROM projects p
                WHERE ${annualPgWhere.join(' AND ')}
                    AND ${getStatusField()} IS NOT NULL
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date), ${getStatusField()}
                ORDER BY year, ${getStatusField()}
            `, annualPgParams);
            statusTrends = result.rows || result;
        } else {
            [statusTrends] = await pool.execute(`
                SELECT 
                    YEAR(p.startDate) as year,
                    p.status,
                    COUNT(p.id) as count
                FROM projects p
                WHERE p.voided = 0 
                    AND p.startDate IS NOT NULL
                    AND YEAR(p.startDate) >= ?
                    AND YEAR(p.startDate) <= ?
                    AND p.status IS NOT NULL
                GROUP BY YEAR(p.startDate), p.status
                ORDER BY year, p.status
            `, [actualStartYear, actualEndYear]);
        }

        // Calculate year-over-year growth rates
        const calculateGrowthRate = (current, previous) => {
            const currentNum = parseFloat(current) || 0;
            const previousNum = parseFloat(previous) || 0;
            if (previousNum === 0) return 0;
            return ((currentNum - previousNum) / previousNum * 100).toFixed(1);
        };

        // Process project performance with growth rates
        const processedProjectPerformance = projectPerformance.map((item, index) => {
            const previous = index > 0 ? projectPerformance[index - 1] : null;
            return {
                ...item,
                completionRate: item.totalProjects > 0 ? 
                    ((item.completedProjects / item.totalProjects) * 100).toFixed(1) : 0,
                growthRate: previous ? 
                    calculateGrowthRate(item.totalProjects, previous.totalProjects) : 0
            };
        });

        // Process financial trends with growth rates
        const processedFinancialTrends = financialTrends.map((item, index) => {
            const previous = index > 0 ? financialTrends[index - 1] : null;
            return {
                ...item,
                totalBudget: parseFloat(item.totalBudget) || 0,
                totalExpenditure: parseFloat(item.totalExpenditure) || 0,
                absorptionRate: parseFloat(item.absorptionRate) || 0,
                growthRate: previous ? 
                    calculateGrowthRate(parseFloat(item.totalBudget) || 0, parseFloat(previous.totalBudget) || 0) : 0,
                budgetEfficiency: (parseFloat(item.totalBudget) || 0) > 0 ? 
                    ((parseFloat(item.totalExpenditure) || 0) / (parseFloat(item.totalBudget) || 0) * 100).toFixed(1) : 0
            };
        });

        // Ensure we have data for all years in the range, even if they're empty
        const yearCount = actualEndYear - actualStartYear + 1;
        const allYears = Array.from({length: yearCount}, (_, i) => actualStartYear + i);
        
        // Fill in missing years with zero data
        const completeProjectPerformance = allYears.map(year => {
            const existing = processedProjectPerformance.find(item => item.year === year);
            return existing || {
                year: year,
                totalProjects: 0,
                completedProjects: 0,
                avgProgress: 0,
                avgDuration: 0,
                completionRate: 0,
                growthRate: 0
            };
        });

        const completeFinancialTrends = allYears.map(year => {
            const existing = processedFinancialTrends.find(item => item.year === year);
            return existing || {
                year: year,
                totalBudget: 0,
                totalExpenditure: 0,
                absorptionRate: 0,
                growthRate: 0,
                budgetEfficiency: 0
            };
        });

        res.json({
            projectPerformance: completeProjectPerformance,
            financialTrends: completeFinancialTrends,
            departmentTrends: departmentTrends,
            statusTrends: statusTrends,
            yearRange: {
                start: actualStartYear,
                end: actualEndYear,
                years: allYears
            }
        });

    } catch (error) {
        console.error('Error fetching annual trends:', error);
        res.status(500).json({ 
            error: 'Failed to fetch annual trends',
            details: error.message 
        });
    }
});

// --- Regional Data Endpoints ---

/**
 * @route GET /api/reports/counties
 * @description Get county-level data for Kitui County
 * @access Public (for now)
 * @returns {Object} County data with projects and metrics
 */
router.get('/counties', async (req, res) => {
    try {
        // Get Kitui County data using project mappings
        const [countyData] = await pool.execute(`
            SELECT 
                c.countyId,
                c.name as countyName,
                c.geoLat,
                c.geoLon,
                COUNT(DISTINCT s.subcountyId) as totalSubCounties,
                COUNT(DISTINCT w.wardId) as totalWards,
                COUNT(DISTINCT p.id) as totalProjects,
                COALESCE(SUM(p.costOfProject), 0) as totalBudget,
                COALESCE(SUM(p.paidOut), 0) as totalPaid,
                COALESCE(AVG(p.overallProgress), 0) as avgProgress
            FROM counties c
            LEFT JOIN subcounties s ON c.countyId = s.countyId AND s.voided = 0
            LEFT JOIN wards w ON s.subcountyId = w.subcountyId AND w.voided = 0
            LEFT JOIN project_subcounties ps ON s.subcountyId = ps.subcountyId AND ps.voided = 0
            LEFT JOIN projects p ON ps.projectId = p.id AND p.voided = 0
            WHERE c.countyId = 15 AND c.voided = 0
            GROUP BY c.countyId, c.name, c.geoLat, c.geoLon
        `);

        // Get project status distribution
        const [projectStatus] = await pool.execute(`
            SELECT 
                p.status,
                COUNT(*) as count
            FROM projects p
            WHERE p.voided = 0
            GROUP BY p.status
        `);

        // Get budget allocation by sub-county using project mappings
        const [budgetAllocation] = await pool.execute(`
            SELECT 
                s.name as subcountyName,
                COALESCE(SUM(p.costOfProject), 0) as budget
            FROM subcounties s
            LEFT JOIN project_subcounties ps ON s.subcountyId = ps.subcountyId AND ps.voided = 0
            LEFT JOIN projects p ON ps.projectId = p.id AND p.voided = 0
            WHERE s.countyId = 15 AND s.voided = 0
            GROUP BY s.subcountyId, s.name
            ORDER BY budget DESC
        `);

        res.json({
            countyData: countyData[0] || {},
            projectStatus: projectStatus,
            budgetAllocation: budgetAllocation,
            projectProgress: countyData
        });

    } catch (error) {
        console.error('Error fetching counties data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch counties data',
            details: error.message 
        });
    }
});

/**
 * @route GET /api/reports/sub-counties
 * @description Get sub-county level data for Kitui County
 * @access Public (for now)
 * @returns {Object} Sub-county data with projects and metrics
 */
router.get('/sub-counties', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        let subCounties;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: Junction tables may not exist, return empty for now
            subCounties = [];
        } else {
            [subCounties] = await pool.execute(`
                SELECT 
                    s.subcountyId,
                    s.name as subcountyName,
                    s.geoLat,
                    s.geoLon,
                    COUNT(DISTINCT w.wardId) as totalWards,
                    COUNT(DISTINCT p.id) as totalProjects,
                    COALESCE(SUM(p.costOfProject), 0) as totalBudget,
                    COALESCE(SUM(p.paidOut), 0) as totalPaid,
                    COALESCE(AVG(p.overallProgress), 0) as avgProgress,
                    CASE 
                        WHEN SUM(p.costOfProject) > 0 THEN 
                            (SUM(p.paidOut) * 100.0 / SUM(p.costOfProject))
                        ELSE 0 
                    END as absorptionRate
                FROM subcounties s
                LEFT JOIN wards w ON s.subcountyId = w.subcountyId AND w.voided = 0
                LEFT JOIN project_subcounties ps ON s.subcountyId = ps.subcountyId AND ps.voided = 0
                LEFT JOIN projects p ON ps.projectId = p.id AND p.voided = 0
                WHERE s.countyId = 1 AND s.voided = 0
                GROUP BY s.subcountyId, s.name, s.geoLat, s.geoLon
                ORDER BY s.name
            `);
        }

        res.json({
            subCounties: subCounties || [],
            projectProgress: subCounties || []
        });

    } catch (error) {
        console.error('Error fetching sub-counties data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch sub-counties data',
            details: error.message 
        });
    }
});

/**
 * @route GET /api/reports/wards
 * @description Get ward level data for Kitui County
 * @access Public (for now)
 * @returns {Object} Ward data with projects and metrics
 */
router.get('/wards', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const { subCounty } = req.query;
        let wards;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: Junction tables may not exist, return empty for now
            wards = [];
        } else {
            let query = `
                SELECT 
                    w.wardId,
                    w.name as wardName,
                    s.name as subcountyName,
                    w.geoLat,
                    w.geoLon,
                    COUNT(DISTINCT p.id) as totalProjects,
                    COALESCE(SUM(p.costOfProject), 0) as totalBudget,
                    COALESCE(SUM(p.paidOut), 0) as totalPaid,
                    COALESCE(AVG(p.overallProgress), 0) as avgProgress,
                    CASE 
                        WHEN SUM(p.costOfProject) > 0 THEN 
                            (SUM(p.paidOut) * 100.0 / SUM(p.costOfProject))
                        ELSE 0 
                    END as absorptionRate
                FROM wards w
                INNER JOIN subcounties s ON w.subcountyId = s.subcountyId
                LEFT JOIN project_wards pw ON w.wardId = pw.wardId AND pw.voided = 0
                LEFT JOIN projects p ON pw.projectId = p.id AND p.voided = 0
                WHERE s.countyId = 1 AND w.voided = 0
            `;
            
            if (subCounty) {
                query += ` AND s.name = ?`;
                [wards] = await pool.execute(query + ` GROUP BY w.wardId, w.name, s.name, w.geoLat, w.geoLon ORDER BY s.name, w.name`, [subCounty]);
            } else {
                [wards] = await pool.execute(query + ` GROUP BY w.wardId, w.name, s.name, w.geoLat, w.geoLon ORDER BY s.name, w.name`);
            }
        }

        res.json({
            wards: wards || [],
            projectProgress: wards || []
        });

    } catch (error) {
        console.error('Error fetching wards data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch wards data',
            details: error.message 
        });
    }
});

/**
 * @route GET /api/reports/villages
 * @description Get village level data for Kitui County (using wards as villages for now)
 * @access Public (for now)
 * @returns {Object} Village data with projects and metrics
 */
router.get('/villages', async (req, res) => {
    try {
        // For now, we'll use wards as villages since we don't have a villages table
        const [villages] = await pool.execute(`
            SELECT 
                w.wardId as villageId,
                w.name as villageName,
                s.name as subcountyName,
                w.name as wardName,
                w.geoLat,
                w.geoLon,
                COUNT(DISTINCT p.id) as totalProjects,
                COALESCE(SUM(p.costOfProject), 0) as totalBudget,
                COALESCE(SUM(p.paidOut), 0) as totalPaid,
                COALESCE(AVG(p.overallProgress), 0) as avgProgress,
                CASE 
                    WHEN SUM(p.costOfProject) > 0 THEN 
                        (SUM(p.paidOut) * 100.0 / SUM(p.costOfProject))
                    ELSE 0 
                END as absorptionRate
            FROM wards w
            INNER JOIN subcounties s ON w.subcountyId = s.subcountyId
            LEFT JOIN project_wards pw ON w.wardId = pw.wardId AND pw.voided = 0
            LEFT JOIN projects p ON pw.projectId = p.id AND p.voided = 0
            WHERE s.countyId = 1 AND w.voided = 0
            GROUP BY w.wardId, w.name, s.name, w.geoLat, w.geoLon
            ORDER BY s.name, w.name
        `);

        res.json({
            villages: villages,
            projectProgress: villages
        });

    } catch (error) {
        console.error('Error fetching villages data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch villages data',
            details: error.message 
        });
    }
});

/**
 * @route GET /api/reports/projects-by-county
 * @description Get projects for a specific county
 * @access Public (for now)
 * @returns {Array} Array of projects
 */
router.get('/projects-by-county', async (req, res) => {
    try {
        const { county } = req.query;
        
        const [projects] = await pool.execute(`
            SELECT 
                p.id,
                p.projectName,
                'Kitui' as countyName,
                'N/A' as subcountyName,
                'N/A' as wardName,
                p.status,
                p.overallProgress as percentCompleted,
                p.healthScore,
                p.startDate,
                p.endDate,
                p.costOfProject as allocatedBudget,
                p.contractSum,
                p.paidOut as amountPaid,
                CASE 
                    WHEN p.costOfProject > 0 THEN 
                        (p.paidOut * 100.0 / p.costOfProject)
                    ELSE 0 
                END as absorptionRate,
                p.objective,
                p.expectedOutput,
                p.expectedOutcome,
                p.principalInvestigator,
                p.statusReason
            FROM projects p
            WHERE p.voided = 0
            ORDER BY p.projectName
        `);

        res.json(projects);

    } catch (error) {
        console.error('Error fetching projects by county:', error);
        res.status(500).json({ 
            error: 'Failed to fetch projects by county',
            details: error.message 
        });
    }
});

/**
 * @route GET /api/reports/projects-by-sub-county
 * @description Get projects for a specific sub-county
 * @access Public (for now)
 * @returns {Array} Array of projects
 */
router.get('/projects-by-sub-county', async (req, res) => {
    try {
        const { subCounty } = req.query;
        
        const [projects] = await pool.execute(`
            SELECT 
                p.id,
                p.projectName,
                'Kitui' as countyName,
                ? as subcountyName,
                'N/A' as wardName,
                p.status,
                p.overallProgress as percentCompleted,
                p.healthScore,
                p.startDate,
                p.endDate,
                p.costOfProject as allocatedBudget,
                p.contractSum,
                p.paidOut as amountPaid,
                CASE 
                    WHEN p.costOfProject > 0 THEN 
                        (p.paidOut * 100.0 / p.costOfProject)
                    ELSE 0 
                END as absorptionRate,
                p.objective,
                p.expectedOutput,
                p.expectedOutcome,
                p.principalInvestigator,
                p.statusReason
            FROM projects p
            WHERE p.voided = 0
            ORDER BY p.projectName
        `, [subCounty]);

        res.json(projects);

    } catch (error) {
        console.error('Error fetching projects by sub-county:', error);
        res.status(500).json({ 
            error: 'Failed to fetch projects by sub-county',
            details: error.message 
        });
    }
});

/**
 * @route GET /api/reports/projects-by-ward
 * @description Get projects for a specific ward
 * @access Public (for now)
 * @returns {Array} Array of projects
 */
router.get('/projects-by-ward', async (req, res) => {
    try {
        const { ward } = req.query;
        
        const [projects] = await pool.execute(`
            SELECT 
                p.id,
                p.projectName,
                'Kitui' as countyName,
                'N/A' as subcountyName,
                ? as wardName,
                p.status,
                p.overallProgress as percentCompleted,
                p.healthScore,
                p.startDate,
                p.endDate,
                p.costOfProject as allocatedBudget,
                p.contractSum,
                p.paidOut as amountPaid,
                CASE 
                    WHEN p.costOfProject > 0 THEN 
                        (p.paidOut * 100.0 / p.costOfProject)
                    ELSE 0 
                END as absorptionRate,
                p.objective,
                p.expectedOutput,
                p.expectedOutcome,
                p.principalInvestigator,
                p.statusReason
            FROM projects p
            WHERE p.voided = 0
            ORDER BY p.projectName
        `, [ward]);

        res.json(projects);

    } catch (error) {
        console.error('Error fetching projects by ward:', error);
        res.status(500).json({ 
            error: 'Failed to fetch projects by ward',
            details: error.message 
        });
    }
});

/**
 * @route GET /api/reports/projects-by-village
 * @description Get projects for a specific village (using ward for now)
 * @access Public (for now)
 * @returns {Array} Array of projects
 */
router.get('/projects-by-village', async (req, res) => {
    try {
        const { village } = req.query;
        
        const [projects] = await pool.execute(`
            SELECT 
                p.id,
                p.projectName,
                'Kitui' as countyName,
                'N/A' as subcountyName,
                ? as wardName,
                ? as villageName,
                p.status,
                p.overallProgress as percentCompleted,
                p.healthScore,
                p.startDate,
                p.endDate,
                p.costOfProject as allocatedBudget,
                p.contractSum,
                p.paidOut as amountPaid,
                CASE 
                    WHEN p.costOfProject > 0 THEN 
                        (p.paidOut * 100.0 / p.costOfProject)
                    ELSE 0 
                END as absorptionRate,
                p.objective,
                p.expectedOutput,
                p.expectedOutcome,
                p.principalInvestigator,
                p.statusReason
            FROM projects p
            WHERE p.voided = 0
            ORDER BY p.projectName
        `, [village, village]);

        res.json(projects);

    } catch (error) {
        console.error('Error fetching projects by village:', error);
        res.status(500).json({ 
            error: 'Failed to fetch projects by village',
            details: error.message 
        });
    }
});

async function buildAbsorptionReport(query = {}, req = null) {
    const DB_TYPE = getDBType();
    const isPg = DB_TYPE === 'postgresql';
    const placeholder = isPg ? '$' : '?';
    let i = 1;
    const params = [];
    const where = [isPg ? 'COALESCE(p.voided, false) = false' : 'p.voided = 0'];

    const {
        finYearId,
        departmentId,
        department,
        status,
        startDate,
        endDate,
        minAbsorption,
        maxAbsorption,
        minBudget,
        maxBudget,
    } = query;

    const statusExpr = isPg ? `COALESCE(p.progress->>'status', '')` : `COALESCE(p.status, '')`;
    const budgetExpr = isPg ? `COALESCE((p.budget->>'allocated_amount_kes')::numeric, 0)` : `COALESCE(p.costOfProject, 0)`;
    const paidExpr = isPg ? `COALESCE((p.budget->>'disbursed_amount_kes')::numeric, 0)` : `COALESCE(p.paidOut, 0)`;
    const deptExpr = isPg ? `COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned')` : `COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned')`;
    const projectIdExpr = isPg ? 'p.project_id' : 'p.id';
    const subCountyExpr = isPg
        ? `COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), NULLIF(TRIM(p.location->>'constituency'), ''), 'Countywide/Unassigned')`
        : `COALESCE(NULLIF(TRIM(sc.name), ''), 'Countywide/Unassigned')`;
    const startExpr = isPg ? `(p.timeline->>'start_date')::date` : `p.startDate`;
    const endExpr = isPg ? `(p.timeline->>'expected_completion_date')::date` : `p.endDate`;
    const fyExpr = isPg ? `COALESCE(p.timeline->>'financial_year', '')` : `COALESCE(CAST(p.finYearId AS CHAR), '')`;
    const progressScoreCase = `CASE
        WHEN LOWER(${statusExpr}) = 'completed' THEN 100
        WHEN LOWER(${statusExpr}) = 'in progress' THEN 75
        WHEN LOWER(${statusExpr}) = 'delayed' THEN 50
        WHEN LOWER(${statusExpr}) = 'at risk' THEN 25
        WHEN LOWER(${statusExpr}) = 'initiated' THEN 20
        WHEN LOWER(${statusExpr}) = 'stalled' THEN 10
        ELSE 0
    END`;
    const averageProgressExpr = isPg
        ? `ROUND(AVG(${progressScoreCase})::numeric, 1)`
        : `ROUND(AVG(${progressScoreCase}), 1)`;
    const absorptionExpr = (digits) => isPg
        ? `ROUND((SUM(${paidExpr}) * 100.0 / SUM(${budgetExpr}))::numeric, ${digits})`
        : `ROUND((SUM(${paidExpr}) * 100.0 / SUM(${budgetExpr})), ${digits})`;

    if (finYearId) {
        where.push(`${fyExpr} = ${isPg ? `${placeholder}${i++}` : placeholder}`);
        params.push(String(finYearId));
    }
    if (departmentId && !isPg) {
        where.push(`p.departmentId = ?`);
        params.push(Number(departmentId));
    }
    if (department) {
        where.push(`${deptExpr} = ${isPg ? `${placeholder}${i++}` : placeholder}`);
        params.push(String(department));
    }
    if (status) {
        where.push(`${statusExpr} = ${isPg ? `${placeholder}${i++}` : placeholder}`);
        params.push(String(status));
    }
    if (startDate) {
        where.push(`${startExpr} >= ${isPg ? `${placeholder}${i++}` : placeholder}`);
        params.push(startDate);
    }
    if (endDate) {
        where.push(`${endExpr} <= ${isPg ? `${placeholder}${i++}` : placeholder}`);
        params.push(endDate);
    }
    if (minBudget !== undefined && minBudget !== '' && Number.isFinite(Number(minBudget))) {
        where.push(`${budgetExpr} >= ${isPg ? `${placeholder}${i++}` : placeholder}`);
        params.push(Number(minBudget));
    }
    if (maxBudget !== undefined && maxBudget !== '' && Number.isFinite(Number(maxBudget))) {
        where.push(`${budgetExpr} <= ${isPg ? `${placeholder}${i++}` : placeholder}`);
        params.push(Number(maxBudget));
    }
    i = await addProjectScopeWhere(req || {}, where, params, 'p', i);

    const projectJoinSql = isPg ? '' : 'LEFT JOIN departments d ON p.departmentId = d.departmentId AND d.voided = 0';
    const baseSql = `
        FROM projects p
        ${projectJoinSql}
        WHERE ${where.join(' AND ')}
    `;
    const groupedBaseSql = `
        FROM projects p
        ${projectJoinSql}
        ${isPg ? '' : 'LEFT JOIN project_subcounties psc ON p.id = psc.projectId AND COALESCE(psc.voided, 0) = 0'}
        ${isPg ? '' : 'LEFT JOIN subcounties sc ON psc.subcountyId = sc.subcountyId AND COALESCE(sc.voided, 0) = 0'}
        WHERE ${where.join(' AND ')}
    `;
    const groupedSql = `
        SELECT
            ${deptExpr} AS "department",
            ${subCountyExpr} AS "subCounty",
            COALESCE(NULLIF(${statusExpr}, ''), 'Unspecified') AS "status",
            COUNT(DISTINCT ${projectIdExpr})${isPg ? '::int' : ''} AS "projectCount",
            CASE WHEN COUNT(DISTINCT ${projectIdExpr}) > 0
                 THEN ${averageProgressExpr}
                 ELSE 0 END AS "completionPercentage",
            SUM(${budgetExpr}) AS "budget",
            SUM(${budgetExpr}) AS "contractSum",
            SUM(${paidExpr}) AS "paidAmount",
            CASE WHEN SUM(${budgetExpr}) > 0
                 THEN ${absorptionExpr(2)}
                 ELSE 0 END AS "absorptionPercentage"
        ${groupedBaseSql}
        GROUP BY ${deptExpr}, ${subCountyExpr}, COALESCE(NULLIF(${statusExpr}, ''), 'Unspecified')
    `;

    const outerWhere = [];
    const outerParams = [...params];
    let j = i;
    if (minAbsorption !== undefined && minAbsorption !== '' && Number.isFinite(Number(minAbsorption))) {
        outerWhere.push(`"absorptionPercentage" >= ${isPg ? `$${j++}` : '?'}`);
        outerParams.push(Number(minAbsorption));
    }
    if (maxAbsorption !== undefined && maxAbsorption !== '' && Number.isFinite(Number(maxAbsorption))) {
        outerWhere.push(`"absorptionPercentage" <= ${isPg ? `$${j++}` : '?'}`);
        outerParams.push(Number(maxAbsorption));
    }

    const groupedFinalSql = `
      SELECT * FROM (${groupedSql}) a
      ${outerWhere.length ? `WHERE ${outerWhere.join(' AND ')}` : ''}
      ORDER BY "department", "subCounty", "status"
    `;
    const groupedResult = await pool.query(groupedFinalSql, outerParams);
    const groupedRows = isPg ? (groupedResult.rows || []) : (Array.isArray(groupedResult) ? (groupedResult[0] || []) : []);

    const summarySql = `
        SELECT
            COUNT(*)${isPg ? '::int' : ''} AS "count",
            CASE WHEN COUNT(*) > 0
                 THEN ${averageProgressExpr}
                 ELSE 0 END AS "averageCompletion",
            SUM(${budgetExpr}) AS "totalBudget",
            SUM(${budgetExpr}) AS "totalContractSum",
            SUM(${paidExpr}) AS "totalPaidAmount",
            CASE WHEN SUM(${budgetExpr}) > 0
                 THEN ${absorptionExpr(1)}
                 ELSE 0 END AS "absorbedPercentage"
        ${baseSql}
    `;
    const summaryResult = await pool.query(summarySql, params);
    const summaryRow = isPg ? (summaryResult.rows?.[0] || {}) : (Array.isArray(summaryResult) ? (summaryResult[0]?.[0] || {}) : {});

    return {
        data: groupedRows.map((row, idx) => ({
            id: idx + 1,
            department: row.department || 'Unassigned',
            subCounty: row.subCounty || 'Countywide/Unassigned',
            projectCount: Number(row.projectCount || 0),
            status: row.status || 'Unspecified',
            completionPercentage: Number(row.completionPercentage || 0),
            budget: Number(row.budget || 0),
            contractSum: Number(row.contractSum || 0),
            paidAmount: Number(row.paidAmount || 0),
            absorptionPercentage: Number(row.absorptionPercentage || 0),
        })),
        summary: {
            count: Number(summaryRow.count || 0),
            averageCompletion: Number(summaryRow.averageCompletion || 0),
            totalBudget: Number(summaryRow.totalBudget || 0),
            totalContractSum: Number(summaryRow.totalContractSum || 0),
            totalPaidAmount: Number(summaryRow.totalPaidAmount || 0),
            absorbedPercentage: Number(summaryRow.absorbedPercentage || 0),
        },
    };
}

router.get('/absorption-report', async (req, res) => {
    try {
        const payload = await buildAbsorptionReport(req.query || {}, req);
        return res.status(200).json(payload);
    } catch (error) {
        console.error('Error fetching absorption report:', error);
        return res.status(500).json({
            message: 'Error fetching absorption report',
            error: error.message,
        });
    }
});

router.get('/absorption-report/export', async (req, res) => {
    try {
        const payload = await buildAbsorptionReport(req.query || {}, req);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Machakos CIMES';
        workbook.created = new Date();
        const ws = workbook.addWorksheet('Absorption Report');
        ws.addRow(['Absorption Report']);
        ws.addRow([`Generated: ${new Date().toLocaleString('en-KE')}`]);
        ws.addRow([]);
        ws.addRow(['Department', 'Sub-county', 'Status', 'Projects', '% Complete', 'Budget', 'Contract Sum', 'Paid Amount', 'Absorption %']);
        const headerRow = ws.getRow(4);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };

        payload.data.forEach((row) => {
            ws.addRow([
            row.department,
            row.subCounty || 'Countywide/Unassigned',
            row.status || 'Unspecified',
            Number(row.projectCount || 0),
            Number(row.completionPercentage || 0),
            Number(row.budget || 0),
            Number(row.contractSum || 0),
            Number(row.paidAmount || 0),
            Number(row.absorptionPercentage || 0),
            ]);
        });
        ws.addRow([
            'TOTAL',
            '',
            '',
            Number(payload.summary.count || 0),
            Number(payload.summary.averageCompletion || 0),
            Number(payload.summary.totalBudget || 0),
            Number(payload.summary.totalContractSum || 0),
            Number(payload.summary.totalPaidAmount || 0),
            Number(payload.summary.absorbedPercentage || 0),
        ]);
        ws.columns.forEach((c) => {
            if (!c.width || c.width < 16) c.width = 18;
        });
        [6, 7, 8].forEach((col) => {
            ws.getColumn(col).numFmt = '"KES" #,##0.00';
        });
        [5, 9].forEach((col) => {
            ws.getColumn(col).numFmt = '0.0';
        });
        const suffix = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="absorption-report-${suffix}.xlsx"`);
        await workbook.xlsx.write(res);
        return res.end();
    } catch (error) {
        console.error('Error exporting absorption report:', error);
        return res.status(500).json({ message: 'Error exporting absorption report', error: error.message });
    }
});

/**
 * @route GET /api/reports/performance-management-report
 * @description Get performance management report data grouped by department with performance metrics
 * @access Public (for now)
 * @returns {Object} Object containing performance management report data and summary totals
 */
router.get('/performance-management-report', async (req, res) => {
    try {
        const { 
            finYearId, 
            departmentId, 
            status, 
            startDate, 
            endDate 
        } = req.query;

        let whereConditions = ['p.voided = 0', 'd.name IS NOT NULL'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }

        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        if (startDate) {
            whereConditions.push('p.startDate >= ?');
            queryParams.push(startDate);
        }

        if (endDate) {
            whereConditions.push('p.endDate <= ?');
            queryParams.push(endDate);
        }

        // Main query to get department-level performance data
        const sqlQuery = `
            SELECT
                d.name AS departmentName,
                d.alias AS departmentAlias,
                COUNT(p.id) AS projectCount,
                
                -- Calculate completion percentage based on status
                CASE 
                    WHEN COUNT(p.id) > 0 THEN 
                        ROUND(
                            (COUNT(CASE WHEN p.status = 'Completed' THEN 1 END) * 100.0 / COUNT(p.id)), 
                            1
                        )
                    ELSE 0 
                END AS completionPercentage,
                
                -- Calculate absorption percentage
                CASE 
                    WHEN SUM(p.costOfProject) > 0 THEN 
                        ROUND((SUM(p.paidOut) * 100.0 / SUM(p.costOfProject)), 2)
                    ELSE 0 
                END AS absorptionPercentage,
                
                -- FY Target (ADP) - using costOfProject as target
                COALESCE(SUM(p.costOfProject), 0) AS fyTargetAdp,
                
                -- FY Actual - using paidOut as actual
                COALESCE(SUM(p.paidOut), 0) AS fyActual
                
            FROM
                projects p
            LEFT JOIN
                departments d ON p.departmentId = d.departmentId AND d.voided = 0
            WHERE ${whereConditions.join(' AND ')}
            GROUP BY
                d.departmentId, d.name, d.alias
            ORDER BY
                d.name;
        `;

        const [rows] = await pool.query(sqlQuery, queryParams);

        // Calculate summary totals
        const summaryQuery = `
            SELECT
                COUNT(DISTINCT p.id) AS totalCount,
                ROUND(
                    AVG(
                        CASE 
                            WHEN p.status = 'Completed' THEN 100
                            WHEN p.status = 'In Progress' THEN 75
                            WHEN p.status = 'At Risk' THEN 25
                            WHEN p.status = 'Delayed' THEN 50
                            WHEN p.status = 'Stalled' THEN 10
                            ELSE 0
                        END
                    ), 1
                ) AS averageCompletion,
                CASE 
                    WHEN SUM(p.costOfProject) > 0 THEN 
                        ROUND((SUM(p.paidOut) * 100.0 / SUM(p.costOfProject)), 1)
                    ELSE 0 
                END AS absorptionPercentage,
                COALESCE(SUM(p.costOfProject), 0) AS fyTargetAdp,
                COALESCE(SUM(p.paidOut), 0) AS fyActual
            FROM
                projects p
            LEFT JOIN
                departments d ON p.departmentId = d.departmentId AND d.voided = 0
            WHERE ${whereConditions.join(' AND ')}
        `;

        const [summaryRows] = await pool.query(summaryQuery, queryParams);
        const summary = summaryRows[0] || {};

        // Transform the data to match the frontend component expectations
        const transformedData = rows.map(row => ({
            id: Math.random(), // Generate a temporary ID for React key
            department: row.departmentName,
            projectCount: row.projectCount,
            ward: '', // Not available in current schema
            status: '', // Not available in current schema
            completionPercentage: parseFloat(row.completionPercentage) || 0,
            absorptionPercentage: parseFloat(row.absorptionPercentage) || 0,
            fyTargetAdp: parseFloat(row.fyTargetAdp) || 0,
            fyActual: parseFloat(row.fyActual) || 0
        }));

        res.status(200).json({
            data: transformedData,
            summary: {
                count: summary.totalCount || 0,
                averageCompletion: parseFloat(summary.averageCompletion) || 0,
                absorptionPercentage: parseFloat(summary.absorptionPercentage) || 0,
                fyTargetAdp: parseFloat(summary.fyTargetAdp) || 0,
                fyActual: parseFloat(summary.fyActual) || 0
            }
        });

    } catch (error) {
        console.error('Error fetching performance management report:', error);
        res.status(500).json({
            message: 'Error fetching performance management report',
            error: error.message
        });
    }
});

/**
 * @route GET /api/reports/capr-report
 * @description Get CAPR (County Annual Performance Report) data with hierarchical grouping
 * @access Public (for now)
 * @returns {Object} Object containing CAPR report data grouped by SubCounty and Status
 */
router.get('/capr-report', async (req, res) => {
    try {
        const { 
            subCounty, 
            status, 
            programme,
            startDate, 
            endDate 
        } = req.query;

        let whereConditions = ['1=1']; // Base condition
        const queryParams = [];

        if (subCounty) {
            whereConditions.push('p.subCounty = ?');
            queryParams.push(subCounty);
        }

        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        if (programme) {
            whereConditions.push('p.programme LIKE ?');
            queryParams.push(`%${programme}%`);
        }

        if (startDate) {
            whereConditions.push('p.startDate >= ?');
            queryParams.push(startDate);
        }

        if (endDate) {
            whereConditions.push('p.endDate <= ?');
            queryParams.push(endDate);
        }

        // Main query to get CAPR data
        // Note: This is a mock query structure since we don't have CAPR-specific tables
        // In a real implementation, you would have tables like capr_programmes, cidp_outcomes, etc.
        const sqlQuery = `
            SELECT
                CASE 
                    WHEN p.id % 3 = 0 THEN 'Central Region'
                    WHEN p.id % 3 = 1 THEN 'Eastern Region'
                    ELSE 'Western Region'
                END AS subCounty,
                CASE 
                    WHEN p.id % 2 = 0 THEN 'Completed'
                    ELSE 'In Progress'
                END AS status,
                'Preventive Programme' AS programme,
                '• Establish comprehensive preventive healthcare services\\n• Enhance community health awareness\\n• Scale up immunization coverage' AS objectives,
                CASE 
                    WHEN p.id % 2 = 0 THEN 'Improved ANC visits'
                    ELSE 'Improved FP services'
                END AS cidpOutcome,
                CASE 
                    WHEN p.id % 2 = 0 THEN '% ANC attendance'
                    ELSE 'Contraceptive Prevalence Rate (CPR)'
                END AS cidpKpi,
                CASE 
                    WHEN p.id % 2 = 0 THEN 'Baseline: 17%, Y1:18%, Y2:19%, Y3:20%, Y4:21%, Y5:25%'
                    ELSE 'Baseline: 65%, Y1:68%, Y2:79%, Y3:82%, Y4:85%, Y5:90%'
                END AS cidpTargets,
                CASE 
                    WHEN p.id % 2 = 0 THEN 'Y5: 25%'
                    ELSE 'Y5: 90%'
                END AS y5Target,
                CASE 
                    WHEN p.id % 2 = 0 THEN 'Km of roads (Length: KM)'
                    ELSE 'large (Size: Large)'
                END AS outputKpi,
                CASE 
                    WHEN p.id % 2 = 0 THEN 'FY2018/2019'
                    ELSE 'FY2017/2018'
                END AS adpFy,
                CASE 
                    WHEN p.id % 2 = 0 THEN '45'
                    ELSE '80'
                END AS fyBaseline
            FROM
                projects p
            WHERE ${whereConditions.join(' AND ')}
            LIMIT 20
        `;

        const [rows] = await pool.query(sqlQuery, queryParams);

        // Transform the data to match the frontend component expectations
        const transformedData = rows.map((row, index) => ({
            id: index + 1,
            subCounty: row.subCounty,
            status: row.status,
            programme: row.programme,
            objectives: row.objectives,
            cidpOutcome: row.cidpOutcome,
            cidpKpi: row.cidpKpi,
            cidpTargets: row.cidpTargets,
            y5Target: row.y5Target,
            outputKpi: row.outputKpi,
            adpFy: row.adpFy,
            fyBaseline: row.fyBaseline
        }));

        res.status(200).json({
            data: transformedData
        });

    } catch (error) {
        console.error('Error fetching CAPR report:', error);
        res.status(500).json({
            message: 'Error fetching CAPR report',
            error: error.message
        });
    }
});

/**
 * @route GET /api/reports/quarterly-implementation-report
 * @description Get quarterly implementation report data with project progress and financial metrics
 * @access Public (for now) - In production, this should use basic auth with akwatuha/reset123
 * @returns {Object} Object containing quarterly implementation report data and summary totals
 */
router.get('/quarterly-implementation-report', async (req, res) => {
    try {
        const { 
            quarter, 
            year, 
            departmentId, 
            status, 
            startDate, 
            endDate 
        } = req.query;

        let whereConditions = ['p.voided = 0', 'd.name IS NOT NULL'];
        const queryParams = [];

        if (quarter) {
            // Map quarter to date ranges
            const quarterRanges = {
                'Q1': ['01-01', '03-31'],
                'Q2': ['04-01', '06-30'],
                'Q3': ['07-01', '09-30'],
                'Q4': ['10-01', '12-31']
            };
            
            if (quarterRanges[quarter]) {
                const yearValue = year || new Date().getFullYear();
                whereConditions.push(`DATE_FORMAT(p.startDate, '%m-%d') >= ? AND DATE_FORMAT(p.startDate, '%m-%d') <= ?`);
                queryParams.push(quarterRanges[quarter][0], quarterRanges[quarter][1]);
                whereConditions.push(`YEAR(p.startDate) = ?`);
                queryParams.push(yearValue);
            }
        }

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }

        // Use shared status filter helper for consistent normalization
        addStatusFilter(status, whereConditions, queryParams, 'p');

        if (startDate) {
            whereConditions.push('p.startDate >= ?');
            queryParams.push(startDate);
        }

        if (endDate) {
            whereConditions.push('p.endDate <= ?');
            queryParams.push(endDate);
        }

        // Main query to get quarterly implementation data
        const sqlQuery = `
            SELECT
                p.id,
                p.projectName,
                d.name AS department,
                CASE 
                    WHEN MONTH(p.startDate) BETWEEN 1 AND 3 THEN 'Q1'
                    WHEN MONTH(p.startDate) BETWEEN 4 AND 6 THEN 'Q2'
                    WHEN MONTH(p.startDate) BETWEEN 7 AND 9 THEN 'Q3'
                    WHEN MONTH(p.startDate) BETWEEN 10 AND 12 THEN 'Q4'
                    ELSE 'Q1'
                END AS quarter,
                p.status,
                
                -- Calculate progress percentage based on status and dates
                CASE 
                    WHEN p.status = 'Completed' THEN 100
                    WHEN p.status = 'In Progress' THEN 
                        CASE 
                            WHEN p.endDate IS NOT NULL AND p.startDate IS NOT NULL THEN
                                LEAST(100, GREATEST(0, 
                                    ROUND(
                                        (DATEDIFF(CURDATE(), p.startDate) * 100.0 / 
                                         NULLIF(DATEDIFF(p.endDate, p.startDate), 0)), 
                                        1
                                    )
                                ))
                            ELSE 75
                        END
                    WHEN p.status = 'At Risk' THEN 25
                    WHEN p.status = 'Delayed' THEN 50
                    WHEN p.status = 'Stalled' THEN 10
                    ELSE 0
                END AS progressPercentage,
                
                -- Financial data
                COALESCE(p.costOfProject, 0) AS budget,
                COALESCE(p.paidOut, 0) AS spent,
                COALESCE(p.costOfProject, 0) - COALESCE(p.paidOut, 0) AS remaining,
                
                -- Dates
                DATE_FORMAT(p.startDate, '%Y-%m-%d') AS startDate,
                DATE_FORMAT(p.endDate, '%Y-%m-%d') AS endDate
                
            FROM
                projects p
            LEFT JOIN
                departments d ON p.departmentId = d.departmentId AND d.voided = 0
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY
                p.projectName
            LIMIT 50
        `;

        const [rows] = await pool.query(sqlQuery, queryParams);

        // Calculate summary totals
        const summaryQuery = `
            SELECT
                COUNT(DISTINCT p.id) AS totalProjects,
                COALESCE(SUM(p.costOfProject), 0) AS totalBudget,
                COALESCE(SUM(p.paidOut), 0) AS totalSpent,
                ROUND(
                    AVG(
                        CASE 
                            WHEN p.status = 'Completed' THEN 100
                            WHEN p.status = 'In Progress' THEN 
                                CASE 
                                    WHEN p.endDate IS NOT NULL AND p.startDate IS NOT NULL THEN
                                        LEAST(100, GREATEST(0, 
                                            ROUND(
                                                (DATEDIFF(CURDATE(), p.startDate) * 100.0 / 
                                                 NULLIF(DATEDIFF(p.endDate, p.startDate), 0)), 
                                                1
                                            )
                                        ))
                                    ELSE 75
                                END
                            WHEN p.status = 'At Risk' THEN 25
                            WHEN p.status = 'Delayed' THEN 50
                            WHEN p.status = 'Stalled' THEN 10
                            ELSE 0
                        END
                    ), 1
                ) AS averageProgress,
                COUNT(CASE WHEN p.status IN ('Completed', 'In Progress') THEN 1 END) AS onTrackProjects,
                COUNT(CASE WHEN p.status IN ('Delayed', 'At Risk', 'Stalled') THEN 1 END) AS delayedProjects
            FROM
                projects p
            LEFT JOIN
                departments d ON p.departmentId = d.departmentId AND d.voided = 0
            WHERE ${whereConditions.join(' AND ')}
        `;

        const [summaryRows] = await pool.query(summaryQuery, queryParams);
        const summary = summaryRows[0] || {};

        // Transform the data to match the frontend component expectations
        const transformedData = rows.map(row => ({
            id: row.id,
            projectName: row.projectName,
            department: row.department,
            quarter: row.quarter,
            status: row.status,
            progressPercentage: parseFloat(row.progressPercentage) || 0,
            budget: parseFloat(row.budget) || 0,
            spent: parseFloat(row.spent) || 0,
            remaining: parseFloat(row.remaining) || 0,
            startDate: row.startDate,
            endDate: row.endDate
        }));

        res.status(200).json({
            data: transformedData,
            summary: {
                totalProjects: summary.totalProjects || 0,
                totalBudget: parseFloat(summary.totalBudget) || 0,
                totalSpent: parseFloat(summary.totalSpent) || 0,
                averageProgress: parseFloat(summary.averageProgress) || 0,
                onTrackProjects: summary.onTrackProjects || 0,
                delayedProjects: summary.delayedProjects || 0
            }
        });

    } catch (error) {
        console.error('Error fetching quarterly implementation report:', error);
        res.status(500).json({
            message: 'Error fetching quarterly implementation report',
            error: error.message
        });
    }
});

/**
 * @route GET /api/reports/pending-bills
 * @description List projects with outstanding/pending bill amounts.
 * @query department, status, projectName, minPendingAmount, maxPendingAmount, includeZeroPending, limit
 */
router.get('/pending-bills', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const isPg = DB_TYPE === 'postgresql';
        const placeholder = isPg ? '$' : '?';
        let p = 1;
        const params = [];

        const department = String(req.query.department || '').trim();
        const status = String(req.query.status || '').trim();
        const projectName = String(req.query.projectName || '').trim();
        const minPendingAmount = req.query.minPendingAmount !== undefined && req.query.minPendingAmount !== ''
            ? Number(req.query.minPendingAmount)
            : null;
        const maxPendingAmount = req.query.maxPendingAmount !== undefined && req.query.maxPendingAmount !== ''
            ? Number(req.query.maxPendingAmount)
            : null;
        const includeZeroPending = String(req.query.includeZeroPending || '').toLowerCase() === 'true';
        const rowLimit = Math.min(Math.max(Number(req.query.limit || 500), 1), 5000);

        const where = [isPg ? 'COALESCE(p.voided, false) = false' : '(p.voided IS NULL OR p.voided = 0)'];
        if (department) {
            if (isPg) {
                where.push(`COALESCE(p.state_department, '') = ${placeholder}${p++}`);
            } else {
                where.push(`COALESCE(d.name, '') = ${placeholder}`);
            }
            params.push(department);
        }
        if (status) {
            if (isPg) {
                where.push(`COALESCE(p.progress->>'status', '') = ${placeholder}${p++}`);
            } else {
                where.push(`COALESCE(p.status, '') = ${placeholder}`);
            }
            params.push(status);
        }
        if (projectName) {
            if (isPg) {
                where.push(`LOWER(COALESCE(p.name, '')) LIKE LOWER(${placeholder}${p++})`);
            } else {
                where.push(`LOWER(COALESCE(p.projectName, '')) LIKE LOWER(${placeholder})`);
            }
            params.push(`%${projectName}%`);
        }

        const costExpr = isPg
            ? `COALESCE((p.budget->>'allocated_amount_kes')::numeric, 0)`
            : `COALESCE(p.costOfProject, 0)`;
        const paidExpr = isPg
            ? `COALESCE((p.budget->>'disbursed_amount_kes')::numeric, 0)`
            : `COALESCE(p.paidOut, 0)`;
        const pendingExpr = `GREATEST((${costExpr}) - (${paidExpr}), 0)`;

        if (!includeZeroPending) where.push(`${pendingExpr} > 0`);
        if (Number.isFinite(minPendingAmount)) {
            where.push(`${pendingExpr} >= ${isPg ? `${placeholder}${p++}` : placeholder}`);
            params.push(minPendingAmount);
        }
        if (Number.isFinite(maxPendingAmount)) {
            where.push(`${pendingExpr} <= ${isPg ? `${placeholder}${p++}` : placeholder}`);
            params.push(maxPendingAmount);
        }

        const sql = isPg
            ? `
                SELECT
                    p.project_id AS "projectId",
                    COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.project_id)) AS "projectName",
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "department",
                    COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown') AS "status",
                    ${costExpr} AS "contractSum",
                    ${paidExpr} AS "amountPaid",
                    ${pendingExpr} AS "pendingBill",
                    COALESCE((
                      SELECT COUNT(*)::int
                      FROM projectcertificate c
                      WHERE c."projectId" = p.project_id AND COALESCE(c.voided, false) = false
                    ), 0) AS "certificatesGenerated",
                    COALESCE((
                      SELECT MAX(c."requestDate")
                      FROM projectcertificate c
                      WHERE c."projectId" = p.project_id AND COALESCE(c.voided, false) = false
                    ), NULL) AS "lastCertificateDate"
                FROM projects p
                WHERE ${where.join(' AND ')}
                ORDER BY ${pendingExpr} DESC, p.project_id DESC
                LIMIT ${placeholder}${p}
            `
            : `
                SELECT
                    p.id AS projectId,
                    COALESCE(NULLIF(TRIM(p.projectName), ''), CONCAT('Project #', p.id)) AS projectName,
                    COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned') AS department,
                    COALESCE(NULLIF(TRIM(p.status), ''), 'Unknown') AS status,
                    ${costExpr} AS contractSum,
                    ${paidExpr} AS amountPaid,
                    ${pendingExpr} AS pendingBill,
                    COALESCE((
                      SELECT COUNT(*)
                      FROM projectcertificate c
                      WHERE c.projectId = p.id AND (c.voided IS NULL OR c.voided = 0)
                    ), 0) AS certificatesGenerated,
                    COALESCE((
                      SELECT MAX(c.requestDate)
                      FROM projectcertificate c
                      WHERE c.projectId = p.id AND (c.voided IS NULL OR c.voided = 0)
                    ), NULL) AS lastCertificateDate
                FROM projects p
                LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
                WHERE ${where.join(' AND ')}
                ORDER BY ${pendingExpr} DESC, p.id DESC
                LIMIT ?
            `;
        params.push(rowLimit);

        const result = await pool.query(sql, params);
        const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching pending bills report:', error);
        return res.status(500).json({ message: 'Error fetching pending bills report', error: error.message });
    }
});

/**
 * @route GET /api/reports/pending-bills/export
 * @description Export pending bills report to Excel using template_pending_bill.xlsx.
 */
router.get('/pending-bills/export', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const isPg = DB_TYPE === 'postgresql';
        const placeholder = isPg ? '$' : '?';
        let p = 1;
        const params = [];
        const department = String(req.query.department || '').trim();
        const status = String(req.query.status || '').trim();
        const projectName = String(req.query.projectName || '').trim();
        const minPendingAmount = req.query.minPendingAmount !== undefined && req.query.minPendingAmount !== ''
            ? Number(req.query.minPendingAmount)
            : null;
        const maxPendingAmount = req.query.maxPendingAmount !== undefined && req.query.maxPendingAmount !== ''
            ? Number(req.query.maxPendingAmount)
            : null;
        const includeZeroPending = String(req.query.includeZeroPending || '').toLowerCase() === 'true';
        const where = [isPg ? 'COALESCE(p.voided, false) = false' : '(p.voided IS NULL OR p.voided = 0)'];

        if (department) { where.push(isPg ? `COALESCE(p.state_department, '') = ${placeholder}${p++}` : `COALESCE(d.name, '') = ${placeholder}`); params.push(department); }
        if (status) { where.push(isPg ? `COALESCE(p.progress->>'status', '') = ${placeholder}${p++}` : `COALESCE(p.status, '') = ${placeholder}`); params.push(status); }
        if (projectName) { where.push(isPg ? `LOWER(COALESCE(p.name, '')) LIKE LOWER(${placeholder}${p++})` : `LOWER(COALESCE(p.projectName, '')) LIKE LOWER(${placeholder})`); params.push(`%${projectName}%`); }
        const costExpr = isPg ? `COALESCE((p.budget->>'allocated_amount_kes')::numeric, 0)` : `COALESCE(p.costOfProject, 0)`;
        const paidExpr = isPg ? `COALESCE((p.budget->>'disbursed_amount_kes')::numeric, 0)` : `COALESCE(p.paidOut, 0)`;
        const pendingExpr = `GREATEST((${costExpr}) - (${paidExpr}), 0)`;
        if (!includeZeroPending) where.push(`${pendingExpr} > 0`);
        if (Number.isFinite(minPendingAmount)) { where.push(`${pendingExpr} >= ${isPg ? `${placeholder}${p++}` : placeholder}`); params.push(minPendingAmount); }
        if (Number.isFinite(maxPendingAmount)) { where.push(`${pendingExpr} <= ${isPg ? `${placeholder}${p++}` : placeholder}`); params.push(maxPendingAmount); }

        const sql = isPg
            ? `
                SELECT
                    p.project_id AS "projectId",
                    COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.project_id)) AS "projectName",
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "department",
                    COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown') AS "status",
                    ${costExpr} AS "contractSum",
                    ${paidExpr} AS "amountPaid",
                    ${pendingExpr} AS "pendingBill",
                    COALESCE((
                      SELECT COUNT(*)::int
                      FROM projectcertificate c
                      WHERE c."projectId" = p.project_id AND COALESCE(c.voided, false) = false
                    ), 0) AS "certificatesGenerated",
                    COALESCE((
                      SELECT MAX(c."requestDate")
                      FROM projectcertificate c
                      WHERE c."projectId" = p.project_id AND COALESCE(c.voided, false) = false
                    ), NULL) AS "lastCertificateDate"
                FROM projects p
                WHERE ${where.join(' AND ')}
                ORDER BY ${pendingExpr} DESC, p.project_id DESC
            `
            : `
                SELECT
                    p.id AS projectId,
                    COALESCE(NULLIF(TRIM(p.projectName), ''), CONCAT('Project #', p.id)) AS projectName,
                    COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned') AS department,
                    COALESCE(NULLIF(TRIM(p.status), ''), 'Unknown') AS status,
                    ${costExpr} AS contractSum,
                    ${paidExpr} AS amountPaid,
                    ${pendingExpr} AS pendingBill,
                    COALESCE((
                      SELECT COUNT(*)
                      FROM projectcertificate c
                      WHERE c.projectId = p.id AND (c.voided IS NULL OR c.voided = 0)
                    ), 0) AS certificatesGenerated,
                    COALESCE((
                      SELECT MAX(c.requestDate)
                      FROM projectcertificate c
                      WHERE c.projectId = p.id AND (c.voided IS NULL OR c.voided = 0)
                    ), NULL) AS lastCertificateDate
                FROM projects p
                LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
                WHERE ${where.join(' AND ')}
                ORDER BY ${pendingExpr} DESC, p.id DESC
            `;

        const queryResult = await pool.query(sql, params);
        const rows = isPg ? (queryResult.rows || []) : (Array.isArray(queryResult) ? (queryResult[0] || []) : []);

        const workbook = new ExcelJS.Workbook();
        const templatePath = path.resolve(__dirname, '..', 'templates', 'template_pending_bill.xlsx');
        await workbook.xlsx.readFile(templatePath);
        const ws = workbook.worksheets[0] || workbook.addWorksheet('Pending Bills');
        if (ws.actualRowCount === 0) {
            ws.addRow([
                'Project ID', 'Project Name', 'Department', 'Status', 'Contract Sum', 'Amount Paid', 'Pending Bill',
                'Certificates Generated', 'Last Certificate Date',
            ]);
        }
        const sampleRowIndex = ws.actualRowCount >= 2 ? 2 : ws.actualRowCount + 1;
        if (ws.actualRowCount < sampleRowIndex) ws.addRow([]);
        const dataRows = rows.map((r) => ([
            r.projectId,
            r.projectName || '',
            r.department || '',
            r.status || '',
            Number(r.contractSum || 0),
            Number(r.amountPaid || 0),
            Number(r.pendingBill || 0),
            Number(r.certificatesGenerated || 0),
            r.lastCertificateDate ? new Date(r.lastCertificateDate) : '',
        ]));
        fillTemplateFromSampleRow(ws, sampleRowIndex, dataRows);
        ws.columns.forEach((col) => {
            if (!col.width || col.width < 16) col.width = 18;
        });

        const suffix = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="pending-bills-report-${suffix}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting pending bills report:', error);
        res.status(500).json({ message: 'Error exporting pending bills report', error: error.message });
    }
});

async function buildBudgetJustificationRows(query = {}) {
    const DB_TYPE = getDBType();
    const isPg = DB_TYPE === 'postgresql';
    const placeholder = isPg ? '$' : '?';
    let p = 1;
    const params = [];

    const department = String(query.department || '').trim();
    const status = String(query.status || '').trim();
    const projectName = String(query.projectName || '').trim();
    const startDate = String(query.startDate || '').trim();
    const endDate = String(query.endDate || '').trim();
    const minPendingAmount = query.minPendingAmount !== undefined && query.minPendingAmount !== '' ? Number(query.minPendingAmount) : null;
    const maxPendingAmount = query.maxPendingAmount !== undefined && query.maxPendingAmount !== '' ? Number(query.maxPendingAmount) : null;
    const minBudget = query.minBudget !== undefined && query.minBudget !== '' ? Number(query.minBudget) : null;
    const maxBudget = query.maxBudget !== undefined && query.maxBudget !== '' ? Number(query.maxBudget) : null;
    const maxRows = Math.min(Math.max(Number(query.limit || 1000), 1), 5000);

    const where = [isPg ? 'COALESCE(p.voided, false) = false' : '(p.voided IS NULL OR p.voided = 0)'];
    const statusExpr = isPg ? `COALESCE(p.progress->>'status', '')` : `COALESCE(p.status, '')`;
    const budgetExpr = isPg ? `COALESCE((p.budget->>'allocated_amount_kes')::numeric, 0)` : `COALESCE(p.costOfProject, 0)`;
    const paidExpr = isPg ? `COALESCE((p.budget->>'disbursed_amount_kes')::numeric, 0)` : `COALESCE(p.paidOut, 0)`;
    const pendingExpr = `GREATEST((${budgetExpr}) - (${paidExpr}), 0)`;
    const startExpr = isPg ? `(p.timeline->>'start_date')::date` : `p.startDate`;
    const endExpr = isPg ? `(p.timeline->>'expected_completion_date')::date` : `p.endDate`;

    if (department) {
        where.push(isPg ? `COALESCE(p.state_department, '') = ${placeholder}${p++}` : `COALESCE(d.name, '') = ${placeholder}`);
        params.push(department);
    }
    if (status) {
        where.push(`${statusExpr} = ${isPg ? `${placeholder}${p++}` : placeholder}`);
        params.push(status);
    }
    if (projectName) {
        where.push(isPg ? `LOWER(COALESCE(p.name, '')) LIKE LOWER(${placeholder}${p++})` : `LOWER(COALESCE(p.projectName, '')) LIKE LOWER(${placeholder})`);
        params.push(`%${projectName}%`);
    }
    if (startDate) {
        where.push(`${startExpr} >= ${isPg ? `${placeholder}${p++}` : placeholder}`);
        params.push(startDate);
    }
    if (endDate) {
        where.push(`${endExpr} <= ${isPg ? `${placeholder}${p++}` : placeholder}`);
        params.push(endDate);
    }
    if (Number.isFinite(minBudget)) {
        where.push(`${budgetExpr} >= ${isPg ? `${placeholder}${p++}` : placeholder}`);
        params.push(minBudget);
    }
    if (Number.isFinite(maxBudget)) {
        where.push(`${budgetExpr} <= ${isPg ? `${placeholder}${p++}` : placeholder}`);
        params.push(maxBudget);
    }
    if (Number.isFinite(minPendingAmount)) {
        where.push(`${pendingExpr} >= ${isPg ? `${placeholder}${p++}` : placeholder}`);
        params.push(minPendingAmount);
    }
    if (Number.isFinite(maxPendingAmount)) {
        where.push(`${pendingExpr} <= ${isPg ? `${placeholder}${p++}` : placeholder}`);
        params.push(maxPendingAmount);
    }

    const sql = isPg
        ? `
            SELECT
                p.project_id AS "projectId",
                COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.project_id)) AS "projectName",
                COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "department",
                COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown') AS "status",
                ${budgetExpr} AS "budgetAmount",
                ${paidExpr} AS "paidAmount",
                ${pendingExpr} AS "pendingAmount",
                NULLIF(TRIM(p.timeline->>'financial_year'), '') AS "financialYear",
                NULLIF(TRIM(p.timeline->>'start_date'), '') AS "startDate",
                NULLIF(TRIM(p.timeline->>'expected_completion_date'), '') AS "endDate",
                CASE
                    WHEN ${pendingExpr} > (${budgetExpr} * 0.5) THEN 'High pending balance relative to budget'
                    WHEN ${pendingExpr} > 0 AND ${paidExpr} = 0 THEN 'No payment yet; justification required'
                    WHEN LOWER(COALESCE(p.progress->>'status', '')) IN ('at risk', 'delayed', 'stalled') THEN 'Implementation status requires budget variance explanation'
                    ELSE 'Pending bill justification required'
                END AS "justificationHint"
            FROM projects p
            WHERE ${where.join(' AND ')}
            ORDER BY ${pendingExpr} DESC, p.project_id DESC
            LIMIT ${placeholder}${p}
        `
        : `
            SELECT
                p.id AS projectId,
                COALESCE(NULLIF(TRIM(p.projectName), ''), CONCAT('Project #', p.id)) AS projectName,
                COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned') AS department,
                COALESCE(NULLIF(TRIM(p.status), ''), 'Unknown') AS status,
                ${budgetExpr} AS budgetAmount,
                ${paidExpr} AS paidAmount,
                ${pendingExpr} AS pendingAmount,
                COALESCE(NULLIF(TRIM(p.financialYear), ''), '') AS financialYear,
                p.startDate AS startDate,
                p.endDate AS endDate,
                CASE
                    WHEN ${pendingExpr} > (${budgetExpr} * 0.5) THEN 'High pending balance relative to budget'
                    WHEN ${pendingExpr} > 0 AND ${paidExpr} = 0 THEN 'No payment yet; justification required'
                    WHEN LOWER(COALESCE(p.status, '')) IN ('at risk', 'delayed', 'stalled') THEN 'Implementation status requires budget variance explanation'
                    ELSE 'Pending bill justification required'
                END AS justificationHint
            FROM projects p
            LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
            WHERE ${where.join(' AND ')}
            ORDER BY ${pendingExpr} DESC, p.id DESC
            LIMIT ?
        `;
    params.push(maxRows);

    const result = await pool.query(sql, params);
    const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
    const summary = rows.reduce((acc, r) => {
        acc.count += 1;
        acc.totalBudget += Number(r.budgetAmount || 0);
        acc.totalPaid += Number(r.paidAmount || 0);
        acc.totalPending += Number(r.pendingAmount || 0);
        return acc;
    }, { count: 0, totalBudget: 0, totalPaid: 0, totalPending: 0 });
    return { rows, summary };
}

router.get('/budget-justification', async (req, res) => {
    try {
        const payload = await buildBudgetJustificationRows(req.query || {});
        return res.status(200).json(payload);
    } catch (error) {
        console.error('Error fetching budget justification report:', error);
        return res.status(500).json({ message: 'Error fetching budget justification report', error: error.message });
    }
});

function bjMoney(value) {
    return `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bjDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function bjTimeFrame(row) {
    const start = bjDate(row.startDate || row.startdate);
    const end = bjDate(row.endDate || row.enddate);
    if (start && end) return `${start} to ${end}`;
    return start || end || 'Current financial year';
}

function bjDrawCell(doc, text, x, y, width, height, options = {}) {
    doc.rect(x, y, width, height).strokeColor('#D0D7DE').lineWidth(0.5).stroke();
    const padding = options.padding ?? 3;
    doc
        .fillColor(options.color || '#1F2937')
        .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(options.fontSize || 7)
        .text(String(text ?? ''), x + padding, y + padding, {
            width: Math.max(1, width - (padding * 2)),
            height: Math.max(1, height - (padding * 2)),
            align: options.align || 'left',
            ellipsis: true,
        });
}

function bjWrappedHeight(doc, text, width, options = {}) {
    const padding = options.padding ?? 3;
    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.fontSize || 7);
    return doc.heightOfString(String(text ?? ''), {
        width: Math.max(1, width - (padding * 2)),
        align: options.align || 'left',
    }) + (padding * 2);
}

function bjCountyLogoCandidates() {
    const explicit = process.env.COUNTY_LOGO_PATH || process.env.CERT_LOGO_PATH || process.env.VITE_CERT_LOGO_PATH;
    const roots = [
        path.resolve(__dirname, '..', '..'),
        path.resolve(process.cwd()),
        path.resolve(__dirname, '..'),
    ];
    const candidates = [
        explicit,
        ...roots.flatMap((root) => [
            path.join(root, 'api', 'assets', 'gpris.png'),
            path.join(root, 'api', 'assets', 'logo.png'),
            path.join(root, 'assets', 'gpris.png'),
            path.join(root, 'assets', 'logo.png'),
            path.join(root, 'frontend', 'src', 'assets', 'gpris.png'),
            path.join(root, 'frontend', 'src', 'assets', 'logo.png'),
            path.join(root, 'src', 'assets', 'gpris.png'),
            path.join(root, 'public', 'gpris.png'),
        ]),
    ].filter(Boolean);

    for (const root of roots) {
        const distAssets = path.join(root, 'frontend', 'dist', 'assets');
        if (!fs.existsSync(distAssets)) continue;
        try {
            const files = fs.readdirSync(distAssets)
                .filter((file) => /^gpris.*\.png$/i.test(file) || /^logo.*\.png$/i.test(file));
            for (const file of files) candidates.push(path.join(distAssets, file));
        } catch {
            // Ignore unreadable deployment asset folders; the static candidates above still apply.
        }
    }

    return [...new Set(candidates)];
}

function bjResolveCountyLogoPath() {
    return bjCountyLogoCandidates().find((candidate) => {
        try {
            return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
        } catch {
            return false;
        }
    }) || '';
}

function bjDrawOfficialHeader(doc, { title, subtitle, logoPath }) {
    const pageWidth = doc.page.width;
    const margin = doc.page.margins.left;
    let y = 24;
    const resolvedLogoPath = logoPath || bjResolveCountyLogoPath();
    if (resolvedLogoPath) {
        try {
            const logoBuffer = fs.readFileSync(resolvedLogoPath);
            doc.image(logoBuffer, (pageWidth - 58) / 2, y, { width: 58 });
            y += 62;
        } catch {
            y += 4;
        }
    }
    const countyName = process.env.VITE_CERT_COUNTY_NAME || process.env.CERT_COUNTY_NAME || 'COUNTY GOVERNMENT OF MACHAKOS';
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('REPUBLIC OF KENYA', margin, y, { align: 'center', width: pageWidth - (margin * 2) });
    y += 14;
    doc.fontSize(11).text(String(countyName).toUpperCase(), margin, y, { align: 'center', width: pageWidth - (margin * 2) });
    y += 14;
    doc.fontSize(10).text(title.toUpperCase(), margin, y, { align: 'center', width: pageWidth - (margin * 2) });
    y += 14;
    if (subtitle) {
        doc.font('Helvetica').fontSize(8).fillColor('#4B5563').text(subtitle, margin, y, { align: 'center', width: pageWidth - (margin * 2) });
        y += 12;
    }
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#CBD5E1').lineWidth(0.7).stroke();
    return y + 10;
}

function bjDrawTableHeader(doc, columns, y) {
    const headerHeight = 28;
    doc.rect(doc.page.margins.left, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, headerHeight)
        .fillColor('#E8F1FB')
        .fill();
    columns.forEach((col) => {
        bjDrawCell(doc, col.label, col.x, y, col.width, headerHeight, {
            bold: true,
            fontSize: 6.4,
            align: col.align || 'left',
            color: '#0F172A',
        });
    });
    return y + headerHeight;
}

router.get('/budget-justification/download', async (req, res) => {
    try {
        const { rows, summary } = await buildBudgetJustificationRows(req.query || {});
        const dept = String(req.query.department || 'all').replace(/[^a-zA-Z0-9_-]/g, '-');
        const st = String(req.query.status || 'all').replace(/[^a-zA-Z0-9_-]/g, '-');
        const suffix = new Date().toISOString().slice(0, 10);
        const fileName = `budget-justification-${dept}-${st}-${suffix}.pdf`;
        const countyLogoPath = bjResolveCountyLogoPath();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('X-Report-Filters', JSON.stringify(req.query || {}));
        res.setHeader('X-County-Logo', countyLogoPath ? 'loaded' : 'missing');

        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24, bufferPages: true });
        doc.pipe(res);

        const department = String(req.query.department || '').trim();
        const financialYear = rows.find((r) => r.financialYear || r.financialyear)?.financialYear ||
            rows.find((r) => r.financialYear || r.financialyear)?.financialyear ||
            'Current Financial Year';
        let y = bjDrawOfficialHeader(doc, {
            title: `Budget Estimates Justification Within Ceilings for ${financialYear}`,
            subtitle: department ? `Unit / Section: ${department}` : 'All Departments',
            logoPath: countyLogoPath,
        });

        doc.font('Helvetica').fontSize(7).fillColor('#374151');
        const meta = [
            `Generated: ${new Date().toLocaleString('en-KE')}`,
            `Projects: ${summary.count}`,
            `Total Budget: ${bjMoney(summary.totalBudget)}`,
            `Total Paid: ${bjMoney(summary.totalPaid)}`,
            `Pending / Variance: ${bjMoney(summary.totalPending)}`,
        ].join('   |   ');
        doc.text(meta, doc.page.margins.left, y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
        y += 18;

        const left = doc.page.margins.left;
        const columns = [
            { label: 'S/No.', x: left, width: 28, align: 'center' },
            { label: 'Programme / Project', x: left + 28, width: 108 },
            { label: 'Goal / Objective', x: left + 136, width: 92 },
            { label: 'Performance Target', x: left + 228, width: 76 },
            { label: 'Performance Indicator', x: left + 304, width: 74 },
            { label: 'Action / Resources Required', x: left + 378, width: 98 },
            { label: 'Officer In-Charge', x: left + 476, width: 72 },
            { label: 'Time Frame', x: left + 548, width: 70 },
            { label: 'Expected Output / Deliverables', x: left + 618, width: 88 },
            { label: 'Budgetary Allocation', x: left + 706, width: 87, align: 'right' },
        ];
        y = bjDrawTableHeader(doc, columns, y);

        rows.forEach((row, idx) => {
            const budget = Number(row.budgetAmount || row.budgetamount || 0);
            const paid = Number(row.paidAmount || row.paidamount || 0);
            const pending = Number(row.pendingAmount || row.pendingamount || 0);
            const utilization = budget > 0 ? `${((paid / budget) * 100).toFixed(1)}% paid; ${((pending / budget) * 100).toFixed(1)}% variance` : 'Budget not captured';
            const cells = [
                String(idx + 1),
                row.projectName || row.projectname || `Project #${row.projectId || row.projectid || idx + 1}`,
                row.justificationHint || row.justificationhint || 'Budget justification required',
                row.status || 'Implementation target as planned',
                utilization,
                `Resources required: ${bjMoney(budget)}. Amount paid: ${bjMoney(paid)}. Pending/variance: ${bjMoney(pending)}.`,
                row.department || 'Accounting Officer',
                bjTimeFrame(row),
                pending > 0 ? 'Approved funding and timely settlement of pending obligations' : 'Continued project implementation and service delivery',
                bjMoney(budget),
            ];
            const rowHeight = Math.max(
                28,
                ...cells.map((cell, i) => bjWrappedHeight(doc, cell, columns[i].width, { fontSize: 6.2, align: columns[i].align || 'left' }))
            );
            if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 24) {
                doc.addPage();
                y = bjDrawOfficialHeader(doc, {
                    title: `Budget Estimates Justification Within Ceilings for ${financialYear}`,
                    subtitle: department ? `Unit / Section: ${department}` : 'All Departments',
                    logoPath: countyLogoPath,
                });
                y = bjDrawTableHeader(doc, columns, y);
            }
            columns.forEach((col, i) => {
                bjDrawCell(doc, cells[i], col.x, y, col.width, rowHeight, {
                    fontSize: 6.2,
                    align: col.align || 'left',
                });
            });
            y += rowHeight;
        });

        if (!rows.length) {
            doc.font('Helvetica').fontSize(10).fillColor('#6B7280').text('No projects match the selected filters.', left, y + 20);
        }

        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i += 1) {
            doc.switchToPage(i);
            doc.font('Helvetica').fontSize(7).fillColor('#6B7280')
                .text(`Page ${i + 1} of ${pages.count}`, doc.page.width - 90, doc.page.height - 18, { width: 66, align: 'right' });
        }
        doc.end();
    } catch (error) {
        console.error('Error downloading budget justification report:', error);
        return res.status(500).json({ message: 'Error downloading budget justification report', error: error.message });
    }
});

async function tableExistsInDb(tableName) {
    const DB_TYPE = getDBType();
    if (DB_TYPE === 'postgresql') {
        const r = await pool.query(
            `SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
            [tableName]
        );
        return (r.rows || []).length > 0;
    }
    const r = await pool.query(`SHOW TABLES LIKE ?`, [tableName]);
    const rows = Array.isArray(r) ? (r[0] || []) : (r.rows || []);
    return rows.length > 0;
}

async function columnExistsInDb(tableName, columnName) {
    const DB_TYPE = getDBType();
    const tn = String(tableName);
    const cn = String(columnName);
    try {
        if (DB_TYPE === 'postgresql') {
            const r = await pool.query(
                `SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND lower(table_name) = lower($1)
                   AND lower(column_name) = lower($2)
                 LIMIT 1`,
                [tn, cn]
            );
            return (r.rows || []).length > 0;
        }
        const r = await pool.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND lower(table_name) = lower(?)
               AND lower(column_name) = lower(?)
             LIMIT 1`,
            [tn, cn]
        );
        const rows = Array.isArray(r) ? (r[0] || []) : (r.rows || []);
        return rows.length > 0;
    } catch {
        return false;
    }
}

function firstPresent(row, keys) {
    for (const key of keys) {
        if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
        const lowerKey = String(key).toLowerCase();
        if (row && row[lowerKey] !== undefined && row[lowerKey] !== null && row[lowerKey] !== '') return row[lowerKey];
    }
    return null;
}

function toReportNumber(value) {
    const n = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function toIsoDateOnly(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function rowMatchesDateRange(rowDate, startDate, endDate) {
    if (!startDate && !endDate) return true;
    if (!rowDate) return false;
    if (startDate && rowDate < startDate) return false;
    if (endDate && rowDate > endDate) return false;
    return true;
}

async function getPaymentListProjectRows(isPg) {
    const hasProjectRef = await columnExistsInDb('projects', 'ProjectRefNum').catch(() => false);
    const hasTenderContractNo = await columnExistsInDb('projects', 'TenderContractNo').catch(() => false);
    const hasTenderContractNoCamel = await columnExistsInDb('projects', 'tenderContractNo').catch(() => false);
    const hasUpdatedAt = await columnExistsInDb('projects', 'updatedAt').catch(() => false);
    const hasUpdatedAtSnake = await columnExistsInDb('projects', 'updated_at').catch(() => false);
    const hasContracted = await columnExistsInDb('projects', 'Contracted').catch(() => false);
    const hasContractSum = await columnExistsInDb('projects', 'contractSum').catch(() => false);
    const updatedExpr = isPg
        ? (hasUpdatedAtSnake ? `p.updated_at` : `NULL::timestamptz`)
        : (hasUpdatedAt ? `p.updatedAt` : `NULL`);
    const projectCodeExpr = isPg
        ? `COALESCE(NULLIF(TRIM(p.data_sources->>'project_ref_num'), ''), CONCAT('Project #', p.project_id))`
        : (hasProjectRef ? `COALESCE(NULLIF(TRIM(p.ProjectRefNum), ''), CONCAT('Project #', p.id))` : `CONCAT('Project #', p.id)`);
    const tenderNumberExpr = isPg
        ? `COALESCE(
            NULLIF(TRIM(p.data_sources->>'tender_contract_no'), ''),
            NULLIF(TRIM(p.data_sources->>'tenderContractNo'), ''),
            NULLIF(TRIM(p.data_sources->>'TenderContractNo'), ''),
            ''
          )`
        : (hasTenderContractNo && hasTenderContractNoCamel
            ? `COALESCE(NULLIF(TRIM(p.TenderContractNo), ''), NULLIF(TRIM(p.tenderContractNo), ''), '')`
            : hasTenderContractNo
                ? `COALESCE(NULLIF(TRIM(p.TenderContractNo), ''), '')`
                : hasTenderContractNoCamel
                    ? `COALESCE(NULLIF(TRIM(p.tenderContractNo), ''), '')`
                    : `''`);
    const contractedExpr = !isPg
        ? (hasContracted && hasContractSum
            ? `COALESCE(p.Contracted, p.contractSum, 0)`
            : hasContracted
                ? `COALESCE(p.Contracted, 0)`
                : hasContractSum
                    ? `COALESCE(p.contractSum, 0)`
                    : `0`)
        : null;
    const sql = isPg
        ? `
            SELECT
                p.project_id AS "projectId",
                ${projectCodeExpr} AS "projectCode",
                ${tenderNumberExpr} AS "tenderNumber",
                COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.project_id)) AS "projectName",
                COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "department",
                COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown') AS "status",
                COALESCE((p.budget->>'allocated_amount_kes')::numeric, 0) AS "budgetAmount",
                CASE
                    WHEN (p.budget->>'contracted') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (p.budget->>'contracted')::numeric
                    ELSE 0
                END AS "contractedAmount",
                COALESCE((p.budget->>'disbursed_amount_kes')::numeric, 0) AS "paidAmount",
                ${updatedExpr} AS "updatedAt"
            FROM projects p
            WHERE COALESCE(p.voided, false) = false
        `
        : `
            SELECT
                p.id AS projectId,
                ${projectCodeExpr} AS projectCode,
                ${tenderNumberExpr} AS tenderNumber,
                COALESCE(NULLIF(TRIM(p.projectName), ''), CONCAT('Project #', p.id)) AS projectName,
                COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned') AS department,
                COALESCE(NULLIF(TRIM(p.status), ''), 'Unknown') AS status,
                COALESCE(p.costOfProject, 0) AS budgetAmount,
                ${contractedExpr} AS contractedAmount,
                COALESCE(p.paidOut, 0) AS paidAmount,
                ${updatedExpr} AS updatedAt
            FROM projects p
            LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
            WHERE COALESCE(p.voided, 0) = 0
        `;
    const result = await pool.query(sql);
    const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
    return rows.map((row) => ({
        projectId: row.projectId ?? row.projectid,
        projectCode: row.projectCode ?? row.projectcode,
        tenderNumber: row.tenderNumber ?? row.tendernumber ?? '',
        projectName: row.projectName ?? row.projectname,
        department: row.department || 'Unassigned',
        status: row.status || 'Unknown',
        budgetAmount: toReportNumber(row.budgetAmount ?? row.budgetamount),
        contractedAmount: toReportNumber(row.contractedAmount ?? row.contractedamount),
        paidAmount: toReportNumber(row.paidAmount ?? row.paidamount),
        updatedAt: row.updatedAt ?? row.updatedat ?? null,
    }));
}

async function getGroupedAmountMap(isPg, tableName, projectIdColumn, amountColumn, whereSql = '') {
    if (!(await tableExistsInDb(tableName).catch(() => false))) return new Map();
    const projectExpr = isPg ? `"${projectIdColumn}"` : projectIdColumn;
    const amountExpr = isPg ? `"${amountColumn}"` : amountColumn;
    const sql = `
        SELECT ${projectExpr} AS project_id, COALESCE(SUM(${amountExpr}), 0) AS total_amount
        FROM ${tableName}
        ${whereSql ? `WHERE ${whereSql}` : ''}
        GROUP BY ${projectExpr}
    `;
    const result = await pool.query(sql);
    const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
    return new Map(rows.map((row) => [String(row.project_id), toReportNumber(row.total_amount)]));
}

router.get('/payment-list', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const isPg = DB_TYPE === 'postgresql';
        const startDate = String(req.query.startDate || '').slice(0, 10);
        const endDate = String(req.query.endDate || '').slice(0, 10);
        const search = String(req.query.search || '').trim().toLowerCase();
        const departmentFilter = String(req.query.department || '').trim();
        const sourceFilter = String(req.query.source || '').trim();
        const limit = Number(req.query.limit || 5000);
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10000, limit)) : 5000;

        const projects = await getPaymentListProjectRows(isPg);
        const byId = new Map(projects.map((p) => [String(p.projectId), p]));
        const byCode = new Map(projects.map((p) => [String(p.projectCode || '').toLowerCase(), p]).filter(([k]) => k));
        const byName = new Map(projects.map((p) => [String(p.projectName || '').toLowerCase(), p]).filter(([k]) => k));

        const fundingMap = await getGroupedAmountMap(
            isPg,
            'project_funding_entries',
            'project_id',
            'amount',
            isPg ? 'COALESCE(voided, false) = false' : 'COALESCE(voided, 0) = 0'
        ).catch(() => new Map());

        let certifiedMap = new Map();
        if (await tableExistsInDb('projectcertificate').catch(() => false)) {
            const hasCertNet = await columnExistsInDb('projectcertificate', 'certificateNetAmount').catch(() => false);
            const hasCertData = await columnExistsInDb('projectcertificate', 'certificateData').catch(() => false);
            const netPartsPg = [];
            const netPartsMy = [];
            if (hasCertNet) {
                netPartsPg.push(`c."certificateNetAmount"`);
                netPartsMy.push(`c.certificateNetAmount`);
            }
            if (hasCertData) {
                netPartsPg.push(`NULLIF(TRIM(c."certificateData"->>'certificateNetAmount'), '')::numeric`);
                netPartsPg.push(`NULLIF(TRIM(c."certificateData"->>'netAmount'), '')::numeric`);
                netPartsMy.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.certificateNetAmount')), '') AS DECIMAL(18,2))`);
                netPartsMy.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.netAmount')), '') AS DECIMAL(18,2))`);
            }
            const netExpr = isPg
                ? (netPartsPg.length ? `COALESCE(${netPartsPg.join(', ')}, 0)` : '0')
                : (netPartsMy.length ? `COALESCE(${netPartsMy.join(', ')}, 0)` : '0');
            const sql = isPg
                ? `SELECT c."projectId" AS project_id, COALESCE(SUM(${netExpr}), 0) AS total_amount
                   FROM projectcertificate c
                   WHERE COALESCE(c.voided, false) = false
                   GROUP BY c."projectId"`
                : `SELECT c.projectId AS project_id, COALESCE(SUM(${netExpr}), 0) AS total_amount
                   FROM projectcertificate c
                   WHERE COALESCE(c.voided, 0) = 0
                   GROUP BY c.projectId`;
            const result = await pool.query(sql);
            const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
            certifiedMap = new Map(rows.map((row) => [String(row.project_id), toReportNumber(row.total_amount)]));
        }

        let rows = [];
        const hasProjectPayments = await tableExistsInDb('projectpayments').catch(() => false);
        if (hasProjectPayments) {
            const result = await pool.query(`SELECT * FROM projectpayments LIMIT ${safeLimit}`);
            const rawRows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
            rows = rawRows
                .map((row, idx) => {
                    const projectId = firstPresent(row, ['projectId', 'project_id']);
                    const projectCode = firstPresent(row, ['projectCode', 'project_code', 'ProjectRefNum', 'projectRefNum', 'adpProjectCode']);
                    const projectName = firstPresent(row, ['projectName', 'project_name', 'name']);
                    const project =
                        (projectId != null ? byId.get(String(projectId)) : null) ||
                        (projectCode ? byCode.get(String(projectCode).toLowerCase()) : null) ||
                        (projectName ? byName.get(String(projectName).toLowerCase()) : null) ||
                        null;
                    const id = project?.projectId ?? projectId ?? `payment-${idx + 1}`;
                    return {
                        id: firstPresent(row, ['paymentId', 'payment_id', 'id']) ?? `payment-${idx + 1}`,
                        paymentDate: toIsoDateOnly(firstPresent(row, ['paymentDate', 'payment_date', 'paidAt', 'paid_at', 'paidDate', 'createdAt', 'created_at'])),
                        projectId: project?.projectId ?? projectId ?? null,
                        projectCode: project?.projectCode ?? projectCode ?? `Project #${id}`,
                        tenderNumber: project?.tenderNumber ?? firstPresent(row, ['tenderNumber', 'tender_number', 'TenderContractNo', 'tenderContractNo']) ?? '',
                        projectName: project?.projectName ?? projectName ?? `Project #${id}`,
                        department: project?.department || firstPresent(row, ['department', 'ministry']) || 'Unassigned',
                        status: project?.status || firstPresent(row, ['status']) || 'Unknown',
                        narration: firstPresent(row, ['narration', 'description', 'remarks', 'notes', 'particulars']) || 'Project payment',
                        amount: toReportNumber(firstPresent(row, ['amount', 'paymentAmount', 'payment_amount', 'paidAmount', 'amountPaid', 'paid_out'])),
                        budgetAmount: project?.budgetAmount || 0,
                        contractedAmount: project?.contractedAmount || 0,
                        paidAmount: project?.paidAmount || 0,
                        fundingAmount: fundingMap.get(String(project?.projectId ?? projectId)) || 0,
                        certifiedAmount: certifiedMap.get(String(project?.projectId ?? projectId)) || 0,
                        dataSource: 'Payment records',
                    };
                })
                .filter((row) => row.amount > 0);
        }

        if (!rows.length) {
            rows = projects
                .filter((project) => Number(project.paidAmount || 0) > 0)
                .map((project) => ({
                    id: `project-paid-${project.projectId}`,
                    paymentDate: toIsoDateOnly(project.updatedAt),
                    projectId: project.projectId,
                    projectCode: project.projectCode || `Project #${project.projectId}`,
                    tenderNumber: project.tenderNumber || '',
                    projectName: project.projectName || `Project #${project.projectId}`,
                    department: project.department || 'Unassigned',
                    status: project.status || 'Unknown',
                    narration: 'Recorded paid amount from project registry',
                    amount: Number(project.paidAmount || 0),
                    budgetAmount: Number(project.budgetAmount || 0),
                    contractedAmount: Number(project.contractedAmount || 0),
                    paidAmount: Number(project.paidAmount || 0),
                    fundingAmount: fundingMap.get(String(project.projectId)) || 0,
                    certifiedAmount: certifiedMap.get(String(project.projectId)) || 0,
                    dataSource: 'Project paid amount',
                }));
        }

        const filteredRows = rows
            .map((row) => ({
                ...row,
                absorptionPercentage: Number(row.budgetAmount || 0) > 0 ? (Number(row.paidAmount || row.amount || 0) / Number(row.budgetAmount || 0)) * 100 : 0,
                fundingCoveragePercentage: Number(row.budgetAmount || 0) > 0 ? (Number(row.fundingAmount || 0) / Number(row.budgetAmount || 0)) * 100 : 0,
                certificateVariance: Math.max(0, Number(row.certifiedAmount || 0) - Number(row.paidAmount || 0)),
            }))
            .filter((row) => rowMatchesDateRange(row.paymentDate, startDate, endDate))
            .filter((row) => !departmentFilter || row.department === departmentFilter)
            .filter((row) => !sourceFilter || row.dataSource === sourceFilter)
            .filter((row) => {
                if (!search) return true;
                return [row.tenderNumber, row.projectCode, row.projectName, row.department, row.status, row.narration, row.dataSource]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(search));
            })
            .sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')) || Number(b.amount || 0) - Number(a.amount || 0))
            .slice(0, safeLimit);

        const projectIds = new Set(filteredRows.map((row) => row.projectId).filter((id) => id !== null && id !== undefined));
        const departments = [...new Set(rows.map((row) => row.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const sources = [...new Set(rows.map((row) => row.dataSource).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const summary = filteredRows.reduce((acc, row) => {
            acc.totalPaid += Number(row.amount || 0);
            acc.totalBudget += Number(row.budgetAmount || 0);
            acc.totalContracted += Number(row.contractedAmount || 0);
            acc.totalFunding += Number(row.fundingAmount || 0);
            acc.totalCertified += Number(row.certifiedAmount || 0);
            return acc;
        }, { totalPaid: 0, totalBudget: 0, totalContracted: 0, totalFunding: 0, totalCertified: 0 });

        return res.status(200).json({
            rows: filteredRows,
            summary: {
                ...summary,
                rowCount: filteredRows.length,
                projectCount: projectIds.size,
                absorptionPercentage: summary.totalBudget > 0 ? (summary.totalPaid / summary.totalBudget) * 100 : 0,
                fundingCoveragePercentage: summary.totalBudget > 0 ? (summary.totalFunding / summary.totalBudget) * 100 : 0,
            },
            options: { departments, sources },
        });
    } catch (error) {
        console.error('Error building payment list report:', error);
        return res.status(500).json({ message: 'Error building payment list report', error: error.message });
    }
});

router.get('/project-finance-overview', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const isPg = DB_TYPE === 'postgresql';
        const hasFundingEntries = await tableExistsInDb('project_funding_entries').catch(() => false);
        const hasCertificates = await tableExistsInDb('projectcertificate').catch(() => false);
        const hasCertNetAmountColumn = hasCertificates && await columnExistsInDb('projectcertificate', 'certificateNetAmount').catch(() => false);
        const hasCertDataColumn = hasCertificates && await columnExistsInDb('projectcertificate', 'certificateData').catch(() => false);
        const projectsHasName = await columnExistsInDb('projects', 'name').catch(() => false);
        const projectsHasProjectName = await columnExistsInDb('projects', 'projectName').catch(() => false);
        const pgTitleLikeExpr = isPg
            ? (projectsHasName && projectsHasProjectName
                ? `LOWER(TRIM(COALESCE(NULLIF(p.name::text, ''), NULLIF(p."projectName"::text, ''))))`
                : projectsHasProjectName
                    ? `LOWER(TRIM(COALESCE(p."projectName"::text, '')))`
                    : projectsHasName
                        ? `LOWER(COALESCE(p.name::text, ''))`
                        : `LOWER(''::text)`)
            : '';
        const pgProjectNameSelect = isPg
            ? (projectsHasName && projectsHasProjectName
                ? `COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(p."projectName"), ''), CONCAT('Project #', p.project_id))`
                : projectsHasProjectName
                    ? `COALESCE(NULLIF(TRIM(p."projectName"), ''), CONCAT('Project #', p.project_id))`
                    : projectsHasName
                        ? `COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.project_id))`
                        : `CONCAT('Project #', p.project_id)`)
            : '';
        const myProjectNameSelect = !isPg
            ? (projectsHasName && projectsHasProjectName
                ? `COALESCE(NULLIF(TRIM(p.projectName), ''), NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.id))`
                : projectsHasName
                    ? `COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.id))`
                    : `COALESCE(NULLIF(TRIM(p.projectName), ''), CONCAT('Project #', p.id))`)
            : '';
        const params = [];
        const where = [isPg ? 'COALESCE(p.voided,false)=false' : 'COALESCE(p.voided,0)=0'];
        const projectName = String(req.query.projectName || '').trim();
        const department = String(req.query.department || '').trim();
        if (projectName) {
            if (isPg) {
                params.push(`%${projectName.toLowerCase()}%`);
                where.push(`${pgTitleLikeExpr} LIKE $${params.length}`);
            } else {
                params.push(`%${projectName.toLowerCase()}%`);
                const myTitle = projectsHasName && projectsHasProjectName
                    ? `LOWER(TRIM(COALESCE(NULLIF(p.projectName, ''), NULLIF(p.name, ''))))`
                    : projectsHasName
                        ? `LOWER(COALESCE(p.name, ''))`
                        : `LOWER(COALESCE(p.projectName, ''))`;
                where.push(`${myTitle} LIKE ?`);
            }
        }
        if (department) {
            if (isPg) {
                params.push(department);
                where.push(`COALESCE(p.state_department,'') = $${params.length}`);
            } else {
                params.push(department);
                where.push(`COALESCE(d.name,'') = ?`);
            }
        }
        const limit = Number(req.query.limit || 500);
        const budgetExpr = isPg ? `COALESCE((p.budget->>'allocated_amount_kes')::numeric,0)` : `COALESCE(p.costOfProject,0)`;
        const paidExpr = isPg ? `COALESCE((p.budget->>'disbursed_amount_kes')::numeric,0)` : `COALESCE(p.paidOut,0)`;
        const fundingExpr = hasFundingEntries
            ? (isPg
                ? `(SELECT COALESCE(SUM(fe.amount),0) FROM project_funding_entries fe WHERE fe.project_id = p.project_id AND COALESCE(fe.voided,false)=false)`
                : `(SELECT COALESCE(SUM(fe.amount),0) FROM project_funding_entries fe WHERE fe.project_id = p.id AND COALESCE(fe.voided,0)=0)`)
            : `0`;
        /** Prefer persisted snapshot (BQ + tax at certificate date); then column / JSON amounts. */
        let certExpr = '0';
        if (hasCertificates) {
            const partsPg = [];
            const partsMy = [];
            if (hasCertDataColumn) {
                partsPg.push(`NULLIF(TRIM(c."certificateData"->>'snapshotComputedNet'),'')::numeric`);
                partsMy.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.snapshotComputedNet')), '') AS DECIMAL(18,2))`);
            }
            if (hasCertNetAmountColumn) {
                partsPg.push(`c."certificateNetAmount"`);
                partsMy.push('c.certificateNetAmount');
            }
            if (hasCertDataColumn) {
                partsPg.push(`NULLIF(TRIM(c."certificateData"->>'certificateNetAmount'),'')::numeric`);
                partsPg.push(`NULLIF(TRIM(c."certificateData"->>'netAmount'),'')::numeric`);
                partsMy.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.certificateNetAmount')), '') AS DECIMAL(18,2))`);
                partsMy.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.netAmount')), '') AS DECIMAL(18,2))`);
            }
            const innerPg = partsPg.length ? `COALESCE(${partsPg.join(', ')}, 0)` : '0';
            const innerMy = partsMy.length ? `COALESCE(${partsMy.join(', ')}, 0)` : '0';
            certExpr = isPg
                ? `(SELECT COALESCE(SUM(${innerPg}),0) FROM projectcertificate c WHERE c."projectId" = p.project_id AND COALESCE(c.voided,false)=false)`
                : `(SELECT COALESCE(SUM(${innerMy}),0) FROM projectcertificate c WHERE c.projectId = p.id AND COALESCE(c.voided,0)=0)`;
        }
        const sql = isPg
            ? `
                SELECT
                    p.project_id AS "projectId",
                    ${pgProjectNameSelect} AS "projectName",
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "department",
                    COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown') AS "status",
                    ${budgetExpr} AS "budgetAmount",
                    ${paidExpr} AS "paidAmount",
                    ${fundingExpr} AS "partnerFundingAmount",
                    ${certExpr} AS "certifiedAmount"
                FROM projects p
                WHERE ${where.join(' AND ')}
                ORDER BY p.project_id DESC
                LIMIT ${Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 500}
            `
            : `
                SELECT
                    p.id AS projectId,
                    ${myProjectNameSelect} AS projectName,
                    COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned') AS department,
                    COALESCE(NULLIF(TRIM(p.status), ''), 'Unknown') AS status,
                    ${budgetExpr} AS budgetAmount,
                    ${paidExpr} AS paidAmount,
                    ${fundingExpr} AS partnerFundingAmount,
                    ${certExpr} AS certifiedAmount
                FROM projects p
                LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
                WHERE ${where.join(' AND ')}
                ORDER BY p.id DESC
                LIMIT ${Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 500}
            `;
        const result = await pool.query(sql, params);
        const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
        const normalized = rows.map((r) => {
            const budget = Number(r.budgetAmount || 0);
            const paid = Number(r.paidAmount || 0);
            const partnerFunding = Number(r.partnerFundingAmount || 0);
            const certified = Number(r.certifiedAmount || 0);
            return {
                ...r,
                budgetAmount: budget,
                paidAmount: paid,
                partnerFundingAmount: partnerFunding,
                certifiedAmount: certified,
                pendingBillAmount: Math.max(0, certified - paid),
                absorptionPercentage: budget > 0 ? (paid / budget) * 100 : 0,
                financingGapAmount: Math.max(0, budget - partnerFunding),
            };
        });
        const summary = normalized.reduce((acc, r) => {
            acc.totalBudget += r.budgetAmount;
            acc.totalPaid += r.paidAmount;
            acc.totalPartnerFunding += r.partnerFundingAmount;
            acc.totalCertified += r.certifiedAmount;
            acc.totalPendingBills += r.pendingBillAmount;
            acc.totalFinancingGap += r.financingGapAmount;
            acc.count += 1;
            return acc;
        }, { count: 0, totalBudget: 0, totalPaid: 0, totalPartnerFunding: 0, totalCertified: 0, totalPendingBills: 0, totalFinancingGap: 0 });
        return res.status(200).json({ rows: normalized, summary });
    } catch (error) {
        console.error('Error building project finance overview:', error);
        return res.status(500).json({ message: 'Error building project finance overview', error: error.message });
    }
});

router.get('/partner-contributions', async (_req, res) => {
    try {
        const DB_TYPE = getDBType();
        const isPg = DB_TYPE === 'postgresql';
        const hasFundingEntries = await tableExistsInDb('project_funding_entries').catch(() => false);
        const hasPartners = await tableExistsInDb('project_partners').catch(() => false);
        if (!hasFundingEntries || !hasPartners) return res.status(200).json({ rows: [], summary: { count: 0, totalContribution: 0 } });
        const sql = isPg
            ? `
                SELECT
                    COALESCE(pp.partner_id, fe.partner_id, fs.partner_id) AS "partnerId",
                    COALESCE(NULLIF(TRIM(pp.partner_name), ''), 'Unassigned Partner') AS "partnerName",
                    COUNT(DISTINCT fe.project_id) AS "projectsSupported",
                    COALESCE(SUM(fe.amount), 0) AS "totalContribution"
                FROM project_funding_entries fe
                LEFT JOIN funding_sources fs ON fs.source_id = fe.source_id
                LEFT JOIN project_partners pp ON pp.partner_id = COALESCE(fe.partner_id, fs.partner_id)
                WHERE COALESCE(fe.voided, false) = false
                GROUP BY COALESCE(pp.partner_id, fe.partner_id, fs.partner_id), COALESCE(NULLIF(TRIM(pp.partner_name), ''), 'Unassigned Partner')
                ORDER BY "totalContribution" DESC, "partnerName" ASC
            `
            : `
                SELECT
                    COALESCE(pp.partner_id, fe.partner_id, fs.partner_id) AS partnerId,
                    COALESCE(NULLIF(TRIM(pp.partner_name), ''), 'Unassigned Partner') AS partnerName,
                    COUNT(DISTINCT fe.project_id) AS projectsSupported,
                    COALESCE(SUM(fe.amount), 0) AS totalContribution
                FROM project_funding_entries fe
                LEFT JOIN funding_sources fs ON fs.source_id = fe.source_id
                LEFT JOIN project_partners pp ON pp.partner_id = COALESCE(fe.partner_id, fs.partner_id)
                WHERE COALESCE(fe.voided, 0) = 0
                GROUP BY COALESCE(pp.partner_id, fe.partner_id, fs.partner_id), COALESCE(NULLIF(TRIM(pp.partner_name), ''), 'Unassigned Partner')
                ORDER BY totalContribution DESC, partnerName ASC
            `;
        const result = await pool.query(sql);
        const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
        const normalized = rows.map((r) => ({
            partnerId: r.partnerId ?? r.partnerid ?? null,
            partnerName: r.partnerName ?? r.partnername ?? 'Unassigned Partner',
            projectsSupported: Number(r.projectsSupported ?? r.projectssupported ?? 0),
            totalContribution: Number(r.totalContribution ?? r.totalcontribution ?? 0),
        }));
        const summary = normalized.reduce((acc, r) => {
            acc.count += 1;
            acc.totalContribution += r.totalContribution;
            return acc;
        }, { count: 0, totalContribution: 0 });
        return res.status(200).json({ rows: normalized, summary });
    } catch (error) {
        console.error('Error building partner contributions report:', error);
        return res.status(500).json({ message: 'Error building partner contributions report', error: error.message });
    }
});

router.get('/projects-by-funding-source', async (req, res) => {
    try {
        const DB_TYPE = getDBType();
        const isPg = DB_TYPE === 'postgresql';
        const hasFundingEntries = await tableExistsInDb('project_funding_entries').catch(() => false);
        const hasFundingSources = await tableExistsInDb('funding_sources').catch(() => false);
        const hasPartners = await tableExistsInDb('project_partners').catch(() => false);
        if (!hasFundingEntries) {
            return res.status(200).json({
                groups: [],
                summary: { groupCount: 0, projectCount: 0, entryCount: 0, totalFunding: 0 },
            });
        }

        const projectsHasName = await columnExistsInDb('projects', 'name').catch(() => false);
        const projectsHasProjectName = await columnExistsInDb('projects', 'projectName').catch(() => false);
        const pgProjectNameSelect = isPg
            ? (projectsHasName && projectsHasProjectName
                ? `COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(p."projectName"), ''), CONCAT('Project #', p.project_id))`
                : projectsHasProjectName
                    ? `COALESCE(NULLIF(TRIM(p."projectName"), ''), CONCAT('Project #', p.project_id))`
                    : projectsHasName
                        ? `COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.project_id))`
                        : `CONCAT('Project #', p.project_id)`)
            : '';
        const myProjectNameSelect = !isPg
            ? (projectsHasName && projectsHasProjectName
                ? `COALESCE(NULLIF(TRIM(p.projectName), ''), NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.id))`
                : projectsHasName
                    ? `COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.id))`
                    : `COALESCE(NULLIF(TRIM(p.projectName), ''), CONCAT('Project #', p.id))`)
            : '';

        const params = [];
        const where = [isPg ? 'COALESCE(fe.voided,false)=false' : 'COALESCE(fe.voided,0)=0'];
        where.push(isPg ? 'COALESCE(p.voided,false)=false' : 'COALESCE(p.voided,0)=0');

        const projectName = String(req.query.projectName || '').trim();
        const department = String(req.query.department || '').trim();
        const source = String(req.query.source || '').trim();

        if (projectName) {
            params.push(`%${projectName.toLowerCase()}%`);
            if (isPg) {
                const titleExpr = `LOWER(TRIM(${pgProjectNameSelect}))`;
                where.push(`${titleExpr} LIKE $${params.length}`);
            } else {
                const titleExpr = `LOWER(TRIM(${myProjectNameSelect}))`;
                where.push(`${titleExpr} LIKE ?`);
            }
        }
        if (department) {
            params.push(department);
            where.push(isPg ? `COALESCE(p.state_department,'') = $${params.length}` : `COALESCE(d.name,'') = ?`);
        }

        const fsJoin = hasFundingSources
            ? 'LEFT JOIN funding_sources fs ON fs.source_id = fe.source_id'
            : (isPg ? 'LEFT JOIN (SELECT NULL::integer AS source_id, NULL::integer AS partner_id, NULL::text AS source_name) fs ON false' : 'LEFT JOIN (SELECT NULL AS source_id, NULL AS partner_id, NULL AS source_name) fs ON 1=0');
        const ppJoin = hasPartners
            ? 'LEFT JOIN project_partners pp ON pp.partner_id = COALESCE(fe.partner_id, fs.partner_id) AND ' + (isPg ? 'COALESCE(pp.voided,false)=false' : 'COALESCE(pp.voided,0)=0')
            : (isPg ? 'LEFT JOIN (SELECT NULL::integer AS partner_id, NULL::text AS partner_name) pp ON false' : 'LEFT JOIN (SELECT NULL AS partner_id, NULL AS partner_name) pp ON 1=0');

        const sourceNameExpr = `COALESCE(NULLIF(TRIM(pp.partner_name), ''), NULLIF(TRIM(fs.source_name), ''), 'Unknown Source')`;
        if (source) {
            params.push(`%${source.toLowerCase()}%`);
            where.push(isPg ? `LOWER(${sourceNameExpr}) LIKE $${params.length}` : `LOWER(${sourceNameExpr}) LIKE ?`);
        }

        const limit = Number(req.query.limit || 5000);
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10000, limit)) : 5000;
        const budgetExpr = isPg ? `COALESCE((p.budget->>'allocated_amount_kes')::numeric,0)` : `COALESCE(p.costOfProject,0)`;
        const paidExpr = isPg ? `COALESCE((p.budget->>'disbursed_amount_kes')::numeric,0)` : `COALESCE(p.paidOut,0)`;

        const sql = isPg
            ? `
                SELECT
                    p.project_id AS "projectId",
                    ${pgProjectNameSelect} AS "projectName",
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "department",
                    COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown') AS "status",
                    ${budgetExpr} AS "budgetAmount",
                    ${paidExpr} AS "paidAmount",
                    fe.entry_id AS "entryId",
                    fe.amount AS "fundingAmount",
                    fe.stage,
                    fe.source_id AS "sourceId",
                    fe.partner_id AS "entryPartnerId",
                    fs.partner_id AS "sourcePartnerId",
                    COALESCE(pp.partner_id, fe.partner_id, fs.partner_id) AS "partnerId",
                    ${sourceNameExpr} AS "fundingSourceName"
                FROM project_funding_entries fe
                JOIN projects p ON p.project_id = fe.project_id
                ${fsJoin}
                ${ppJoin}
                WHERE ${where.join(' AND ')}
                ORDER BY "fundingSourceName" ASC, "fundingAmount" DESC, p.project_id DESC
                LIMIT ${safeLimit}
            `
            : `
                SELECT
                    p.id AS projectId,
                    ${myProjectNameSelect} AS projectName,
                    COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned') AS department,
                    COALESCE(NULLIF(TRIM(p.status), ''), 'Unknown') AS status,
                    ${budgetExpr} AS budgetAmount,
                    ${paidExpr} AS paidAmount,
                    fe.entry_id AS entryId,
                    fe.amount AS fundingAmount,
                    fe.stage,
                    fe.source_id AS sourceId,
                    fe.partner_id AS entryPartnerId,
                    fs.partner_id AS sourcePartnerId,
                    COALESCE(pp.partner_id, fe.partner_id, fs.partner_id) AS partnerId,
                    ${sourceNameExpr} AS fundingSourceName
                FROM project_funding_entries fe
                JOIN projects p ON p.id = fe.project_id
                LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
                ${fsJoin}
                ${ppJoin}
                WHERE ${where.join(' AND ')}
                ORDER BY fundingSourceName ASC, fundingAmount DESC, p.id DESC
                LIMIT ${safeLimit}
            `;

        const result = await pool.query(sql, params);
        const rows = isPg ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : []);
        const groupMap = new Map();

        rows.forEach((r) => {
            const partnerId = r.partnerId ?? r.partnerid ?? null;
            const sourceId = r.sourceId ?? r.sourceid ?? null;
            const sourceName = r.fundingSourceName ?? r.fundingsourcename ?? 'Unknown Source';
            const groupKey = partnerId != null ? `partner:${partnerId}` : sourceId != null ? `source:${sourceId}` : `name:${sourceName}`;
            const amount = Number(r.fundingAmount ?? r.fundingamount ?? 0);
            const projectId = r.projectId ?? r.projectid;

            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, {
                    fundingSourceKey: groupKey,
                    fundingSourceName: sourceName,
                    sourceId,
                    partnerId,
                    projectCount: 0,
                    entryCount: 0,
                    totalAmount: 0,
                    projects: [],
                    _projectTotals: new Map(),
                });
            }

            const group = groupMap.get(groupKey);
            group.entryCount += 1;
            group.totalAmount += amount;
            if (!group._projectTotals.has(projectId)) {
                group._projectTotals.set(projectId, {
                    projectId,
                    projectName: r.projectName ?? r.projectname ?? `Project #${projectId}`,
                    department: r.department || 'Unassigned',
                    status: r.status || 'Unknown',
                    budgetAmount: Number(r.budgetAmount ?? r.budgetamount ?? 0),
                    paidAmount: Number(r.paidAmount ?? r.paidamount ?? 0),
                    fundingAmount: 0,
                    entryCount: 0,
                    stages: new Set(),
                });
            }
            const project = group._projectTotals.get(projectId);
            project.fundingAmount += amount;
            project.entryCount += 1;
            if (r.stage) project.stages.add(String(r.stage));
        });

        const groups = [...groupMap.values()].map((group) => {
            const projects = [...group._projectTotals.values()]
                .map((project) => ({
                    ...project,
                    stages: [...project.stages].join(', '),
                }))
                .sort((a, b) => b.fundingAmount - a.fundingAmount || String(a.projectName).localeCompare(String(b.projectName)));
            delete group._projectTotals;
            return {
                ...group,
                projectCount: projects.length,
                totalAmount: Number(group.totalAmount || 0),
                projects,
            };
        }).sort((a, b) => b.totalAmount - a.totalAmount || String(a.fundingSourceName).localeCompare(String(b.fundingSourceName)));

        const projectIds = new Set();
        groups.forEach((group) => group.projects.forEach((project) => projectIds.add(project.projectId)));
        const summary = {
            groupCount: groups.length,
            projectCount: projectIds.size,
            entryCount: rows.length,
            totalFunding: groups.reduce((sum, group) => sum + Number(group.totalAmount || 0), 0),
        };

        return res.status(200).json({ groups, summary });
    } catch (error) {
        console.error('Error building projects by funding source report:', error);
        return res.status(500).json({ message: 'Error building projects by funding source report', error: error.message });
    }
});

/** Same entity_id mapping as project certificates + approval workflow engine. */
const CERT_APPROVAL_ENTITY_TYPES_SQL = `('project_certificate','payment_certificate','certificate')`;

/**
 * Extra SELECT fragments + JOIN for certificate rows on project financial statement Excel (approval trail).
 * @returns {{ extraSelect: string, extraJoin: string }}
 */
function certificateExportApprovalSql(isPg, { hasApprovalWf, hasUsersTbl, hasRolesTbl, hasApprovedByLegacy, hasApproverRemarks }) {
    const legacyBy = hasApprovedByLegacy
        ? (isPg
            ? `COALESCE(NULLIF(TRIM(c."approvedBy"), ''), '') AS "legacyApprovedByText"`
            : `COALESCE(NULLIF(TRIM(c.approvedBy), ''), '') AS legacyApprovedByText`)
        : (isPg ? `''::text AS "legacyApprovedByText"` : `'' AS legacyApprovedByText`);
    const remarks = hasApproverRemarks
        ? (isPg
            ? `COALESCE(NULLIF(TRIM(c."approverRemarks"), ''), '') AS "approverRemarks"`
            : `COALESCE(NULLIF(TRIM(c.approverRemarks), ''), '') AS approverRemarks`)
        : (isPg ? `''::text AS "approverRemarks"` : `'' AS approverRemarks`);

    if (!hasApprovalWf) {
        return {
            extraSelect: `
                   , ${legacyBy}
                   , ${remarks}
                   , ${isPg ? 'NULL::text' : 'NULL'} AS ${isPg ? '"approvalWorkflowStatus"' : 'approvalWorkflowStatus'}
                   , ${isPg ? 'NULL::timestamptz' : 'NULL'} AS ${isPg ? '"approvalResolvedAt"' : 'approvalResolvedAt'}
                   , ${isPg ? 'NULL::text' : 'NULL'} AS ${isPg ? '"approvalApprovedTrail"' : 'approvalApprovedTrail'}
                   , ${isPg ? 'NULL::text' : 'NULL'} AS ${isPg ? '"approvalPendingStepName"' : 'approvalPendingStepName'}
                   , ${isPg ? 'NULL::text' : 'NULL'} AS ${isPg ? '"approvalPendingRoleName"' : 'approvalPendingRoleName'}
            `,
            extraJoin: '',
        };
    }

    const signerPg = hasUsersTbl
        ? `COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.lastname, ''))), ''), '—')`
        : `'—'`;
    const roleSuffixPg = hasRolesTbl
        ? `CASE WHEN NULLIF(TRIM(r.name), '') IS NOT NULL THEN ' (' || TRIM(r.name) || ')' ELSE '' END`
        : `''::text`;

    const signerMy = hasUsersTbl
        ? `COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.firstName, ''), ' ', COALESCE(u.lastName, ''))), ''), '—')`
        : `'—'`;
    const roleSuffixMy = hasRolesTbl
        ? `CASE WHEN NULLIF(TRIM(r.roleName), '') IS NOT NULL THEN CONCAT(' (', TRIM(r.roleName), ')') ELSE '' END`
        : `''`;

    const fromTrailPg = hasUsersTbl && hasRolesTbl
        ? `FROM approval_step_instances si
           LEFT JOIN users u ON u.userid = si.completed_by
           LEFT JOIN roles r ON r.roleid = si.role_id`
        : hasUsersTbl
            ? `FROM approval_step_instances si
               LEFT JOIN users u ON u.userid = si.completed_by`
            : hasRolesTbl
                ? `FROM approval_step_instances si
                   LEFT JOIN roles r ON r.roleid = si.role_id`
                : `FROM approval_step_instances si`;

    const fromTrailMy = hasUsersTbl && hasRolesTbl
        ? `FROM approval_step_instances si
           LEFT JOIN users u ON u.userId = si.completed_by
           LEFT JOIN roles r ON r.roleId = si.role_id`
        : hasUsersTbl
            ? `FROM approval_step_instances si
               LEFT JOIN users u ON u.userId = si.completed_by`
            : hasRolesTbl
                ? `FROM approval_step_instances si
                   LEFT JOIN roles r ON r.roleId = si.role_id`
                : `FROM approval_step_instances si`;

    if (isPg) {
        const extraJoin = `
            LEFT JOIN LATERAL (
                SELECT ar.request_id, ar.status, ar.resolved_at
                FROM approval_requests ar
                WHERE ar.entity_type IN ${CERT_APPROVAL_ENTITY_TYPES_SQL}
                  AND ar.entity_id = c."certificateId"::text
                ORDER BY ar.request_id DESC
                LIMIT 1
            ) lar ON true`;
        const extraSelect = `
                   , ${legacyBy}
                   , ${remarks}
                   , lar.status AS "approvalWorkflowStatus"
                   , lar.resolved_at AS "approvalResolvedAt"
                   , (
                       SELECT STRING_AGG(
                           COALESCE(NULLIF(TRIM(si.step_name), ''), 'Step ' || si.step_order::text) || ': ' ||
                           ${signerPg} || ${roleSuffixPg},
                           E'\\n' ORDER BY si.step_order
                       )
                       ${fromTrailPg}
                       WHERE si.request_id = lar.request_id AND si.status = 'approved'
                   ) AS "approvalApprovedTrail"
                   , (
                       SELECT COALESCE(NULLIF(TRIM(si.step_name), ''), 'Step ' || si.step_order::text)
                       FROM approval_step_instances si
                       WHERE si.request_id = lar.request_id AND si.status = 'pending'
                       ORDER BY si.step_order ASC
                       LIMIT 1
                   ) AS "approvalPendingStepName"
                   , ${hasRolesTbl ? `(
                       SELECT NULLIF(TRIM(r.name), '')
                       FROM approval_step_instances si
                       LEFT JOIN roles r ON r.roleid = si.role_id
                       WHERE si.request_id = lar.request_id AND si.status = 'pending'
                       ORDER BY si.step_order ASC
                       LIMIT 1
                   )` : 'NULL::text'} AS "approvalPendingRoleName"
        `;
        return { extraSelect, extraJoin };
    }

    const latestReqMy = `(
        SELECT ar.request_id FROM approval_requests ar
        WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
          AND ar.entity_type IN ${CERT_APPROVAL_ENTITY_TYPES_SQL}
        ORDER BY ar.request_id DESC LIMIT 1
    )`;

    const extraSelect = `
                   , ${legacyBy}
                   , ${remarks}
                   , (
                       SELECT ar.status FROM approval_requests ar
                       WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                         AND ar.entity_type IN ${CERT_APPROVAL_ENTITY_TYPES_SQL}
                       ORDER BY ar.request_id DESC LIMIT 1
                     ) AS approvalWorkflowStatus
                   , (
                       SELECT ar.resolved_at FROM approval_requests ar
                       WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                         AND ar.entity_type IN ${CERT_APPROVAL_ENTITY_TYPES_SQL}
                       ORDER BY ar.request_id DESC LIMIT 1
                     ) AS approvalResolvedAt
                   , (
                       SELECT GROUP_CONCAT(
                           CONCAT(
                               COALESCE(NULLIF(TRIM(si.step_name), ''), CONCAT('Step ', si.step_order)),
                               ': ',
                               ${signerMy},
                               ${roleSuffixMy}
                           )
                           ORDER BY si.step_order SEPARATOR '\\n'
                       )
                       ${fromTrailMy}
                       WHERE si.request_id = ${latestReqMy} AND si.status = 'approved'
                     ) AS approvalApprovedTrail
                   , (
                       SELECT COALESCE(NULLIF(TRIM(si.step_name), ''), CONCAT('Step ', si.step_order))
                       FROM approval_step_instances si
                       WHERE si.request_id = ${latestReqMy} AND si.status = 'pending'
                       ORDER BY si.step_order ASC
                       LIMIT 1
                     ) AS approvalPendingStepName
                   , ${hasRolesTbl ? `(
                       SELECT NULLIF(TRIM(r.roleName), '')
                       FROM approval_step_instances si
                       LEFT JOIN roles r ON r.roleId = si.role_id
                       WHERE si.request_id = ${latestReqMy} AND si.status = 'pending'
                       ORDER BY si.step_order ASC
                       LIMIT 1
                     )` : 'NULL'} AS approvalPendingRoleName
    `;
    return { extraSelect, extraJoin: '' };
}

router.get('/project-financial-statement/export', async (req, res) => {
    try {
        const projectId = Number(req.query.projectId);
        if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'projectId is required.' });
        const DB_TYPE = getDBType();
        const isPg = DB_TYPE === 'postgresql';
        const projectSql = isPg
            ? `
                SELECT p.project_id AS "projectId",
                       COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Project #', p.project_id)) AS "projectName",
                       COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "department",
                       COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown') AS "status",
                       COALESCE((p.budget->>'allocated_amount_kes')::numeric, 0) AS "budgetAmount",
                       COALESCE((p.budget->>'disbursed_amount_kes')::numeric, 0) AS "paidAmount"
                FROM projects p
                WHERE p.project_id = $1
                LIMIT 1
            `
            : `
                SELECT p.id AS projectId,
                       COALESCE(NULLIF(TRIM(p.projectName), ''), CONCAT('Project #', p.id)) AS projectName,
                       COALESCE(NULLIF(TRIM(d.name), ''), 'Unassigned') AS department,
                       COALESCE(NULLIF(TRIM(p.status), ''), 'Unknown') AS status,
                       COALESCE(p.costOfProject, 0) AS budgetAmount,
                       COALESCE(p.paidOut, 0) AS paidAmount
                FROM projects p
                LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
                WHERE p.id = ?
                LIMIT 1
            `;
        const projectResult = await pool.query(projectSql, [projectId]);
        const projectRow = isPg ? (projectResult.rows || [])[0] : (Array.isArray(projectResult) ? (projectResult[0] || [])[0] : null);
        if (!projectRow) return res.status(404).json({ message: 'Project not found.' });

        const hasFundingEntries = await tableExistsInDb('project_funding_entries').catch(() => false);
        const hasCertificates = await tableExistsInDb('projectcertificate').catch(() => false);
        const hasCertNetAmountColumnEx = hasCertificates && await columnExistsInDb('projectcertificate', 'certificateNetAmount').catch(() => false);
        const hasCertDataColumnEx = hasCertificates && await columnExistsInDb('projectcertificate', 'certificateData').catch(() => false);
        let fundingRows = [];
        if (hasFundingEntries) {
            const fSql = isPg
                ? `
                    SELECT fe.entry_id AS "entryId",
                           fe.amount,
                           fe.stage,
                           fe.notes,
                           fe.created_at AS "createdAt",
                           COALESCE(pp.partner_name, fs.source_name, 'Unknown Source') AS "fundingSource"
                    FROM project_funding_entries fe
                    LEFT JOIN funding_sources fs ON fs.source_id = fe.source_id
                    LEFT JOIN project_partners pp ON pp.partner_id = COALESCE(fe.partner_id, fs.partner_id)
                    WHERE fe.project_id = $1 AND COALESCE(fe.voided, false) = false
                    ORDER BY fe.created_at DESC, fe.entry_id DESC
                `
                : `
                    SELECT fe.entry_id AS entryId,
                           fe.amount,
                           fe.stage,
                           fe.notes,
                           fe.created_at AS createdAt,
                           COALESCE(pp.partner_name, fs.source_name, 'Unknown Source') AS fundingSource
                    FROM project_funding_entries fe
                    LEFT JOIN funding_sources fs ON fs.source_id = fe.source_id
                    LEFT JOIN project_partners pp ON pp.partner_id = COALESCE(fe.partner_id, fs.partner_id)
                    WHERE fe.project_id = ? AND COALESCE(fe.voided, 0) = 0
                    ORDER BY fe.created_at DESC, fe.entry_id DESC
                `;
            const fr = await pool.query(fSql, [projectId]);
            fundingRows = isPg ? (fr.rows || []) : (Array.isArray(fr) ? (fr[0] || []) : []);
        }
        let certRows = [];
        if (hasCertificates) {
            const hasApprovedByLegacy = await columnExistsInDb('projectcertificate', 'approvedBy').catch(() => false);
            const hasApproverRemarksCol = await columnExistsInDb('projectcertificate', 'approverRemarks').catch(() => false);
            const hasApprovalWf = await tableExistsInDb('approval_requests').catch(() => false)
                && await tableExistsInDb('approval_step_instances').catch(() => false);
            const hasUsersTbl = await tableExistsInDb('users').catch(() => false);
            const hasRolesTbl = await tableExistsInDb('roles').catch(() => false);
            const { extraSelect, extraJoin } = certificateExportApprovalSql(isPg, {
                hasApprovalWf,
                hasUsersTbl,
                hasRolesTbl,
                hasApprovedByLegacy,
                hasApproverRemarks: hasApproverRemarksCol,
            });

            const partsPgEx = [];
            const partsMyEx = [];
            if (hasCertDataColumnEx) {
                partsPgEx.push(`NULLIF(TRIM(c."certificateData"->>'snapshotComputedNet'),'')::numeric`);
                partsMyEx.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.snapshotComputedNet')), '') AS DECIMAL(18,2))`);
            }
            if (hasCertNetAmountColumnEx) {
                partsPgEx.push('c."certificateNetAmount"');
                partsMyEx.push('c.certificateNetAmount');
            }
            if (hasCertDataColumnEx) {
                partsPgEx.push(`NULLIF(TRIM(c."certificateData"->>'certificateNetAmount'),'')::numeric`);
                partsPgEx.push(`NULLIF(TRIM(c."certificateData"->>'netAmount'),'')::numeric`);
                partsMyEx.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.certificateNetAmount')), '') AS DECIMAL(18,2))`);
                partsMyEx.push(`CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.certificateData, '$.netAmount')), '') AS DECIMAL(18,2))`);
            }
            const certAmtPg = partsPgEx.length ? `COALESCE(${partsPgEx.join(', ')}, 0)` : '0';
            const certAmtMy = partsMyEx.length ? `COALESCE(${partsMyEx.join(', ')}, 0)` : '0';
            const cSql = isPg
                ? `
                    SELECT c."certificateId" AS "certificateId",
                           COALESCE(NULLIF(TRIM(c."certNumber"), ''), '') AS "certificateNo",
                           COALESCE(c."awardDate", c."requestDate") AS "certificateDate",
                           ${certAmtPg} AS "certificateNetAmount"
                           ${extraSelect}
                    FROM projectcertificate c
                    ${extraJoin}
                    WHERE c."projectId" = $1 AND COALESCE(c.voided, false) = false
                    ORDER BY COALESCE(c."awardDate", c."requestDate") DESC NULLS LAST, c."certificateId" DESC
                `
                : `
                    SELECT c.certificateId AS certificateId,
                           COALESCE(NULLIF(TRIM(c.certNumber), ''), '') AS certificateNo,
                           COALESCE(c.awardDate, c.requestDate) AS certificateDate,
                           ${certAmtMy} AS certificateNetAmount
                           ${extraSelect}
                    FROM projectcertificate c
                    ${extraJoin}
                    WHERE c.projectId = ? AND COALESCE(c.voided, 0) = 0
                    ORDER BY COALESCE(c.awardDate, c.requestDate) DESC, c.certificateId DESC
                `;
            const cr = await pool.query(cSql, [projectId]);
            certRows = isPg ? (cr.rows || []) : (Array.isArray(cr) ? (cr[0] || []) : []);
        }

        const workbook = new ExcelJS.Workbook();
        const summaryWs = workbook.addWorksheet('Project Summary');
        summaryWs.columns = [{ header: 'Field', key: 'field', width: 32 }, { header: 'Value', key: 'value', width: 52 }];
        summaryWs.addRows([
            { field: 'Project ID', value: projectRow.projectId || projectRow.projectid || projectId },
            { field: 'Project Name', value: projectRow.projectName || projectRow.projectname || '' },
            { field: 'Department', value: projectRow.department || '' },
            { field: 'Status', value: projectRow.status || '' },
            { field: 'Budget Amount', value: Number(projectRow.budgetAmount || projectRow.budgetamount || 0) },
            { field: 'Paid Amount', value: Number(projectRow.paidAmount || projectRow.paidamount || 0) },
            { field: 'Total Funding Entries', value: fundingRows.length },
            { field: 'Total Certificates', value: certRows.length },
        ]);
        summaryWs.getRow(1).font = { bold: true };

        const fundingWs = workbook.addWorksheet('Funding Entries');
        fundingWs.columns = [
            { header: 'Entry ID', key: 'entryId', width: 12 },
            { header: 'Funding Source', key: 'fundingSource', width: 30 },
            { header: 'Amount', key: 'amount', width: 14 },
            { header: 'Stage', key: 'stage', width: 20 },
            { header: 'Notes', key: 'notes', width: 40 },
            { header: 'Created At', key: 'createdAt', width: 24 },
        ];
        fundingRows.forEach((r) => fundingWs.addRow({
            entryId: r.entryId || r.entryid,
            fundingSource: r.fundingSource || r.fundingsource,
            amount: Number(r.amount || 0),
            stage: r.stage || '',
            notes: r.notes || '',
            createdAt: r.createdAt || r.createdat || '',
        }));
        fundingWs.getRow(1).font = { bold: true };

        const certWs = workbook.addWorksheet('Certificates');
        certWs.columns = [
            { header: 'Certificate ID', key: 'certificateId', width: 14 },
            { header: 'Certificate No', key: 'certificateNo', width: 24 },
            { header: 'Certificate Date', key: 'certificateDate', width: 22 },
            { header: 'Net Amount', key: 'certificateNetAmount', width: 16 },
            { header: 'Legacy approver (recorded on certificate)', key: 'legacyApprovedByText', width: 28 },
            { header: 'Approver remarks', key: 'approverRemarks', width: 36 },
            { header: 'Approval workflow status', key: 'approvalWorkflowStatus', width: 22 },
            { header: 'Workflow resolved at', key: 'approvalResolvedAt', width: 22 },
            { header: 'Approved steps (approver + role)', key: 'approvalApprovedTrail', width: 52 },
            { header: 'Pending step', key: 'approvalPendingStepName', width: 28 },
            { header: 'Pending step role', key: 'approvalPendingRoleName', width: 24 },
        ];
        certRows.forEach((r) => {
            certWs.addRow({
                certificateId: r.certificateId ?? r.certificateid ?? '',
                certificateNo: r.certificateNo ?? r.certificateno ?? '',
                certificateDate: r.certificateDate ?? r.certificatedate ?? '',
                certificateNetAmount: Number(r.certificateNetAmount ?? r.certificatenetamount ?? 0),
                legacyApprovedByText: r.legacyApprovedByText ?? r.legacyapprovedbytext ?? '',
                approverRemarks: r.approverRemarks ?? r.approverremarks ?? '',
                approvalWorkflowStatus: r.approvalWorkflowStatus ?? r.approvalworkflowstatus ?? '',
                approvalResolvedAt: r.approvalResolvedAt ?? r.approvalresolvedat ?? '',
                approvalApprovedTrail: r.approvalApprovedTrail ?? r.approvalapprovedtrail ?? '',
                approvalPendingStepName: r.approvalPendingStepName ?? r.approvalpendingstepname ?? '',
                approvalPendingRoleName: r.approvalPendingRoleName ?? r.approvalpendingrolename ?? '',
            });
        });
        for (let ri = 2; ri <= certWs.rowCount; ri++) {
            const cell = certWs.getRow(ri).getCell('approvalApprovedTrail');
            cell.alignment = { wrapText: true, vertical: 'top' };
        }
        certWs.getRow(1).font = { bold: true };

        const safeName = String(projectRow.projectName || projectRow.projectname || `project-${projectId}`).replace(/[^a-zA-Z0-9_-]/g, '-');
        const fileName = `project-financial-statement-${safeName}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting project financial statement:', error);
        return res.status(500).json({ message: 'Error exporting project financial statement', error: error.message });
    }
});

const safeMoneyExpr = (jsonExpr, key) => `
    CASE
        WHEN (${jsonExpr}->>'${key}') ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN (${jsonExpr}->>'${key}')::numeric
        ELSE 0
    END
`;

const safeProgressExpr = (alias = 'p') => `
    CASE
        WHEN (${alias}.progress->>'percentage_complete') ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN (${alias}.progress->>'percentage_complete')::numeric
        ELSE 0
    END
`;

const projectOperationalDateExpr = (alias = 'p') => `
    COALESCE(
        NULLIF(${alias}.timeline->>'last_updated', '')::date,
        NULLIF(${alias}.timeline->>'expected_completion_date', '')::date,
        NULLIF(${alias}.timeline->>'start_date', '')::date,
        ${alias}.updated_at::date
    )
`;

const fiscalYearExpr = (dateExpr) => `
    CASE
        WHEN ${dateExpr} IS NULL THEN NULL
        WHEN EXTRACT(MONTH FROM ${dateExpr}) >= 7
            THEN EXTRACT(YEAR FROM ${dateExpr})::int::text || '/' || (EXTRACT(YEAR FROM ${dateExpr})::int + 1)::text
        ELSE (EXTRACT(YEAR FROM ${dateExpr})::int - 1)::text || '/' || EXTRACT(YEAR FROM ${dateExpr})::int::text
    END
`;

const fiscalQuarterExpr = (dateExpr) => `
    CASE
        WHEN ${dateExpr} IS NULL THEN NULL
        WHEN EXTRACT(MONTH FROM ${dateExpr}) BETWEEN 7 AND 9 THEN 'Q1'
        WHEN EXTRACT(MONTH FROM ${dateExpr}) BETWEEN 10 AND 12 THEN 'Q2'
        WHEN EXTRACT(MONTH FROM ${dateExpr}) BETWEEN 1 AND 3 THEN 'Q3'
        WHEN EXTRACT(MONTH FROM ${dateExpr}) BETWEEN 4 AND 6 THEN 'Q4'
        ELSE NULL
    END
`;

const getCountyOpsPeriodBounds = (financialYear, period) => {
    const match = String(financialYear || '').match(/(\d{4})\D+(\d{4})/);
    if (!match) return null;
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
    const key = String(period || '').trim().toUpperCase();
    const ranges = {
        Q1: [`${startYear}-07-01`, `${startYear}-09-30`],
        Q2: [`${startYear}-10-01`, `${startYear}-12-31`],
        Q3: [`${endYear}-01-01`, `${endYear}-03-31`],
        Q4: [`${endYear}-04-01`, `${endYear}-06-30`],
        H1: [`${startYear}-07-01`, `${startYear}-12-31`],
        H2: [`${endYear}-01-01`, `${endYear}-06-30`],
        ANNUAL: [`${startYear}-07-01`, `${endYear}-06-30`],
    };
    const range = ranges[key];
    return range ? { startDate: range[0], endDate: range[1] } : null;
};

let countyOperationsTablesEnsured = false;
async function ensureCountyOperationsReportTables() {
    if (countyOperationsTablesEnsured || getDBType() !== 'postgresql') return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS planning_measurement_types (
            id BIGSERIAL PRIMARY KEY,
            code TEXT NOT NULL,
            label TEXT NOT NULL,
            description TEXT NULL,
            voided BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_planning_mt_code UNIQUE (code)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS planning_indicators (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NULL,
            measurement_type_id BIGINT NOT NULL REFERENCES planning_measurement_types(id),
            voided BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS planning_project_activities (
            id BIGSERIAL PRIMARY KEY,
            activity_code TEXT NOT NULL,
            activity_name TEXT NOT NULL,
            indicator_id BIGINT NOT NULL REFERENCES planning_indicators(id),
            description TEXT NULL,
            voided BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_planning_proj_act_code UNIQUE (activity_code)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_planning_activity_links (
            id BIGSERIAL PRIMARY KEY,
            project_id BIGINT NOT NULL,
            planning_activity_id BIGINT NOT NULL REFERENCES planning_project_activities(id),
            target_value NUMERIC NULL,
            baseline_value NUMERIC NULL,
            notes TEXT NULL,
            planned_start_date DATE NULL,
            planned_end_date DATE NULL,
            activity_status TEXT NULL,
            completed_at DATE NULL,
            cimes_project_code TEXT NULL,
            cimes_project_name TEXT NULL,
            seed_source TEXT NULL,
            voided BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_proj_plan_act_link_idx ON project_planning_activity_links(project_id, planning_activity_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ppactlink_project ON project_planning_activity_links(project_id)`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS target_value NUMERIC NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS baseline_value NUMERIC NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS planned_start_date DATE NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS planned_end_date DATE NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS activity_status TEXT NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS completed_at DATE NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS cimes_project_code TEXT NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS cimes_project_name TEXT NULL`);
    await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS seed_source TEXT NULL`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_monitoring_records (
            record_id BIGSERIAL PRIMARY KEY,
            project_id BIGINT NOT NULL,
            comment TEXT NOT NULL,
            recommendations TEXT NULL,
            challenges TEXT NULL,
            activity_code TEXT NULL,
            activity_name TEXT NULL,
            indicator_name TEXT NULL,
            achieved_value NUMERIC NULL,
            warning_level TEXT NULL,
            is_routine_observation BOOLEAN NOT NULL DEFAULT TRUE,
            user_id BIGINT NULL,
            observation_date DATE NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL,
            voided BOOLEAN NOT NULL DEFAULT FALSE,
            voided_by BIGINT NULL
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_monitoring_records_project_id ON project_monitoring_records(project_id)`);
    await pool.query(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS activity_code TEXT NULL`);
    await pool.query(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS activity_name TEXT NULL`);
    await pool.query(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS indicator_name TEXT NULL`);
    await pool.query(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS achieved_value NUMERIC NULL`);
    await pool.query(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS warning_level TEXT NULL`);
    await pool.query(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS observation_date DATE NULL`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_evaluations (
            id BIGSERIAL PRIMARY KEY,
            project_id BIGINT NOT NULL,
            evaluation_date DATE NULL,
            project_code TEXT NULL,
            project_name TEXT NULL,
            activity_code TEXT NULL,
            activity_name TEXT NULL,
            indicator_name TEXT NULL,
            milestone_value NUMERIC NULL,
            baseline_value NUMERIC NULL,
            achieved_value NUMERIC NULL,
            performance_score NUMERIC NULL,
            voided BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_evaluations_project ON project_evaluations(project_id)`);
    await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS evaluation_date DATE NULL`);
    await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS baseline_value NUMERIC NULL`);
    await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS achieved_value NUMERIC NULL`);
    await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS performance_score NUMERIC NULL`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS planning_reporting_frequencies (
            id BIGSERIAL PRIMARY KEY,
            frequency_code TEXT NOT NULL,
            frequency_name TEXT NOT NULL,
            description TEXT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            voided BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_planning_reporting_frequency_code UNIQUE (frequency_code)
        )
    `);
    countyOperationsTablesEnsured = true;
}

async function buildCountyOperationsProjectWhere(req, alias = 'p', startingIndex = 1) {
    const { department, section, status, financialYear, period, startDate, endDate, subCounty, ward } = req.query || {};
    const where = [`COALESCE(${alias}.voided, false) = false`];
    const params = [];
    let idx = startingIndex;
    const dateExpr = projectOperationalDateExpr(alias);
    const fyExpr = fiscalYearExpr(dateExpr);
    const fqExpr = fiscalQuarterExpr(dateExpr);

    if (department) {
        where.push(`COALESCE(NULLIF(TRIM(${alias}.state_department), ''), 'Unassigned') = $${idx++}`);
        params.push(String(department));
    }
    if (section) {
        where.push(`COALESCE(NULLIF(TRIM(${alias}.implementing_agency), ''), 'Unassigned') = $${idx++}`);
        params.push(String(section));
    }
    if (status) {
        where.push(`COALESCE(${alias}.progress->>'status', 'Unknown') ILIKE $${idx++}`);
        params.push(String(status));
    }
    if (financialYear) {
        where.push(`(NULLIF(TRIM(${alias}.timeline->>'financial_year'), '') = $${idx} OR ${fyExpr} = $${idx})`);
        params.push(String(financialYear));
        idx += 1;
    }

    const periodBounds = getCountyOpsPeriodBounds(financialYear, period);
    if (periodBounds) {
        where.push(`${dateExpr} BETWEEN $${idx++}::date AND $${idx++}::date`);
        params.push(periodBounds.startDate, periodBounds.endDate);
    } else if (period && ['Q1', 'Q2', 'Q3', 'Q4'].includes(String(period).toUpperCase())) {
        where.push(`${fqExpr} = $${idx++}`);
        params.push(String(period).toUpperCase());
    }
    if (startDate) {
        where.push(`${dateExpr} >= $${idx++}::date`);
        params.push(String(startDate));
    }
    if (endDate) {
        where.push(`${dateExpr} <= $${idx++}::date`);
        params.push(String(endDate));
    }
    if (subCounty) {
        where.push(`COALESCE(NULLIF(TRIM(${alias}.location->>'subcounty'), ''), NULLIF(TRIM(${alias}.location->>'constituency'), ''), 'Unspecified') = $${idx++}`);
        params.push(String(subCounty));
    }
    if (ward) {
        where.push(`COALESCE(NULLIF(TRIM(${alias}.location->>'ward'), ''), 'Unspecified') = $${idx++}`);
        params.push(String(ward));
    }

    idx = await addProjectScopeWhere(req, where, params, alias, idx);
    return { where, params, nextIndex: idx || (params.length + 1), whereSql: where.join(' AND ') };
}

router.get('/county-operations/filter-options', async (req, res) => {
    try {
        if (getDBType() !== 'postgresql') {
            return res.status(501).json({ message: 'County operations reports currently require PostgreSQL project storage.' });
        }
        await ensureCountyOperationsReportTables();
        const scope = await buildCountyOperationsProjectWhere(req, 'p', 1);
        const result = await pool.query(
            `
            SELECT
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned')), NULL) AS departments,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned')), NULL) AS sections,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), 'Unknown')), NULL) AS statuses,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), NULLIF(TRIM(p.location->>'constituency'), ''), 'Unspecified')), NULL) AS "subCounties",
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unspecified')), NULL) AS wards,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(p.timeline->>'financial_year'), ''), ${fiscalYearExpr(projectOperationalDateExpr('p'))})), NULL) AS "financialYears"
            FROM projects p
            WHERE ${scope.whereSql}
            `,
            scope.params
        );
        const frequencies = await pool.query(
            `SELECT frequency_code AS "frequencyCode", frequency_name AS "frequencyName"
             FROM planning_reporting_frequencies
             WHERE COALESCE(voided, false) = false AND COALESCE(active, true) = true
             ORDER BY frequency_name`
        ).catch(() => ({ rows: [] }));
        const row = result.rows?.[0] || {};
        const sortText = (arr) => (Array.isArray(arr) ? arr.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))) : []);
        return res.json({
            departments: sortText(row.departments),
            sections: sortText(row.sections),
            statuses: sortText(row.statuses),
            subCounties: sortText(row.subCounties),
            wards: sortText(row.wards),
            financialYears: sortText(row.financialYears).reverse(),
            periods: [
                { code: '', name: 'All periods' },
                { code: 'Q1', name: 'Q1: Jul - Sep' },
                { code: 'Q2', name: 'Q2: Oct - Dec' },
                { code: 'Q3', name: 'Q3: Jan - Mar' },
                { code: 'Q4', name: 'Q4: Apr - Jun' },
                { code: 'H1', name: 'Half year: Jul - Dec' },
                { code: 'H2', name: 'Half year: Jan - Jun' },
                { code: 'ANNUAL', name: 'Annual: Jul - Jun' },
            ],
            reportingFrequencies: frequencies.rows || [],
        });
    } catch (error) {
        console.error('Error fetching county operations filter options:', error);
        return res.status(500).json({ message: 'Error fetching county operations filter options', error: error.message });
    }
});

router.get('/county-operations/summary', async (req, res) => {
    try {
        if (getDBType() !== 'postgresql') {
            return res.status(501).json({ message: 'County operations reports currently require PostgreSQL project storage.' });
        }
        await ensureCountyOperationsReportTables();
        const scope = await buildCountyOperationsProjectWhere(req, 'p', 1);
        const whereSql = scope.whereSql;
        const params = scope.params;
        const allocatedExpr = safeMoneyExpr('p.budget', 'allocated_amount_kes');
        const disbursedExpr = safeMoneyExpr('p.budget', 'disbursed_amount_kes');
        const contractedExpr = safeMoneyExpr('p.budget', 'contract_sum_kes');
        const progressExpr = safeProgressExpr('p');
        const dateExpr = projectOperationalDateExpr('p');
        const fyExpr = `COALESCE(NULLIF(TRIM(p.timeline->>'financial_year'), ''), ${fiscalYearExpr(dateExpr)})`;
        const fqExpr = fiscalQuarterExpr(dateExpr);

        const queries = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(DISTINCT p.project_id)::int AS "projectCount",
                    COUNT(DISTINCT COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned'))::int AS "departmentCount",
                    COUNT(DISTINCT COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned'))::int AS "sectionCount",
                    COALESCE(SUM(${allocatedExpr}), 0) AS "allocatedBudget",
                    COALESCE(SUM(${disbursedExpr}), 0) AS "disbursedBudget",
                    COALESCE(SUM(${contractedExpr}), 0) AS "contractedBudget",
                    COALESCE(AVG(${progressExpr}), 0) AS "averageProgress",
                    COUNT(*) FILTER (WHERE COALESCE(p.progress->>'status', '') ILIKE '%complete%')::int AS "completedProjects",
                    COUNT(*) FILTER (WHERE COALESCE(p.progress->>'status', '') ~* '(stalled|delay|suspend|cancel|terminat|risk)')::int AS "attentionProjects"
                FROM projects p
                WHERE ${whereSql}
            `, params),
            pool.query(`
                WITH scoped_projects AS (
                    SELECT
                        p.project_id,
                        COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
                        COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned') AS section,
                        ${allocatedExpr} AS allocated_budget,
                        ${disbursedExpr} AS disbursed_budget,
                        ${progressExpr} AS progress,
                        COALESCE(p.progress->>'status', '') AS status
                    FROM projects p
                    WHERE ${whereSql}
                ),
                project_rollup AS (
                    SELECT
                        department,
                        section,
                        COUNT(*)::int AS "projectCount",
                        COALESCE(SUM(allocated_budget), 0) AS "allocatedBudget",
                        COALESCE(SUM(disbursed_budget), 0) AS "disbursedBudget",
                        COALESCE(AVG(progress), 0) AS "averageProgress",
                        COUNT(*) FILTER (WHERE status ILIKE '%complete%')::int AS "completedProjects",
                        COUNT(*) FILTER (WHERE status ~* '(stalled|delay|suspend|cancel|terminat|risk)')::int AS "attentionProjects"
                    FROM scoped_projects
                    GROUP BY department, section
                ),
                activity_rollup AS (
                    SELECT sp.department, sp.section, COUNT(DISTINCT l.id)::int AS "linkedActivityCount"
                    FROM scoped_projects sp
                    INNER JOIN project_planning_activity_links l ON l.project_id = sp.project_id AND COALESCE(l.voided, false) = false
                    GROUP BY sp.department, sp.section
                ),
                evaluation_rollup AS (
                    SELECT
                        sp.department,
                        sp.section,
                        COUNT(DISTINCT e.id)::int AS "evaluationCount",
                        COALESCE(AVG(e.performance_score), 0) AS "averagePerformanceScore"
                    FROM scoped_projects sp
                    INNER JOIN project_evaluations e ON e.project_id = sp.project_id AND COALESCE(e.voided, false) = false
                    GROUP BY sp.department, sp.section
                )
                SELECT
                    pr.department,
                    pr.section,
                    pr."projectCount",
                    pr."allocatedBudget",
                    pr."disbursedBudget",
                    pr."averageProgress",
                    pr."completedProjects",
                    pr."attentionProjects",
                    COALESCE(ar."linkedActivityCount", 0) AS "linkedActivityCount",
                    COALESCE(er."evaluationCount", 0) AS "evaluationCount",
                    COALESCE(er."averagePerformanceScore", 0) AS "averagePerformanceScore"
                FROM project_rollup pr
                LEFT JOIN activity_rollup ar ON ar.department = pr.department AND ar.section = pr.section
                LEFT JOIN evaluation_rollup er ON er.department = pr.department AND er.section = pr.section
                ORDER BY pr."projectCount" DESC, pr.department, pr.section
                LIMIT 100
            `, params),
            pool.query(`
                SELECT
                    COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), NULLIF(TRIM(p.location->>'constituency'), ''), 'Unspecified') AS "subCounty",
                    COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unspecified') AS ward,
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
                    COUNT(DISTINCT p.project_id)::int AS "projectCount",
                    COALESCE(SUM(${allocatedExpr}), 0) AS "allocatedBudget",
                    COALESCE(SUM(${disbursedExpr}), 0) AS "disbursedBudget",
                    COALESCE(AVG(${progressExpr}), 0) AS "averageProgress",
                    COUNT(*) FILTER (WHERE COALESCE(p.progress->>'status', '') ~* '(stalled|delay|suspend|cancel|terminat|risk)')::int AS "attentionProjects"
                FROM projects p
                WHERE ${whereSql}
                GROUP BY 1, 2, 3
                ORDER BY "projectCount" DESC, "subCounty", ward, department
                LIMIT 200
            `, params),
            pool.query(`
                WITH scoped_projects AS (
                    SELECT
                        COALESCE(${fyExpr}, 'Unspecified') AS "financialYear",
                        COALESCE(${fqExpr}, 'Unspecified') AS period,
                        ${allocatedExpr} AS allocated_budget,
                        ${disbursedExpr} AS disbursed_budget,
                        ${progressExpr} AS progress,
                        COALESCE(p.progress->>'status', '') AS status
                    FROM projects p
                    WHERE ${whereSql}
                )
                SELECT
                    "financialYear",
                    period,
                    COUNT(*)::int AS "projectCount",
                    COALESCE(SUM(allocated_budget), 0) AS "allocatedBudget",
                    COALESCE(SUM(disbursed_budget), 0) AS "disbursedBudget",
                    COALESCE(AVG(progress), 0) AS "averageProgress",
                    COUNT(*) FILTER (WHERE status ILIKE '%complete%')::int AS "completedProjects",
                    COUNT(*) FILTER (WHERE status ~* '(stalled|delay|suspend|cancel|terminat|risk)')::int AS "attentionProjects"
                FROM scoped_projects
                GROUP BY "financialYear", period
                ORDER BY "financialYear" DESC,
                    CASE period WHEN 'Q1' THEN 1 WHEN 'Q2' THEN 2 WHEN 'Q3' THEN 3 WHEN 'Q4' THEN 4 ELSE 5 END
            `, params),
            pool.query(`
                WITH latest_monitoring AS (
                    SELECT DISTINCT ON (m.project_id, COALESCE(NULLIF(TRIM(m.activity_code), ''), NULLIF(TRIM(m.activity_name), '')))
                        m.project_id,
                        COALESCE(NULLIF(TRIM(m.activity_code), ''), NULLIF(TRIM(m.activity_name), '')) AS activity_key,
                        m.achieved_value,
                        m.observation_date,
                        m.warning_level
                    FROM project_monitoring_records m
                    WHERE COALESCE(m.voided, false) = false
                    ORDER BY m.project_id, activity_key, COALESCE(m.observation_date, m.created_at::date) DESC, m.record_id DESC
                ),
                latest_eval AS (
                    SELECT DISTINCT ON (e.project_id, COALESCE(NULLIF(TRIM(e.activity_code), ''), NULLIF(TRIM(e.activity_name), '')))
                        e.project_id,
                        COALESCE(NULLIF(TRIM(e.activity_code), ''), NULLIF(TRIM(e.activity_name), '')) AS activity_key,
                        e.achieved_value,
                        e.performance_score,
                        e.evaluation_date
                    FROM project_evaluations e
                    WHERE COALESCE(e.voided, false) = false
                    ORDER BY e.project_id, activity_key, COALESCE(e.evaluation_date, e.created_at::date) DESC, e.id DESC
                )
                SELECT
                    p.project_id AS "projectId",
                    p.name AS "projectName",
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
                    COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned') AS section,
                    ${fyExpr} AS "financialYear",
                    ${fqExpr} AS period,
                    a.activity_code AS "activityCode",
                    a.activity_name AS "activityName",
                    i.name AS "indicatorName",
                    mt.label AS "measurementType",
                    l.baseline_value AS "baselineValue",
                    l.target_value AS "targetValue",
                    COALESCE(le.achieved_value, lm.achieved_value) AS "achievedValue",
                    le.performance_score AS "performanceScore",
                    l.planned_start_date AS "plannedStartDate",
                    l.planned_end_date AS "plannedEndDate",
                    l.activity_status AS "activityStatus",
                    COALESCE(le.evaluation_date, lm.observation_date) AS "lastReportedAt",
                    lm.warning_level AS "warningLevel",
                    CASE
                        WHEN l.target_value IS NOT NULL AND l.target_value <> 0 AND COALESCE(le.achieved_value, lm.achieved_value) IS NOT NULL
                        THEN (COALESCE(le.achieved_value, lm.achieved_value) / l.target_value) * 100
                        ELSE NULL
                    END AS "achievementRate"
                FROM project_planning_activity_links l
                INNER JOIN projects p ON p.project_id = l.project_id
                INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id AND COALESCE(a.voided, false) = false
                INNER JOIN planning_indicators i ON i.id = a.indicator_id AND COALESCE(i.voided, false) = false
                LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND COALESCE(mt.voided, false) = false
                LEFT JOIN latest_monitoring lm ON lm.project_id = p.project_id
                    AND lm.activity_key = COALESCE(NULLIF(TRIM(a.activity_code), ''), NULLIF(TRIM(a.activity_name), ''))
                LEFT JOIN latest_eval le ON le.project_id = p.project_id
                    AND le.activity_key = COALESCE(NULLIF(TRIM(a.activity_code), ''), NULLIF(TRIM(a.activity_name), ''))
                WHERE COALESCE(l.voided, false) = false AND ${whereSql}
                ORDER BY department, section, "plannedEndDate" NULLS LAST, "activityName"
                LIMIT 500
            `, params),
            pool.query(`
                WITH latest_monitoring AS (
                    SELECT DISTINCT ON (m.project_id, COALESCE(NULLIF(TRIM(m.activity_code), ''), NULLIF(TRIM(m.activity_name), '')))
                        m.project_id,
                        COALESCE(NULLIF(TRIM(m.activity_code), ''), NULLIF(TRIM(m.activity_name), '')) AS activity_key,
                        m.achieved_value,
                        m.observation_date
                    FROM project_monitoring_records m
                    WHERE COALESCE(m.voided, false) = false
                    ORDER BY m.project_id, activity_key, COALESCE(m.observation_date, m.created_at::date) DESC, m.record_id DESC
                ),
                latest_eval AS (
                    SELECT DISTINCT ON (e.project_id, COALESCE(NULLIF(TRIM(e.activity_code), ''), NULLIF(TRIM(e.activity_name), '')))
                        e.project_id,
                        COALESCE(NULLIF(TRIM(e.activity_code), ''), NULLIF(TRIM(e.activity_name), '')) AS activity_key,
                        e.achieved_value,
                        e.performance_score,
                        e.evaluation_date
                    FROM project_evaluations e
                    WHERE COALESCE(e.voided, false) = false
                    ORDER BY e.project_id, activity_key, COALESCE(e.evaluation_date, e.created_at::date) DESC, e.id DESC
                ),
                indicator_rows AS (
                    SELECT
                        COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), NULLIF(TRIM(p.location->>'constituency'), ''), 'Unspecified') AS "subCounty",
                        COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unspecified') AS ward,
                        i.name AS "indicatorName",
                        COALESCE(mt.label, 'Unspecified') AS "measurementType",
                        p.project_id,
                        l.target_value,
                        COALESCE(le.achieved_value, lm.achieved_value) AS achieved_value,
                        le.performance_score
                    FROM project_planning_activity_links l
                    INNER JOIN projects p ON p.project_id = l.project_id
                    INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id AND COALESCE(a.voided, false) = false
                    INNER JOIN planning_indicators i ON i.id = a.indicator_id AND COALESCE(i.voided, false) = false
                    LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND COALESCE(mt.voided, false) = false
                    LEFT JOIN latest_monitoring lm ON lm.project_id = p.project_id
                        AND lm.activity_key = COALESCE(NULLIF(TRIM(a.activity_code), ''), NULLIF(TRIM(a.activity_name), ''))
                    LEFT JOIN latest_eval le ON le.project_id = p.project_id
                        AND le.activity_key = COALESCE(NULLIF(TRIM(a.activity_code), ''), NULLIF(TRIM(a.activity_name), ''))
                    WHERE COALESCE(l.voided, false) = false AND ${whereSql}
                )
                SELECT
                    "subCounty",
                    ward,
                    "indicatorName",
                    "measurementType",
                    COUNT(DISTINCT project_id)::int AS "projectCount",
                    COALESCE(SUM(target_value), 0) AS "targetValue",
                    COALESCE(SUM(achieved_value), 0) AS "achievedValue",
                    COALESCE(AVG(performance_score), 0) AS "averagePerformanceScore",
                    CASE
                        WHEN COALESCE(SUM(target_value), 0) > 0 THEN (COALESCE(SUM(achieved_value), 0) / SUM(target_value)) * 100
                        ELSE NULL
                    END AS "achievementRate"
                FROM indicator_rows
                GROUP BY "subCounty", ward, "indicatorName", "measurementType"
                ORDER BY "subCounty", ward, "indicatorName"
                LIMIT 500
            `, params),
            pool.query(`
                WITH latest_monitoring AS (
                    SELECT DISTINCT ON (m.project_id, COALESCE(NULLIF(TRIM(m.activity_code), ''), NULLIF(TRIM(m.activity_name), '')))
                        m.project_id,
                        COALESCE(NULLIF(TRIM(m.activity_code), ''), NULLIF(TRIM(m.activity_name), '')) AS activity_key,
                        m.achieved_value,
                        m.observation_date
                    FROM project_monitoring_records m
                    WHERE COALESCE(m.voided, false) = false
                    ORDER BY m.project_id, activity_key, COALESCE(m.observation_date, m.created_at::date) DESC, m.record_id DESC
                ),
                latest_eval AS (
                    SELECT DISTINCT ON (e.project_id, COALESCE(NULLIF(TRIM(e.activity_code), ''), NULLIF(TRIM(e.activity_name), '')))
                        e.project_id,
                        COALESCE(NULLIF(TRIM(e.activity_code), ''), NULLIF(TRIM(e.activity_name), '')) AS activity_key,
                        e.achieved_value,
                        e.performance_score,
                        e.evaluation_date
                    FROM project_evaluations e
                    WHERE COALESCE(e.voided, false) = false
                    ORDER BY e.project_id, activity_key, COALESCE(e.evaluation_date, e.created_at::date) DESC, e.id DESC
                ),
                indicator_rows AS (
                    SELECT
                        COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
                        COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unspecified') AS ward,
                        i.name AS "indicatorName",
                        COALESCE(mt.label, 'Unspecified') AS "measurementType",
                        p.project_id,
                        l.target_value,
                        COALESCE(le.achieved_value, lm.achieved_value) AS achieved_value,
                        le.performance_score
                    FROM project_planning_activity_links l
                    INNER JOIN projects p ON p.project_id = l.project_id
                    INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id AND COALESCE(a.voided, false) = false
                    INNER JOIN planning_indicators i ON i.id = a.indicator_id AND COALESCE(i.voided, false) = false
                    LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND COALESCE(mt.voided, false) = false
                    LEFT JOIN latest_monitoring lm ON lm.project_id = p.project_id
                        AND lm.activity_key = COALESCE(NULLIF(TRIM(a.activity_code), ''), NULLIF(TRIM(a.activity_name), ''))
                    LEFT JOIN latest_eval le ON le.project_id = p.project_id
                        AND le.activity_key = COALESCE(NULLIF(TRIM(a.activity_code), ''), NULLIF(TRIM(a.activity_name), ''))
                    WHERE COALESCE(l.voided, false) = false AND ${whereSql}
                )
                SELECT
                    department,
                    ward,
                    "indicatorName",
                    "measurementType",
                    COUNT(DISTINCT project_id)::int AS "projectCount",
                    COALESCE(SUM(target_value), 0) AS "targetValue",
                    COALESCE(SUM(achieved_value), 0) AS "achievedValue",
                    COALESCE(AVG(performance_score), 0) AS "averagePerformanceScore",
                    CASE
                        WHEN COALESCE(SUM(target_value), 0) > 0 THEN (COALESCE(SUM(achieved_value), 0) / SUM(target_value)) * 100
                        ELSE NULL
                    END AS "achievementRate"
                FROM indicator_rows
                GROUP BY department, ward, "indicatorName", "measurementType"
                ORDER BY department, ward, "indicatorName"
                LIMIT 500
            `, params),
            pool.query(`
                SELECT
                    e.id,
                    e.project_id AS "projectId",
                    p.name AS "projectName",
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
                    COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned') AS section,
                    COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), NULLIF(TRIM(p.location->>'constituency'), ''), 'Unspecified') AS "subCounty",
                    COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unspecified') AS ward,
                    ${fyExpr} AS "financialYear",
                    e.evaluation_date AS "evaluationDate",
                    e.activity_code AS "activityCode",
                    e.activity_name AS "activityName",
                    e.indicator_name AS "indicatorName",
                    e.baseline_value AS "baselineValue",
                    e.milestone_value AS "targetValue",
                    e.achieved_value AS "achievedValue",
                    e.performance_score AS "performanceScore"
                FROM project_evaluations e
                INNER JOIN projects p ON p.project_id = e.project_id
                WHERE COALESCE(e.voided, false) = false AND ${whereSql}
                ORDER BY "subCounty", ward, e.evaluation_date DESC NULLS LAST, e.updated_at DESC NULLS LAST
                LIMIT 300
            `, params),
            pool.query(`
                SELECT
                    p.project_id AS "projectId",
                    p.name AS "projectName",
                    COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
                    COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned') AS section,
                    COALESCE(p.progress->>'status', 'Unknown') AS status,
                    ${progressExpr} AS progress,
                    ${allocatedExpr} AS "allocatedBudget",
                    ${disbursedExpr} AS "disbursedBudget",
                    CASE WHEN ${allocatedExpr} > 0 THEN (${disbursedExpr} / ${allocatedExpr}) * 100 ELSE 0 END AS "absorptionRate",
                    NULLIF(p.progress->>'status_reason', '') AS "statusReason",
                    NULLIF(p.progress->>'latest_update_summary', '') AS "latestUpdateSummary"
                FROM projects p
                WHERE ${whereSql}
                  AND (
                    COALESCE(p.progress->>'status', '') ~* '(stalled|delay|suspend|cancel|terminat|risk)'
                    OR (${allocatedExpr} > 0 AND (${disbursedExpr} / NULLIF(${allocatedExpr}, 0)) < 0.25 AND ${progressExpr} < 50)
                  )
                ORDER BY progress ASC, "allocatedBudget" DESC
                LIMIT 50
            `, params),
        ]);

        const summary = queries[0].rows?.[0] || {};
        return res.json({
            filters: req.query || {},
            generatedAt: new Date().toISOString(),
            summary: {
                ...summary,
                absorptionRate: Number(summary.allocatedBudget || 0) > 0
                    ? (Number(summary.disbursedBudget || 0) / Number(summary.allocatedBudget || 0)) * 100
                    : 0,
            },
            departmentRows: queries[1].rows || [],
            regionalRows: queries[2].rows || [],
            periodRows: queries[3].rows || [],
            activityRows: queries[4].rows || [],
            indicatorRegionRows: queries[5].rows || [],
            indicatorDepartmentWardRows: queries[6].rows || [],
            evaluationRows: queries[7].rows || [],
            attentionRows: queries[8].rows || [],
        });
    } catch (error) {
        console.error('Error fetching county operations report:', error);
        return res.status(500).json({ message: 'Error fetching county operations report', error: error.message });
    }
});

module.exports = router;