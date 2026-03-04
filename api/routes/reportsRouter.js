const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Adjust the path as needed
const { addStatusFilter } = require('../utils/statusFilterHelper');

// Helper function to get DB type
const getDBType = () => process.env.DB_TYPE || 'mysql';

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
        return `${prefix}.ministry`; // In PostgreSQL, department is stored as ministry text
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
                whereConditions.push(`p.ministry = ${placeholder}${placeholderIndex}`);
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
                whereConditions.push(`p.state_department = ${placeholder}${placeholderIndex}`);
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

        let sqlQuery = `
            SELECT
                ${DB_TYPE === 'postgresql' ? 'COALESCE(p.ministry, \'Unassigned\')' : 'd.name'} AS "departmentName",
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
                    COALESCE(p.ministry, 'Unassigned')
                ORDER BY
                    COALESCE(p.ministry, 'Unassigned');
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
                whereConditions.push(`p.ministry = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.departmentId = ${placeholder}`);
            }
            queryParams.push(departmentId);
            placeholderIndex++;
        }
        // Location filters will require joins, similar to the main projects API
        // For simplicity, we'll assume a direct lookup for now
        // A more robust solution would involve conditional joins here
        
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
                // In PostgreSQL, department is stored as ministry text
                whereConditions.push(`p.ministry = $${queryParams.length + 1}`);
                queryParams.push(departmentId);
            }

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
                whereConditions.push(`p.ministry = ${placeholder}${placeholderIndex}`);
            } else {
                whereConditions.push(`p.departmentId = ${placeholder}`);
            }
            queryParams.push(departmentId);
            placeholderIndex++;
        }
        // Location filters can be added here with appropriate joins
        // For example, if (countyId) { whereConditions.push('c.countyId = ?'); queryParams.push(countyId); }

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
                const result = await pool.query(`
                    SELECT MIN(EXTRACT(YEAR FROM (p.timeline->>'start_date')::date)) as "earliestYear"
                    FROM projects p
                    WHERE p.voided = false AND (p.timeline->>'start_date') IS NOT NULL
                `);
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
                WHERE p.voided = false 
                    AND (p.timeline->>'start_date') IS NOT NULL
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) >= $1
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) <= $2
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date)
                ORDER BY year
            `, [actualStartYear, actualEndYear]);
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
                WHERE p.voided = false 
                    AND (p.timeline->>'start_date') IS NOT NULL
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) >= $1
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) <= $2
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date)
                ORDER BY year
            `, [actualStartYear, actualEndYear]);
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
                    p.ministry as "departmentName",
                    NULL as "departmentAlias",
                    COUNT(p.project_id) as "projectCount",
                    SUM((${getCostField()})) as "departmentBudget",
                    SUM((${getPaidField()})) as "departmentExpenditure"
                FROM projects p
                WHERE p.voided = false 
                    AND (p.timeline->>'start_date') IS NOT NULL
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) >= $1
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) <= $2
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date), p.ministry
                ORDER BY year, p.ministry
            `, [actualStartYear, actualEndYear]);
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
                WHERE p.voided = false 
                    AND (p.timeline->>'start_date') IS NOT NULL
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) >= $1
                    AND EXTRACT(YEAR FROM (p.timeline->>'start_date')::date) <= $2
                    AND ${getStatusField()} IS NOT NULL
                GROUP BY EXTRACT(YEAR FROM (p.timeline->>'start_date')::date), ${getStatusField()}
                ORDER BY year, ${getStatusField()}
            `, [actualStartYear, actualEndYear]);
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

/**
 * @route GET /api/reports/absorption-report
 * @description Get absorption report data grouped by department with financial metrics
 * @access Public (for now)
 * @returns {Object} Object containing absorption report data and summary totals
 */
router.get('/absorption-report', async (req, res) => {
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

        // Main query to get department-level absorption data
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
                
                -- Budget and financial data
                COALESCE(SUM(p.costOfProject), 0) AS budget,
                COALESCE(SUM(p.costOfProject), 0) AS contractSum,
                COALESCE(SUM(p.paidOut), 0) AS paidAmount,
                
                -- Calculate absorption percentage
                CASE 
                    WHEN SUM(p.costOfProject) > 0 THEN 
                        ROUND((SUM(p.paidOut) * 100.0 / SUM(p.costOfProject)), 2)
                    ELSE 0 
                END AS absorptionPercentage
                
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
                COALESCE(SUM(p.costOfProject), 0) AS totalBudget,
                COALESCE(SUM(p.costOfProject), 0) AS totalContractSum,
                COALESCE(SUM(p.paidOut), 0) AS totalPaidAmount,
                CASE 
                    WHEN SUM(p.costOfProject) > 0 THEN 
                        ROUND((SUM(p.paidOut) * 100.0 / SUM(p.costOfProject)), 1)
                    ELSE 0 
                END AS absorbedPercentage
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
            budget: parseFloat(row.budget) || 0,
            contractSum: parseFloat(row.contractSum) || 0,
            paidAmount: parseFloat(row.paidAmount) || 0,
            absorptionPercentage: parseFloat(row.absorptionPercentage) || 0
        }));

        res.status(200).json({
            data: transformedData,
            summary: {
                count: summary.totalCount || 0,
                averageCompletion: parseFloat(summary.averageCompletion) || 0,
                totalBudget: parseFloat(summary.totalBudget) || 0,
                totalContractSum: parseFloat(summary.totalContractSum) || 0,
                totalPaidAmount: parseFloat(summary.totalPaidAmount) || 0,
                absorbedPercentage: parseFloat(summary.absorbedPercentage) || 0
            }
        });

    } catch (error) {
        console.error('Error fetching absorption report:', error);
        res.status(500).json({
            message: 'Error fetching absorption report',
            error: error.message
        });
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

module.exports = router;