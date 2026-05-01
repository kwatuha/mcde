const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * PUBLIC DASHBOARD API ROUTES
 * These endpoints are accessible without authentication
 * Designed for public-facing dashboards similar to Makueni PMTS
 */

// ==================== STATUS MATCHING HELPERS ====================

/**
 * Normalize status for matching (case-insensitive, handle variations)
 * @param {string} status - The status to normalize
 * @returns {string} - Normalized status string
 */
const normalizeStatusForMatching = (status) => {
    if (!status || typeof status !== 'string') return '';
    // Convert to lowercase and trim
    const normalized = status.toLowerCase().trim();
    
    // "to be initiated and completed" -> return a value that won't match any main category (so it goes to "Other")
    if (normalized.includes('to be initiated') && normalized.includes('completed')) {
        return 'to be initiated and completed'; // This won't match any main category
    }
    
    // Handle variations
    // "completed", "complete", or "done" -> "completed"
    if (normalized.includes('completed') || normalized === 'complete' || normalized === 'done') {
        return 'completed';
    }
    // "on-going", "ongoing", "on going", "in progress", "inprogress", "initiated" -> "ongoing"
    // Note: "initiated" means the project has started, so it's "ongoing"
    // But "to be initiated" means not started yet
    if (normalized.includes('ongoing') || 
        normalized.includes('on-going') || 
        normalized.includes('on going') ||
        normalized.includes('in progress') ||
        normalized === 'inprogress' ||
        normalized.includes('inprogress') ||
        (normalized.includes('initiated') && !normalized.includes('to be initiated') && !normalized.includes('to be'))) {
        return 'ongoing';
    }
    // "procurement" or "under procurement" -> "under procurement"
    if (normalized.includes('procurement') || normalized.includes('under procurement')) {
        return 'under procurement';
    }
    // "not started", "notstarted", "not-started" -> "not started"
    if (normalized.includes('not started') || normalized.includes('notstarted') || normalized.includes('not-started')) {
        return 'not started';
    }
    // "to be initiated" -> "not started"
    if ((normalized.includes('to be initiated') || (normalized.includes('to be') && normalized.includes('initiated'))) && 
        !normalized.includes('completed')) {
        return 'not started';
    }
    // "to be" (without initiated) -> "not started"
    if (normalized.includes('to be') && !normalized.includes('completed') && !normalized.includes('initiated')) {
        return 'not started';
    }
    // "stalled" -> "stalled"
    if (normalized.includes('stalled')) {
        return 'stalled';
    }
    // "suspended" -> "suspended"
    if (normalized.includes('suspended')) {
        return 'suspended';
    }
    
    return normalized;
};

/**
 * Check if a status matches a category (case-insensitive, handles variations)
 * @param {string} status - The project status
 * @param {string} category - The category to match against ('Completed', 'Ongoing', 'Stalled', 'Not Started', 'Under Procurement', 'Suspended')
 * @returns {boolean}
 */
const matchesStatusCategory = (status, category) => {
    const normalizedStatus = normalizeStatusForMatching(status);
    const normalizedCategory = normalizeStatusForMatching(category);
    return normalizedStatus === normalizedCategory;
};

/**
 * Check if a status belongs to one of the main categories
 * @param {string} status - The project status
 * @returns {boolean}
 */
const isMainCategoryStatus = (status) => {
    const categories = ['Completed', 'Ongoing', 'Stalled', 'Not Started', 'Under Procurement', 'Suspended'];
    return categories.some(cat => matchesStatusCategory(status, cat));
};

function isPostgresDb() {
    return (process.env.DB_TYPE || 'mysql') === 'postgresql';
}

/**
 * WHERE fragments for approved public projects (PostgreSQL JSONB `projects` table).
 * Supports the same query keys used by the citizen dashboard and gallery.
 */
async function buildPgPublicProjectWhereParts(q) {
    const parts = [
        'p.voided = false',
        `LOWER(COALESCE(p.is_public->>'approved', 'false')) = 'true'`
    ];
    const params = [];
    let n = 1;

    const search = q.search ? String(q.search).trim() : '';
    if (search) {
        parts.push(`(COALESCE(p.name, '') ILIKE $${n} OR COALESCE(p.description, '') ILIKE $${n + 1})`);
        params.push(`%${search}%`, `%${search}%`);
        n += 2;
    }

    const finYearId = q.finYearId != null && String(q.finYearId).trim() !== '' ? String(q.finYearId).trim() : '';
    if (finYearId) {
        parts.push(`(
            (p.timeline->>'financial_year') = (SELECT "finYearName"::text FROM financialyears WHERE "finYearId" = $${n}::int LIMIT 1)
            OR (p.timeline->>'financial_year')::text = $${n}::text
        )`);
        params.push(finYearId);
        n++;
    }

    const rawDept = q.departmentId != null && String(q.departmentId).trim() !== '' ? String(q.departmentId).trim() : '';
    if (rawDept) {
        let deptPattern = rawDept;
        if (/^\d+$/.test(rawDept)) {
            try {
                const dr = await pool.query('SELECT name FROM departments WHERE "departmentId" = $1 LIMIT 1', [parseInt(rawDept, 10)]);
                if (dr.rows?.[0]?.name) {
                    deptPattern = dr.rows[0].name;
                }
            } catch (e) {
                /* ignore */
            }
        }
        parts.push(`COALESCE(p.ministry, '') ILIKE $${n++}`);
        params.push(`%${deptPattern}%`);
    } else if (q.department != null && String(q.department).trim() !== '') {
        parts.push(`COALESCE(p.ministry, '') ILIKE $${n++}`);
        params.push(`%${String(q.department).trim()}%`);
    } else if (q.ministry != null && String(q.ministry).trim() !== '') {
        parts.push(`COALESCE(p.ministry, '') ILIKE $${n++}`);
        params.push(`%${String(q.ministry).trim()}%`);
    }

    if (q.stateDepartment != null && String(q.stateDepartment).trim() !== '') {
        parts.push(`COALESCE(p.state_department, '') ILIKE $${n++}`);
        params.push(`%${String(q.stateDepartment).trim()}%`);
    }

    const rawSub = [q.subcountyId, q.subCountyId].find((v) => v != null && String(v).trim() !== '');
    const rawSubTrimmed = rawSub != null ? String(rawSub).trim() : '';
    if (rawSubTrimmed) {
        parts.push(`(
            COALESCE(p.location->>'constituency', '') ILIKE $${n}
            OR COALESCE(p.location->>'county', '') ILIKE $${n}
        )`);
        params.push(`%${rawSubTrimmed}%`);
        n++;
    }

    const rawWard = q.wardId != null && String(q.wardId).trim() !== '' ? String(q.wardId).trim() : '';
    if (rawWard) {
        parts.push(`COALESCE(p.location->>'ward', '') ILIKE $${n++}`);
        params.push(`%${rawWard}%`);
    }

    return { parts, params };
}

async function queryPgPublicProjectsForStats(q) {
    const { parts, params } = await buildPgPublicProjectWhereParts(q);
    const whereClause = parts.join(' AND ');
    const sql = `
        SELECT
            p.project_id AS id,
            COALESCE(p.progress->>'status', '') AS status,
            CASE
                WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (p.budget->>'allocated_amount_kes')::numeric
                ELSE 0
            END AS "costOfProject",
            COALESCE(NULLIF(TRIM(p.ministry), ''), 'Unassigned') AS ministry_key,
            COALESCE(
                NULLIF(TRIM(p.location->>'constituency'), ''),
                NULLIF(TRIM(p.location->>'county'), ''),
                'Unassigned'
            ) AS subcounty_key,
            COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unassigned') AS ward_key
        FROM projects p
        WHERE ${whereClause}
    `;
    const result = await pool.query(sql, params);
    return result.rows || [];
}

function aggregateOverviewFromPgRows(rows, statusFilter) {
    let filteredProjects = rows;
    if (statusFilter) {
        filteredProjects = rows.filter((project) =>
            matchesStatusCategory(project.status || '', String(statusFilter))
        );
    }
    let completed_projects = 0;
    let completed_budget = 0;
    let ongoing_projects = 0;
    let ongoing_budget = 0;
    let not_started_projects = 0;
    let not_started_budget = 0;
    let under_procurement_projects = 0;
    let under_procurement_budget = 0;
    let stalled_projects = 0;
    let stalled_budget = 0;
    let suspended_projects = 0;
    let suspended_budget = 0;
    let other_projects = 0;
    let other_budget = 0;
    let total_budget = 0;

    filteredProjects.forEach((project) => {
        const st = project.status || '';
        const budget = parseFloat(project.costOfProject) || 0;
        total_budget += budget;

        if (matchesStatusCategory(st, 'Completed')) {
            completed_projects++;
            completed_budget += budget;
        } else if (matchesStatusCategory(st, 'Ongoing')) {
            ongoing_projects++;
            ongoing_budget += budget;
        } else if (matchesStatusCategory(st, 'Not Started')) {
            not_started_projects++;
            not_started_budget += budget;
        } else if (matchesStatusCategory(st, 'Under Procurement')) {
            under_procurement_projects++;
            under_procurement_budget += budget;
        } else if (matchesStatusCategory(st, 'Stalled')) {
            stalled_projects++;
            stalled_budget += budget;
        } else if (matchesStatusCategory(st, 'Suspended')) {
            suspended_projects++;
            suspended_budget += budget;
        } else {
            other_projects++;
            other_budget += budget;
        }
    });

    return {
        total_projects: filteredProjects.length,
        total_budget,
        completed_projects,
        completed_budget,
        ongoing_projects,
        ongoing_budget,
        not_started_projects,
        not_started_budget,
        under_procurement_projects,
        under_procurement_budget,
        stalled_projects,
        stalled_budget,
        suspended_projects,
        suspended_budget,
        other_projects,
        other_budget
    };
}

// ==================== QUICK STATS ====================

/**
 * @route GET /api/public/stats/overview
 * @description Get overall project statistics (total projects, budget, status breakdown)
 * @access Public
 */
router.get('/stats/overview', async (req, res) => {
    try {
        if (isPostgresDb()) {
            const rows = await queryPgPublicProjectsForStats(req.query);
            return res.json(aggregateOverviewFromPgRows(rows, req.query.status));
        }

        const { finYearId, departmentId, subcountyId, wardId, status, search } = req.query;
        
        let whereConditions = ['p.voided = 0', 'p.approved_for_public = 1'];
        const queryParams = [];
        
        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }

        if (subcountyId) {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM project_subcounties psc 
                WHERE psc.projectId = p.project_id 
                AND psc.subcountyId = ? 
                AND psc.voided = 0
            )`);
            queryParams.push(subcountyId);
        }

        if (wardId) {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM project_wards pw 
                WHERE pw.projectId = p.project_id 
                AND pw.wardId = ? 
                AND pw.voided = 0
            )`);
            queryParams.push(wardId);
        }

        if (search) {
            whereConditions.push('p.projectName LIKE ?');
            queryParams.push(`%${search}%`);
        }

        const whereClause = whereConditions.join(' AND ');

        // First, get all projects with their statuses to categorize them properly
        const projectsQuery = `
            SELECT 
                p.project_id AS id,
                p.status,
                p.costOfProject
            FROM projects p
            WHERE ${whereClause}
        `;
        
        const [projects] = await pool.query(projectsQuery, queryParams);
        
        // Filter by status if provided (after fetching, since we need to use the helper function)
        let filteredProjects = projects;
        if (status) {
            filteredProjects = projects.filter(project => 
                matchesStatusCategory(project.status || '', status)
            );
        }
        
        // Categorize projects using the helper functions
        let completed_projects = 0;
        let completed_budget = 0;
        let ongoing_projects = 0;
        let ongoing_budget = 0;
        let not_started_projects = 0;
        let not_started_budget = 0;
        let under_procurement_projects = 0;
        let under_procurement_budget = 0;
        let stalled_projects = 0;
        let stalled_budget = 0;
        let suspended_projects = 0;
        let suspended_budget = 0;
        let other_projects = 0;
        let other_budget = 0;
        let total_budget = 0;
        
        filteredProjects.forEach(project => {
            const status = project.status || '';
            const budget = parseFloat(project.costOfProject) || 0;
            total_budget += budget;
            
            if (matchesStatusCategory(status, 'Completed')) {
                completed_projects++;
                completed_budget += budget;
            } else if (matchesStatusCategory(status, 'Ongoing')) {
                ongoing_projects++;
                ongoing_budget += budget;
            } else if (matchesStatusCategory(status, 'Not Started')) {
                not_started_projects++;
                not_started_budget += budget;
            } else if (matchesStatusCategory(status, 'Under Procurement')) {
                under_procurement_projects++;
                under_procurement_budget += budget;
            } else if (matchesStatusCategory(status, 'Stalled')) {
                stalled_projects++;
                stalled_budget += budget;
            } else if (matchesStatusCategory(status, 'Suspended')) {
                suspended_projects++;
                suspended_budget += budget;
            } else {
                // Other category - any status that doesn't match the main categories
                other_projects++;
                other_budget += budget;
            }
        });
        
        const results = {
            total_projects: filteredProjects.length,
            total_budget: total_budget,
            completed_projects: completed_projects,
            completed_budget: completed_budget,
            ongoing_projects: ongoing_projects,
            ongoing_budget: ongoing_budget,
            not_started_projects: not_started_projects,
            not_started_budget: not_started_budget,
            under_procurement_projects: under_procurement_projects,
            under_procurement_budget: under_procurement_budget,
            stalled_projects: stalled_projects,
            stalled_budget: stalled_budget,
            suspended_projects: suspended_projects,
            suspended_budget: suspended_budget,
            other_projects: other_projects,
            other_budget: other_budget
        };
        
        res.json(results);
    } catch (error) {
        console.error('Error fetching overview stats:', error);
        // Fail-soft for public dashboard: schema can vary across county databases.
        // Return an empty stats payload instead of a hard error so the page still loads.
        res.json({
            total_projects: 0,
            total_budget: 0,
            completed_projects: 0,
            completed_budget: 0,
            ongoing_projects: 0,
            ongoing_budget: 0,
            not_started_projects: 0,
            not_started_budget: 0,
            under_procurement_projects: 0,
            under_procurement_budget: 0,
            stalled_projects: 0,
            stalled_budget: 0,
            suspended_projects: 0,
            suspended_budget: 0,
            other_projects: 0,
            other_budget: 0,
            warning: 'Overview statistics are unavailable for this database schema'
        });
    }
});

// ==================== FINANCIAL YEARS ====================

/**
 * @route GET /api/public/financial-years
 * @description Get list of all financial years with project counts
 * @access Public
 */
router.get('/financial-years', async (req, res) => {
    try {
        const query = `
            SELECT 
                fy.finYearId as id,
                fy.finYearName as name,
                fy.startDate,
                fy.endDate,
                COUNT(p.id) as project_count,
                COALESCE(SUM(p.costOfProject), 0) as total_budget
            FROM financialyears fy
            LEFT JOIN projects p ON fy.finYearId = p.finYearId AND p.voided = 0
            WHERE (fy.voided IS NULL OR fy.voided = 0)
            GROUP BY fy.finYearId, fy.finYearName, fy.startDate, fy.endDate
            HAVING COUNT(p.id) > 0
            ORDER BY fy.startDate DESC
        `;

        const [results] = await pool.query(query);
        res.json(results);
    } catch (error) {
        console.error('Error fetching financial years:', error);
        res.json([]);
    }
});

// ==================== PROJECTS ====================

/**
 * @route GET /api/public/projects
 * @description Get list of projects with filtering (for project gallery)
 * @access Public
 */
router.get('/projects', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const { 
            finYearId, 
            status, 
            department,
            departmentId,
            subCountyId,
            wardId,
            projectType,
            page = 1, 
            limit = 20,
            search
        } = req.query;

        // PostgreSQL public projects use JSONB-backed schema (project_id, progress, is_public, etc.)
        // Handle this path separately so citizen portal works with the current database.
        if (DB_TYPE === 'postgresql') {
            const numericPage = Math.max(parseInt(page, 10) || 1, 1);
            const numericLimit = Math.max(parseInt(limit, 10) || 20, 1);
            const offset = (numericPage - 1) * numericLimit;
            const { parts: whereParts, params } = await buildPgPublicProjectWhereParts(req.query);
            let i = params.length + 1;

            if (status) {
                whereParts.push(`COALESCE(p.progress->>'status', '') ILIKE $${i++}`);
                params.push(`%${String(status).trim()}%`);
            }
            if (projectType) {
                whereParts.push(`COALESCE(p.sector, '') ILIKE $${i++}`);
                params.push(`%${String(projectType).trim()}%`);
            }

            const whereClause = whereParts.join(' AND ');
            const countResult = await pool.query(`SELECT COUNT(*)::integer AS total FROM projects p WHERE ${whereClause}`, params);
            const totalProjects = Number(countResult.rows?.[0]?.total || 0);

            const dataQuery = `
                SELECT
                    p.project_id AS id,
                    p.name AS project_name,
                    p.description AS description,
                    CASE
                        WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+)?$'
                        THEN (p.budget->>'allocated_amount_kes')::numeric
                        ELSE NULL
                    END AS budget,
                    p.progress->>'status' AS status,
                    (p.timeline->>'start_date')::date AS start_date,
                    (p.timeline->>'expected_completion_date')::date AS end_date,
                    CASE
                        WHEN (p.progress->>'percentage_complete') ~ '^[0-9]+(\\.[0-9]+)?$'
                        THEN (p.progress->>'percentage_complete')::numeric
                        ELSE NULL
                    END AS "completionPercentage",
                    p.created_at AS "createdAt",
                    p.ministry AS department_name,
                    p.sector AS "projectType",
                    p.location->>'subcounty' AS subcounty_name,
                    p.location->>'ward' AS ward_name,
                    NULL::text AS thumbnail
                FROM projects p
                WHERE ${whereClause}
                ORDER BY p.created_at DESC
                LIMIT $${i++} OFFSET $${i++}
            `;
            const dataParams = [...params, numericLimit, offset];
            const result = await pool.query(dataQuery, dataParams);

            return res.json({
                projects: result.rows || [],
                pagination: {
                    total: totalProjects,
                    page: numericPage,
                    limit: numericLimit,
                    totalPages: Math.ceil(totalProjects / numericLimit)
                }
            });
        }

        let whereConditions = ['p.voided = 0', 'p.approved_for_public = 1'];
        const queryParams = [];

        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }

        let needsPostFiltering = false;
        if (status) {
            // Special handling for phased projects
            if (status === 'Phase') {
                whereConditions.push('LOWER(p.status) LIKE ?');
                queryParams.push('%phase%');
            } else if (status === 'Other') {
                // Other category: projects that don't match any main category
                // Exclude projects that match main categories (including Suspended)
                // But include "To Be Initiated And Completed" even though it contains "completed"
                whereConditions.push(`(
                    ((LOWER(p.status) NOT LIKE '%completed%') OR (LOWER(p.status) LIKE '%to be initiated%' AND LOWER(p.status) LIKE '%completed%')) AND
                    (LOWER(p.status) NOT LIKE '%ongoing%' AND LOWER(p.status) NOT LIKE '%on-going%' AND LOWER(p.status) NOT LIKE '%on going%' AND LOWER(p.status) NOT LIKE '%in progress%' AND LOWER(p.status) NOT LIKE '%inprogress%' AND (LOWER(p.status) NOT LIKE '%initiated%' OR LOWER(p.status) LIKE '%to be initiated%')) AND
                    (LOWER(p.status) NOT LIKE '%procurement%' AND LOWER(p.status) NOT LIKE '%under procurement%') AND
                    (LOWER(p.status) NOT LIKE '%not started%' AND LOWER(p.status) NOT LIKE '%notstarted%' AND LOWER(p.status) NOT LIKE '%not-started%') AND
                    (LOWER(p.status) NOT LIKE '%stalled%') AND
                    (LOWER(p.status) NOT LIKE '%suspended%') AND
                    p.status IS NOT NULL AND p.status != ''
                )`);
                needsPostFiltering = true; // We'll do additional filtering in JavaScript for exact matching
            } else if (status === 'Suspended') {
                whereConditions.push('LOWER(p.status) LIKE ?');
                queryParams.push('%suspended%');
            } else {
                // Use normalized matching for main categories
                const statusLower = status.toLowerCase();
                if (statusLower.includes('ongoing') || statusLower.includes('on-going') || statusLower.includes('in progress') || statusLower.includes('inprogress') || statusLower.includes('initiated')) {
                    // Include "initiated" but exclude "to be initiated"
                    whereConditions.push(`(
                        (LOWER(p.status) LIKE ? OR LOWER(p.status) LIKE ? OR LOWER(p.status) LIKE ? OR LOWER(p.status) LIKE ? OR LOWER(p.status) LIKE ?) OR
                        (LOWER(p.status) LIKE ? AND LOWER(p.status) NOT LIKE ? AND LOWER(p.status) NOT LIKE ?)
                    )`);
                    queryParams.push('%ongoing%', '%on-going%', '%on going%', '%in progress%', '%inprogress%', '%initiated%', '%to be initiated%', '%to be%');
                } else if (statusLower.includes('procurement')) {
                    whereConditions.push('(LOWER(p.status) LIKE ? OR LOWER(p.status) LIKE ?)');
                    queryParams.push('%procurement%', '%under procurement%');
                } else if (statusLower.includes('not started') || statusLower.includes('notstarted')) {
                    whereConditions.push('(LOWER(p.status) LIKE ? OR LOWER(p.status) LIKE ? OR LOWER(p.status) LIKE ?)');
                    queryParams.push('%not started%', '%notstarted%', '%not-started%');
                } else if (statusLower.includes('completed')) {
                    whereConditions.push('LOWER(p.status) LIKE ?');
                    queryParams.push('%completed%');
            } else if (statusLower.includes('stalled')) {
                whereConditions.push('LOWER(p.status) LIKE ?');
                queryParams.push('%stalled%');
            } else if (statusLower.includes('suspended')) {
                whereConditions.push('LOWER(p.status) LIKE ?');
                queryParams.push('%suspended%');
            } else {
                // Fallback to exact match
                whereConditions.push('p.status = ?');
                queryParams.push(status);
            }
            }
        }

        if (department) {
            whereConditions.push('d.name = ?');
            queryParams.push(department);
        }

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }

        if (subCountyId) {
            whereConditions.push('psc.subcountyId = ?');
            queryParams.push(subCountyId);
        }

        if (wardId) {
            whereConditions.push('pw.wardId = ?');
            queryParams.push(wardId);
        }

        if (projectType) {
            whereConditions.push('pc.categoryName = ?');
            queryParams.push(projectType);
        }

        if (search) {
            whereConditions.push('(p.projectName LIKE ? OR p.projectDescription LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;

        // Get total count
        const countQuery = `
            SELECT COUNT(DISTINCT p.id) as total
            FROM projects p
            LEFT JOIN departments d ON p.departmentId = d.departmentId
            LEFT JOIN categories pc ON p.categoryId = pc.categoryId
            LEFT JOIN project_subcounties psc ON p.id = psc.projectId AND psc.voided = 0
            LEFT JOIN project_wards pw ON p.id = pw.projectId AND pw.voided = 0
            WHERE ${whereClause}
        `;

        const [countResult] = await pool.query(countQuery, queryParams);
        let totalProjects = countResult[0].total;

        // Get paginated projects with geographic info
        const projectsQuery = `
            SELECT DISTINCT
                p.id,
                p.projectName as project_name,
                p.projectDescription as description,
                p.costOfProject as budget,
                p.status,
                p.startDate as start_date,
                p.endDate as end_date,
                p.overallProgress as completionPercentage,
                p.createdAt,
                d.name as department_name,
                pc.categoryName as projectType,
                fy.finYearName as financialYear,
                (SELECT GROUP_CONCAT(DISTINCT sc.name SEPARATOR ', ')
                 FROM project_subcounties psc2
                 JOIN subcounties sc ON psc2.subcountyId = sc.subcountyId
                 WHERE psc2.projectId = p.id AND psc2.voided = 0) as subcounty_name,
                (SELECT GROUP_CONCAT(DISTINCT w.name SEPARATOR ', ')
                 FROM project_wards pw2
                 JOIN wards w ON pw2.wardId = w.wardId
                 WHERE pw2.projectId = p.id AND pw2.voided = 0) as ward_name,
                (SELECT filePath FROM project_photos WHERE projectId = p.id AND voided = 0 AND approved_for_public = 1 LIMIT 1) as thumbnail
            FROM projects p
            LEFT JOIN departments d ON p.departmentId = d.departmentId
            LEFT JOIN categories pc ON p.categoryId = pc.categoryId
            LEFT JOIN financialyears fy ON p.finYearId = fy.finYearId AND (fy.voided IS NULL OR fy.voided = 0)
            LEFT JOIN project_subcounties psc ON p.id = psc.projectId AND psc.voided = 0
            LEFT JOIN project_wards pw ON p.id = pw.projectId AND pw.voided = 0
            WHERE ${whereClause}
            ORDER BY p.createdAt DESC
            LIMIT ? OFFSET ?
        `;

        queryParams.push(parseInt(limit), offset);
        let [projects] = await pool.query(projectsQuery, queryParams);
        
        // Post-filter for "Other" status to ensure only non-main-category projects are returned
        if (status === 'Other' && needsPostFiltering) {
            projects = projects.filter(project => {
                const projectStatus = (project.status || '').toString().trim();
                return !isMainCategoryStatus(projectStatus);
            });
            
            // Recalculate total count for "Other" after filtering
            // Build query without limit/offset for total count
            const allProjectsCountQuery = `
                SELECT DISTINCT p.id, p.status
                FROM projects p
                LEFT JOIN departments d ON p.departmentId = d.departmentId
                LEFT JOIN categories pc ON p.categoryId = pc.categoryId
                LEFT JOIN project_subcounties psc ON p.id = psc.projectId AND psc.voided = 0
                LEFT JOIN project_wards pw ON p.id = pw.projectId AND pw.voided = 0
                WHERE ${whereClause}
            `;
            // Remove limit and offset from queryParams for count query
            const countQueryParams = queryParams.slice(0, -2);
            const [allProjects] = await pool.query(allProjectsCountQuery, countQueryParams);
            const filteredTotal = allProjects.filter(p => {
                const projectStatus = (p.status || '').toString().trim();
                return !isMainCategoryStatus(projectStatus);
            }).length;
            totalProjects = filteredTotal;
        }

        res.json({
            projects,
            pagination: {
                total: totalProjects,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalProjects / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.json({
            projects: [],
            pagination: {
                total: 0,
                page: parseInt(req.query.page || 1),
                limit: parseInt(req.query.limit || 20),
                totalPages: 0
            },
            warning: 'Projects data is unavailable for this database schema'
        });
    }
});

/**
 * @route GET /api/public/projects/:id/map
 * @description Get project map/GeoJSON data for a specific approved public project
 * @access Public (no authentication required)
 * NOTE: This route must come BEFORE /projects/:id to avoid route conflicts
 */
router.get('/projects/:id/map', async (req, res) => {
    try {
        const { id } = req.params;

        // First verify the project exists and is approved for public
        const projectCheckQuery = `
            SELECT id, projectName, approved_for_public
            FROM projects
            WHERE id = ? AND voided = 0 AND approved_for_public = 1
        `;
        const [projects] = await pool.query(projectCheckQuery, [id]);

        if (projects.length === 0) {
            return res.status(404).json({ error: 'Project not found or not approved for public viewing' });
        }

        // Get project map/GeoJSON data - only for approved public projects
        const mapQuery = `
            SELECT 
                pm.mapId,
                pm.map as geoJson
            FROM project_maps pm
            INNER JOIN projects p ON pm.projectId = p.id
            WHERE pm.projectId = ? 
            AND pm.voided = 0 
            AND p.voided = 0 
            AND p.approved_for_public = 1
            ORDER BY pm.mapId DESC
            LIMIT 1
        `;
        const [maps] = await pool.query(mapQuery, [id]);
        
        if (maps.length === 0) {
            return res.status(404).json({ error: 'No map data available for this project' });
        }

        let mapData = null;
        try {
            mapData = {
                mapId: maps[0].mapId,
                geoJson: typeof maps[0].geoJson === 'string' 
                    ? JSON.parse(maps[0].geoJson) 
                    : maps[0].geoJson
            };
            res.json(mapData);
        } catch (e) {
            console.error('Error parsing GeoJSON for project:', id, e);
            res.status(500).json({ error: 'Error parsing map data', details: e.message });
        }
    } catch (error) {
        console.error('Error fetching project map:', error);
        res.status(500).json({ error: 'Failed to fetch project map', details: error.message });
    }
});

/**
 * @route GET /api/public/projects/:id
 * @description Get detailed information about a specific project
 * @access Public
 */
router.get('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                p.id,
                p.projectName as project_name,
                p.projectDescription as description,
                p.costOfProject as budget,
                p.status,
                p.startDate as start_date,
                p.endDate as end_date,
                p.overallProgress as completionPercentage,
                p.createdAt,
                d.name as department_name,
                pc.categoryName as projectType,
                fy.finYearName as financialYear,
                (SELECT GROUP_CONCAT(DISTINCT sc.name SEPARATOR ', ')
                 FROM project_subcounties psc2
                 JOIN subcounties sc ON psc2.subcountyId = sc.subcountyId
                 WHERE psc2.projectId = p.id AND psc2.voided = 0) as subcounty_name,
                (SELECT GROUP_CONCAT(DISTINCT w.name SEPARATOR ', ')
                 FROM project_wards pw2
                 JOIN wards w ON pw2.wardId = w.wardId
                 WHERE pw2.projectId = p.id AND pw2.voided = 0) as ward_name,
                (SELECT filePath FROM project_photos WHERE projectId = p.id AND voided = 0 AND approved_for_public = 1 LIMIT 1) as thumbnail
            FROM projects p
            LEFT JOIN departments d ON p.departmentId = d.departmentId AND (d.voided IS NULL OR d.voided = 0)
            LEFT JOIN categories pc ON p.categoryId = pc.categoryId
            LEFT JOIN financialyears fy ON p.finYearId = fy.finYearId AND (fy.voided IS NULL OR fy.voided = 0)
            WHERE p.id = ? AND p.voided = 0 AND p.approved_for_public = 1
        `;

        const [projects] = await pool.query(query, [id]);

        if (projects.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Get all approved project photos
        const photosQuery = `
            SELECT 
                photoId,
                filePath, 
                fileName,
                description,
                createdAt as uploaded_at
            FROM project_photos
            WHERE projectId = ? AND voided = 0 AND approved_for_public = 1
            ORDER BY createdAt DESC
        `;
        const [photos] = await pool.query(photosQuery, [id]);

        // Get project map/GeoJSON data - only for approved public projects
        const mapQuery = `
            SELECT 
                pm.mapId,
                pm.map as geoJson
            FROM project_maps pm
            INNER JOIN projects p ON pm.projectId = p.id
            WHERE pm.projectId = ? 
            AND pm.voided = 0 
            AND p.voided = 0 
            AND p.approved_for_public = 1
            ORDER BY pm.mapId DESC
            LIMIT 1
        `;
        const [maps] = await pool.query(mapQuery, [id]);
        
        let mapData = null;
        if (maps.length > 0 && maps[0].geoJson) {
            try {
                mapData = {
                    mapId: maps[0].mapId,
                    geoJson: typeof maps[0].geoJson === 'string' 
                        ? JSON.parse(maps[0].geoJson) 
                        : maps[0].geoJson
                };
            } catch (e) {
                console.error('Error parsing GeoJSON for project:', id, e);
            }
        }

        // Return project data with photos and map included
        const projectData = projects[0];
        projectData.photos = photos || [];
        if (mapData) {
            projectData.map = mapData;
        }
        res.json(projectData);
    } catch (error) {
        console.error('Error fetching project details:', error);
        res.status(500).json({ error: 'Failed to fetch project details', details: error.message });
    }
});

// ==================== DEPARTMENT STATISTICS ====================

/**
 * @route GET /api/public/stats/by-department
 * @description Get project statistics grouped by department
 * @access Public
 */
router.get('/stats/by-department', async (req, res) => {
    try {
        if (isPostgresDb()) {
            const rows = await queryPgPublicProjectsForStats(req.query);
            const departmentMap = new Map();
            rows.forEach((row) => {
                const key = row.ministry_key || 'Unassigned';
                if (!departmentMap.has(key)) {
                    departmentMap.set(key, {
                        department_id: key,
                        department_name: key,
                        departmentAlias: null,
                        projects: []
                    });
                }
                departmentMap.get(key).projects.push({
                    id: row.id,
                    status: row.status,
                    costOfProject: parseFloat(row.costOfProject) || 0
                });
            });
            departmentMap.forEach((dept) => {
                dept.total_projects = dept.projects.length;
                dept.total_budget = dept.projects.reduce((sum, p) => sum + p.costOfProject, 0);
                dept.completed_projects = 0;
                dept.ongoing_projects = 0;
                dept.stalled_projects = 0;
                dept.not_started_projects = 0;
                dept.under_procurement_projects = 0;
                dept.suspended_projects = 0;
                dept.other_projects = 0;
                dept.projects.forEach((project) => {
                    const st = project.status || '';
                    if (matchesStatusCategory(st, 'Completed')) dept.completed_projects++;
                    else if (matchesStatusCategory(st, 'Ongoing')) dept.ongoing_projects++;
                    else if (matchesStatusCategory(st, 'Not Started')) dept.not_started_projects++;
                    else if (matchesStatusCategory(st, 'Under Procurement')) dept.under_procurement_projects++;
                    else if (matchesStatusCategory(st, 'Stalled')) dept.stalled_projects++;
                    else if (matchesStatusCategory(st, 'Suspended')) dept.suspended_projects++;
                    else dept.other_projects++;
                });
                delete dept.projects;
            });
            const results = Array.from(departmentMap.values())
                .filter((dept) => dept.total_projects > 0)
                .sort((a, b) => b.total_budget - a.total_budget);
            return res.json(results);
        }

        const { finYearId, departmentId, subcountyId, wardId, search } = req.query;
        
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

        if (subcountyId) {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM project_subcounties psc 
                WHERE psc.projectId = p.id 
                AND psc.subcountyId = ? 
                AND psc.voided = 0
            )`);
            queryParams.push(subcountyId);
        }

        if (wardId) {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM project_wards pw 
                WHERE pw.projectId = p.id 
                AND pw.wardId = ? 
                AND pw.voided = 0
            )`);
            queryParams.push(wardId);
        }

        if (search) {
            whereConditions.push('p.projectName LIKE ?');
            queryParams.push(`%${search}%`);
        }

        // Get all projects with their statuses to categorize them properly
        // Build join conditions for projects
        let projectJoinConditions = ['p.voided = 0'];
        const projectQueryParams = [];
        
        if (finYearId) {
            projectJoinConditions.push('p.finYearId = ?');
            projectQueryParams.push(finYearId);
        }
        
        if (departmentId) {
            projectJoinConditions.push('p.departmentId = ?');
            projectQueryParams.push(departmentId);
        }
        
        if (search) {
            projectJoinConditions.push('p.projectName LIKE ?');
            projectQueryParams.push(`%${search}%`);
        }
        
        let subquery = '';
        if (subcountyId) {
            subquery = `AND EXISTS (SELECT 1 FROM project_subcounties psc WHERE psc.projectId = p.id AND psc.subcountyId = ? AND psc.voided = 0)`;
            projectQueryParams.push(subcountyId);
        }
        
        if (wardId) {
            subquery += ` AND EXISTS (SELECT 1 FROM project_wards pw WHERE pw.projectId = p.id AND pw.wardId = ? AND pw.voided = 0)`;
            projectQueryParams.push(wardId);
        }
        
        const projectJoinClause = projectJoinConditions.join(' AND ');
        
        const projectsQuery = `
            SELECT 
                d.departmentId as department_id,
                d.name as department_name,
                d.alias as departmentAlias,
                p.id as project_id,
                p.status,
                p.costOfProject
            FROM departments d
            LEFT JOIN projects p ON d.departmentId = p.departmentId 
                AND ${projectJoinClause}
                ${subquery}
            WHERE (d.voided IS NULL OR d.voided = 0)
        `;
        
        const [projects] = await pool.query(projectsQuery, projectQueryParams);
        
        // Group projects by department and categorize by status
        const departmentMap = new Map();
        
        projects.forEach(project => {
            const deptId = project.department_id;
            const status = project.status || '';
            
            if (!deptId) return; // Skip projects without departments
            
            if (!departmentMap.has(deptId)) {
                departmentMap.set(deptId, {
                    department_id: deptId,
                    department_name: project.department_name,
                    departmentAlias: project.departmentAlias,
                    projects: [],
                    total_projects: 0,
                    total_budget: 0,
                    completed_projects: 0,
                    ongoing_projects: 0,
                    stalled_projects: 0,
                    not_started_projects: 0,
                    under_procurement_projects: 0,
                    suspended_projects: 0,
                    other_projects: 0
                });
            }
            
            const dept = departmentMap.get(deptId);
            
            if (project.project_id) {
                dept.projects.push({
                    id: project.project_id,
                    status: status,
                    costOfProject: parseFloat(project.costOfProject) || 0
                });
            }
        });
        
        // Categorize projects using the helper functions
        departmentMap.forEach((dept, deptId) => {
            dept.total_projects = dept.projects.length;
            dept.total_budget = dept.projects.reduce((sum, p) => sum + p.costOfProject, 0);
            
            dept.projects.forEach(project => {
                const status = project.status || '';
                
                if (matchesStatusCategory(status, 'Completed')) {
                    dept.completed_projects++;
                } else if (matchesStatusCategory(status, 'Ongoing')) {
                    dept.ongoing_projects++;
                } else if (matchesStatusCategory(status, 'Not Started')) {
                    dept.not_started_projects++;
                } else if (matchesStatusCategory(status, 'Under Procurement')) {
                    dept.under_procurement_projects++;
                } else if (matchesStatusCategory(status, 'Stalled')) {
                    dept.stalled_projects++;
                } else if (matchesStatusCategory(status, 'Suspended')) {
                    dept.suspended_projects++;
                } else {
                    // Other category
                    dept.other_projects++;
                }
            });
            
            // Remove projects array as it's not needed in response
            delete dept.projects;
        });
        
        // Convert map to array and filter departments with projects
        const results = Array.from(departmentMap.values())
            .filter(dept => dept.total_projects > 0)
            .sort((a, b) => b.total_budget - a.total_budget);
        
        res.json(results);
    } catch (error) {
        console.error('Error fetching department stats:', error);
        res.status(500).json({ error: 'Failed to fetch department statistics' });
    }
});

// ==================== GEOGRAPHIC STATISTICS ====================

/**
 * @route GET /api/public/stats/by-subcounty
 * @description Get project statistics grouped by sub-county
 * @access Public
 */
router.get('/stats/by-subcounty', async (req, res) => {
    try {
        if (isPostgresDb()) {
            const rows = await queryPgPublicProjectsForStats(req.query);
            const groups = new Map();
            rows.forEach((row) => {
                const key = row.subcounty_key || 'Unassigned';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(row);
            });
            const results = [];
            groups.forEach((ps, name) => {
                results.push({
                    subcounty_id: name,
                    subcounty_name: name,
                    project_count: ps.length,
                    total_budget: ps.reduce((sum, p) => sum + (parseFloat(p.costOfProject) || 0), 0),
                    completed_projects: ps.filter((p) => matchesStatusCategory(p.status || '', 'Completed')).length,
                    ongoing_projects: ps.filter((p) => matchesStatusCategory(p.status || '', 'Ongoing')).length
                });
            });
            results.sort((a, b) => (parseFloat(b.total_budget) || 0) - (parseFloat(a.total_budget) || 0));
            return res.json(results);
        }

        const { finYearId, departmentId, subcountyId, wardId, search } = req.query;
        
        let whereConditions = [];
        const queryParams = [];
        
        if (finYearId) {
            whereConditions.push('p.finYearId = ?');
            queryParams.push(finYearId);
        }

        if (departmentId) {
            whereConditions.push('p.departmentId = ?');
            queryParams.push(departmentId);
        }

        if (subcountyId) {
            whereConditions.push('sc.subcountyId = ?');
            queryParams.push(subcountyId);
        }

        if (wardId) {
            whereConditions.push(`EXISTS (
                SELECT 1 FROM project_wards pw 
                WHERE pw.projectId = p.id 
                AND pw.wardId = ? 
                AND pw.voided = 0
            )`);
            queryParams.push(wardId);
        }

        if (search) {
            whereConditions.push('p.projectName LIKE ?');
            queryParams.push(`%${search}%`);
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
            SELECT 
                sc.subcountyId as subcounty_id,
                sc.name as subcounty_name,
                COUNT(psc.projectId) as project_count,
                COALESCE(SUM(p.costOfProject), 0) as total_budget,
                COUNT(CASE 
                    WHEN p.status = 'Completed' 
                    OR LOWER(p.status) LIKE '%completed%'
                    THEN 1 
                END) as completed_projects,
                COUNT(CASE 
                    WHEN p.status = 'Ongoing' 
                    OR (LOWER(p.status) LIKE '%ongoing%' AND LOWER(p.status) NOT LIKE '%completed%')
                    THEN 1 
                END) as ongoing_projects
            FROM subcounties sc
            LEFT JOIN project_subcounties psc ON sc.subcountyId = psc.subcountyId AND psc.voided = 0
            LEFT JOIN projects p ON psc.projectId = p.id AND p.voided = 0
            WHERE (sc.voided IS NULL OR sc.voided = 0)
            ${whereClause ? `AND ${whereClause}` : ''}
            GROUP BY sc.subcountyId, sc.name
            HAVING project_count > 0
            ORDER BY total_budget DESC
        `;

        const [results] = await pool.query(query, queryParams);
        res.json(results);
    } catch (error) {
        console.error('Error fetching sub-county stats:', error);
        res.status(500).json({ error: 'Failed to fetch sub-county statistics' });
    }
});

/**
 * @route GET /api/public/stats/by-ward
 * @description Get project statistics grouped by ward
 * @access Public
 */
router.get('/stats/by-ward', async (req, res) => {
    try {
        if (isPostgresDb()) {
            const rows = await queryPgPublicProjectsForStats(req.query);
            const byKey = new Map();
            rows.forEach((row) => {
                const sk = row.subcounty_key || 'Unassigned';
                const wk = row.ward_key || 'Unassigned';
                const key = `${sk}\0${wk}`;
                if (!byKey.has(key)) {
                    byKey.set(key, { subcounty_name: sk, ward_name: wk, projects: [] });
                }
                byKey.get(key).projects.push(row);
            });
            const results = [];
            byKey.forEach((g) => {
                const ps = g.projects;
                results.push({
                    ward_id: g.ward_name,
                    ward_name: g.ward_name,
                    subcounty_id: g.subcounty_name,
                    subcounty_name: g.subcounty_name,
                    project_count: ps.length,
                    total_budget: ps.reduce((sum, p) => sum + (parseFloat(p.costOfProject) || 0), 0),
                    completed_count: ps.filter((p) => matchesStatusCategory(p.status || '', 'Completed')).length,
                    ongoing_count: ps.filter((p) => matchesStatusCategory(p.status || '', 'Ongoing')).length
                });
            });
            return res.json(results);
        }

        const { finYearId, departmentId, subcountyId, wardId, search } = req.query;
        
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

        if (subcountyId) {
            whereConditions.push('w.subcountyId = ?');
            queryParams.push(subcountyId);
        }

        if (wardId) {
            whereConditions.push('w.wardId = ?');
            queryParams.push(wardId);
        }

        if (search) {
            whereConditions.push('p.projectName LIKE ?');
            queryParams.push(`%${search}%`);
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
            SELECT 
                w.wardId as ward_id,
                w.name as ward_name,
                sc.subcountyId as subcounty_id,
                sc.name as subcounty_name,
                COUNT(pw.projectId) as project_count,
                COALESCE(SUM(p.costOfProject), 0) as total_budget,
                COUNT(CASE 
                    WHEN p.status = 'Completed' 
                    OR LOWER(p.status) LIKE '%completed%'
                    THEN 1 
                END) as completed_count,
                COUNT(CASE 
                    WHEN p.status = 'Ongoing' 
                    OR (LOWER(p.status) LIKE '%ongoing%' AND LOWER(p.status) NOT LIKE '%completed%')
                    THEN 1 
                END) as ongoing_count
            FROM wards w
            LEFT JOIN subcounties sc ON w.subcountyId = sc.subcountyId
            LEFT JOIN project_wards pw ON w.wardId = pw.wardId AND pw.voided = 0
            LEFT JOIN projects p ON pw.projectId = p.id AND p.voided = 0 AND p.approved_for_public = 1
            WHERE ${whereClause}
            GROUP BY w.wardId, w.name, sc.subcountyId, sc.name
            HAVING project_count > 0
            ORDER BY sc.name, total_budget DESC
        `;

        const [results] = await pool.query(query, queryParams);
        res.json(results);
    } catch (error) {
        console.error('Error fetching ward stats:', error);
        res.status(500).json({ error: 'Failed to fetch ward statistics' });
    }
});

// ==================== PROJECT TYPES ====================

/**
 * @route GET /api/public/stats/by-project-type
 * @description Get project statistics grouped by project type/category
 * @access Public
 */
router.get('/stats/by-project-type', async (req, res) => {
    try {
        const { finYearId } = req.query;
        
        let whereClause = 'WHERE p.voided = 0';
        const queryParams = [];
        
        if (finYearId) {
            whereClause += ' AND p.finYearId = ?';
            queryParams.push(finYearId);
        }

        const query = `
            SELECT 
                pc.categoryId as id,
                pc.categoryName as projectType,
                COUNT(p.id) as project_count,
                COALESCE(SUM(p.costOfProject), 0) as total_budget
            FROM categories pc
            LEFT JOIN projects p ON pc.categoryId = p.categoryId AND p.voided = 0 AND p.approved_for_public = 1
            ${finYearId ? 'AND p.finYearId = ?' : ''}
            GROUP BY pc.categoryId, pc.categoryName
            HAVING project_count > 0
            ORDER BY total_budget DESC
        `;

        const [results] = await pool.query(query, finYearId ? [finYearId] : []);
        res.json(results);
    } catch (error) {
        console.error('Error fetching project type stats:', error);
        res.status(500).json({ error: 'Failed to fetch project type statistics' });
    }
});

// ==================== METADATA ====================

/**
 * @route GET /api/public/metadata/departments
 * @description Get list of all departments
 * @access Public
 */
router.get('/metadata/departments', async (req, res) => {
    try {
        const query = 'SELECT departmentId as id, name FROM departments WHERE voided = 0 ORDER BY name';
        const [results] = await pool.query(query);
        res.json(results);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.json([]);
    }
});

/**
 * @route GET /api/public/metadata/subcounties
 * @description Get list of all sub-counties
 * @access Public
 */
router.get('/metadata/subcounties', async (req, res) => {
    try {
        const query = 'SELECT subcountyId as id, name, countyId FROM subcounties ORDER BY name';
        const [results] = await pool.query(query);
        res.json(results);
    } catch (error) {
        console.error('Error fetching sub-counties:', error);
        res.json([]);
    }
});

/**
 * @route GET /api/public/metadata/wards
 * @description Get list of all wards
 * @access Public
 */
router.get('/metadata/wards', async (req, res) => {
    try {
        const { subCountyId } = req.query;
        
        let query = 'SELECT wardId as id, name, subcountyId FROM wards';
        const queryParams = [];
        
        if (subCountyId) {
            query += ' WHERE subcountyId = ?';
            queryParams.push(subCountyId);
        }
        
        query += ' ORDER BY name';
        
        const [results] = await pool.query(query, queryParams);
        res.json(results);
    } catch (error) {
        console.error('Error fetching wards:', error);
        res.json([]);
    }
});

/**
 * @route GET /api/public/metadata/project-types
 * @description Get list of all project types/categories
 * @access Public
 */
router.get('/metadata/project-types', async (req, res) => {
    try {
        const query = 'SELECT categoryId as id, categoryName as name FROM categories WHERE voided = 0 ORDER BY categoryName';
        const [results] = await pool.query(query);
        res.json(results);
    } catch (error) {
        console.error('Error fetching project types:', error);
        res.json([]);
    }
});

// ==================== FEEDBACK ====================

/**
 * @route GET /api/public/feedback/stats
 * @description Get feedback statistics (only approved feedback counts)
 * @access Public
 */
router.get('/feedback/stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                COUNT(*) as total_feedback,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_feedback,
                COUNT(CASE WHEN status = 'reviewed' THEN 1 END) as reviewed_feedback,
                COUNT(CASE WHEN status = 'responded' THEN 1 END) as responded_feedback,
                COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_feedback
            FROM public_feedback 
            WHERE moderation_status = 'approved'
        `;

        const [results] = await pool.query(query);
        res.json(results[0]);
    } catch (error) {
        console.error('Error fetching feedback stats:', error);
        res.status(500).json({ error: 'Failed to fetch feedback statistics' });
    }
});

/**
 * @route POST /api/public/feedback
 * @description Submit public feedback (no authentication required)
 * @access Public
 */
router.post('/feedback', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const { 
            name, 
            email, 
            phone, 
            subject, 
            message, 
            projectId,
            ratingOverallSupport,
            ratingQualityOfLifeImpact,
            ratingCommunityAlignment,
            ratingTransparency,
            ratingFeasibilityConfidence
        } = req.body;

        // Validate required fields
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Validate ratings if provided (must be between 1-5)
        const ratings = [
            ratingOverallSupport,
            ratingQualityOfLifeImpact,
            ratingCommunityAlignment,
            ratingTransparency,
            ratingFeasibilityConfidence
        ];

        for (const rating of ratings) {
            if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
                return res.status(400).json({ error: 'Ratings must be between 1 and 5' });
            }
        }

        if (DB_TYPE === 'postgresql') {
            // Ensure table exists in PostgreSQL deployments where legacy `public_feedback` may be missing.
            await pool.query(`
                CREATE TABLE IF NOT EXISTS public_feedback (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NULL,
                    email VARCHAR(255) NULL,
                    phone VARCHAR(64) NULL,
                    subject VARCHAR(500) NULL,
                    message TEXT NOT NULL,
                    project_id INTEGER NULL,
                    rating_overall_support SMALLINT NULL,
                    rating_quality_of_life_impact SMALLINT NULL,
                    rating_community_alignment SMALLINT NULL,
                    rating_transparency SMALLINT NULL,
                    rating_feasibility_confidence SMALLINT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'pending',
                    moderation_status VARCHAR(50) NOT NULL DEFAULT 'pending',
                    moderation_notes TEXT NULL,
                    moderated_by INTEGER NULL,
                    moderated_at TIMESTAMP WITHOUT TIME ZONE NULL,
                    admin_response TEXT NULL,
                    responded_by INTEGER NULL,
                    responded_at TIMESTAMP WITHOUT TIME ZONE NULL,
                    is_public BOOLEAN NOT NULL DEFAULT false,
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await pool.query(
                `
                INSERT INTO public_feedback (
                    name, email, phone, subject, message, project_id,
                    rating_overall_support, rating_quality_of_life_impact,
                    rating_community_alignment, rating_transparency,
                    rating_feasibility_confidence, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `,
                [
                    name || null,
                    email || null,
                    phone || null,
                    subject || null,
                    message,
                    projectId || null,
                    ratingOverallSupport || null,
                    ratingQualityOfLifeImpact || null,
                    ratingCommunityAlignment || null,
                    ratingTransparency || null,
                    ratingFeasibilityConfidence || null
                ]
            );

            return res.status(201).json({
                success: true,
                message: 'Feedback submitted successfully. Thank you!'
            });
        }

        const query = `
            INSERT INTO public_feedback (
                name, email, phone, subject, message, project_id, 
                rating_overall_support, rating_quality_of_life_impact, 
                rating_community_alignment, rating_transparency, 
                rating_feasibility_confidence, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        await pool.query(query, [
            name, 
            email, 
            phone, 
            subject, 
            message, 
            projectId || null,
            ratingOverallSupport || null,
            ratingQualityOfLifeImpact || null,
            ratingCommunityAlignment || null,
            ratingTransparency || null,
            ratingFeasibilityConfidence || null
        ]);

        res.status(201).json({ 
            success: true, 
            message: 'Feedback submitted successfully. Thank you!' 
        });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

/**
 * @route PUT /api/public/feedback/:id/respond
 * @description Add response to feedback (protected - requires authentication)
 * @access Protected
 */
router.put('/feedback/:id/respond', async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_response, responded_by } = req.body;

        if (!admin_response) {
            return res.status(400).json({ error: 'Response text is required' });
        }

        const query = `
            UPDATE public_feedback 
            SET admin_response = ?,
                responded_by = ?,
                responded_at = NOW(),
                status = 'responded',
                updated_at = NOW()
            WHERE id = ?
        `;

        const [result] = await pool.query(query, [admin_response, responded_by || null, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Feedback not found' });
        }

        res.json({ 
            success: true, 
            message: 'Response submitted successfully' 
        });
    } catch (error) {
        console.error('Error submitting response:', error);
        res.status(500).json({ error: 'Failed to submit response' });
    }
});

/**
 * @route PUT /api/public/feedback/:id/status
 * @description Update feedback status (protected - requires authentication)
 * @access Protected
 */
router.put('/feedback/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'reviewed', 'responded', 'archived'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const query = `
            UPDATE public_feedback 
            SET status = ?,
                updated_at = NOW()
            WHERE id = ?
        `;

        const [result] = await pool.query(query, [status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Feedback not found' });
        }

        res.json({ 
            success: true, 
            message: 'Status updated successfully' 
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

/**
 * @route GET /api/public/feedback
 * @description Get list of public feedback with optional filtering
 * @access Public
 */
router.get('/feedback', async (req, res) => {
    try {
        const { 
            status, 
            projectId,
            search,
            page = 1, 
            limit = 10 
        } = req.query;

        let whereConditions = ['f.moderation_status = "approved"']; // Only show approved feedback publicly
        const queryParams = [];

        if (status && status !== 'all') {
            whereConditions.push('f.status = ?');
            queryParams.push(status);
        }

        if (projectId) {
            whereConditions.push('f.project_id = ?');
            queryParams.push(projectId);
        }

        if (search) {
            whereConditions.push('(f.name LIKE ? OR f.subject LIKE ? OR f.message LIKE ? OR p.projectName LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM public_feedback f
            LEFT JOIN projects p ON f.project_id = p.id
            WHERE ${whereClause}
        `;

        const [countResult] = await pool.query(countQuery, queryParams);
        const totalFeedbacks = countResult[0].total;

        // Get paginated feedback
        const feedbackQuery = `
            SELECT 
                f.id,
                f.name,
                f.email,
                f.phone,
                f.subject,
                f.message,
                f.project_id,
                f.status,
                f.admin_response,
                f.responded_at,
                f.created_at,
                f.rating_overall_support,
                f.rating_quality_of_life_impact,
                f.rating_community_alignment,
                f.rating_transparency,
                f.rating_feasibility_confidence,
                p.projectName as project_name
            FROM public_feedback f
            LEFT JOIN projects p ON f.project_id = p.id
            WHERE ${whereClause}
            ORDER BY f.created_at DESC
            LIMIT ? OFFSET ?
        `;

        queryParams.push(parseInt(limit), offset);
        const [feedbacks] = await pool.query(feedbackQuery, queryParams);

        res.json({
            feedbacks,
            pagination: {
                total: totalFeedbacks,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalFeedbacks / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({ error: 'Failed to fetch feedback' });
    }
});

/**
 * @route GET /api/public/feedback/admin
 * @description Get all feedback for admin interface (including unmoderated)
 * @access Protected (Admin)
 */
router.get('/feedback/admin', async (req, res) => {
    try {
        const { 
            status, 
            projectId,
            search,
            moderation_status,
            page = 1, 
            limit = 10 
        } = req.query;

        let whereConditions = ['1=1']; // Admin can see all feedback
        const queryParams = [];

        if (status && status !== 'all') {
            whereConditions.push('f.status = ?');
            queryParams.push(status);
        }

        if (moderation_status && moderation_status !== 'all') {
            whereConditions.push('f.moderation_status = ?');
            queryParams.push(moderation_status);
        }

        if (projectId) {
            whereConditions.push('f.project_id = ?');
            queryParams.push(projectId);
        }

        if (search) {
            whereConditions.push('(f.name LIKE ? OR f.subject LIKE ? OR f.message LIKE ? OR p.projectName LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM public_feedback f
            LEFT JOIN projects p ON f.project_id = p.id
            WHERE ${whereClause}
        `;

        const [countResult] = await pool.query(countQuery, queryParams);
        const totalFeedbacks = countResult[0].total;

        // Get paginated feedback
        const feedbackQuery = `
            SELECT 
                f.id,
                f.name,
                f.email,
                f.phone,
                f.subject,
                f.message,
                f.project_id,
                f.status,
                f.admin_response,
                f.responded_at,
                f.created_at,
                f.moderation_status,
                f.moderation_reason,
                f.custom_reason,
                f.moderator_notes,
                f.moderated_at,
                f.rating_overall_support,
                f.rating_quality_of_life_impact,
                f.rating_community_alignment,
                f.rating_transparency,
                f.rating_feasibility_confidence,
                p.projectName as project_name,
                CONCAT(u.firstName, ' ', u.lastName) as moderator_name
            FROM public_feedback f
            LEFT JOIN projects p ON f.project_id = p.id
            LEFT JOIN users u ON f.moderated_by = u.userId
            WHERE ${whereClause}
            ORDER BY f.created_at DESC
            LIMIT ? OFFSET ?
        `;

        queryParams.push(parseInt(limit), offset);
        const [feedbacks] = await pool.query(feedbackQuery, queryParams);

        res.json({
            feedbacks,
            pagination: {
                total: totalFeedbacks,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalFeedbacks / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching admin feedback:', error);
        res.status(500).json({ error: 'Failed to fetch feedback' });
    }
});

// ==================== CITIZEN PROPOSALS ====================

/**
 * @route GET /api/public/citizen-proposals
 * @description Get all citizen proposals with optional filtering
 * @access Public
 */
router.get('/citizen-proposals', async (req, res) => {
    try {
        const { status, category, page = 1, limit = 20 } = req.query;
        
        let whereConditions = ['voided = 0', 'approved_for_public = 1'];
        const queryParams = [];
        
        if (status && status !== 'all') {
            whereConditions.push('status = ?');
            queryParams.push(status);
        }
        
        if (category && category !== 'all') {
            whereConditions.push('category = ?');
            queryParams.push(category);
        }
        
        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;
        
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM citizen_proposals WHERE ${whereClause}`;
        const [countResult] = await pool.query(countQuery, queryParams);
        const total = countResult[0].total;
        
        // Get proposals
        const query = `
            SELECT 
                id,
                title,
                description,
                category,
                location,
                estimated_cost,
                proposer_name,
                proposer_email,
                proposer_phone,
                proposer_address,
                justification,
                expected_benefits,
                timeline,
                status,
                submission_date,
                created_at,
                updated_at
            FROM citizen_proposals
            WHERE ${whereClause}
            ORDER BY submission_date DESC
            LIMIT ? OFFSET ?
        `;
        
        queryParams.push(parseInt(limit), offset);
        const [proposals] = await pool.query(query, queryParams);
        
        res.json({
            proposals,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching citizen proposals:', error);
        res.status(500).json({ 
            error: 'Failed to fetch proposals',
            details: error.message || 'Database error occurred'
        });
    }
});

/**
 * @route POST /api/public/citizen-proposals
 * @description Submit a new citizen proposal
 * @access Public
 */
router.post('/citizen-proposals', async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            location,
            estimatedCost,
            proposerName,
            proposerEmail,
            proposerPhone,
            proposerAddress,
            justification,
            expectedBenefits,
            timeline
        } = req.body;
        
        // Validate required fields
        if (!title || !description || !category || !location || estimatedCost === undefined || estimatedCost === null || 
            !proposerName || !proposerEmail || !proposerPhone || !justification || 
            !expectedBenefits || !timeline) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                details: {
                    title: !title,
                    description: !description,
                    category: !category,
                    location: !location,
                    estimatedCost: estimatedCost === undefined || estimatedCost === null,
                    proposerName: !proposerName,
                    proposerEmail: !proposerEmail,
                    proposerPhone: !proposerPhone,
                    justification: !justification,
                    expectedBenefits: !expectedBenefits,
                    timeline: !timeline
                }
            });
        }
        
        // Validate estimatedCost is a valid number
        const cost = parseFloat(estimatedCost);
        if (isNaN(cost) || cost <= 0) {
            return res.status(400).json({ error: 'Estimated cost must be a valid positive number' });
        }
        
        const query = `
            INSERT INTO citizen_proposals (
                title, description, category, location, estimated_cost,
                proposer_name, proposer_email, proposer_phone, proposer_address,
                justification, expected_benefits, timeline, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Under Review')
        `;
        
        const [result] = await pool.query(query, [
            title, description, category, location, cost,
            proposerName, proposerEmail, proposerPhone, proposerAddress || '',
            justification, expectedBenefits, timeline
        ]);
        
        res.status(201).json({
            message: 'Proposal submitted successfully',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error submitting proposal:', error);
        res.status(500).json({ 
            error: 'Failed to submit proposal',
            details: error.message || 'Database error occurred'
        });
    }
});

/**
 * @route GET /api/public/citizen-proposals/:id
 * @description Get a specific citizen proposal by ID
 * @access Public
 */
router.get('/citizen-proposals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                id,
                title,
                description,
                category,
                location,
                estimated_cost,
                proposer_name,
                proposer_email,
                proposer_phone,
                proposer_address,
                justification,
                expected_benefits,
                timeline,
                status,
                submission_date,
                review_notes,
                created_at,
                updated_at
            FROM citizen_proposals
            WHERE id = ? AND voided = 0 AND approved_for_public = 1
        `;
        
        const [proposals] = await pool.query(query, [id]);
        
        if (proposals.length === 0) {
            return res.status(404).json({ error: 'Proposal not found' });
        }
        
        res.json(proposals[0]);
    } catch (error) {
        console.error('Error fetching proposal:', error);
        res.status(500).json({ error: 'Failed to fetch proposal' });
    }
});

// ==================== COUNTY PROPOSED PROJECTS ====================

/**
 * @route GET /api/public/county-proposed-projects
 * @description Get all county proposed projects with optional filtering
 * @access Public
 */
router.get('/county-proposed-projects', async (req, res) => {
    try {
        const { category, status, priority, page = 1, limit = 20 } = req.query;
        
        let whereConditions = ['cpp.voided = 0', 'cpp.approved_for_public = 1'];
        const queryParams = [];
        
        if (category && category !== 'All') {
            whereConditions.push('cpp.category = ?');
            queryParams.push(category);
        }
        
        if (status && status !== 'All') {
            whereConditions.push('cpp.status = ?');
            queryParams.push(status);
        }
        
        if (priority && priority !== 'All') {
            whereConditions.push('cpp.priority = ?');
            queryParams.push(priority);
        }
        
        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;
        
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM county_proposed_projects cpp WHERE ${whereClause}`;
        const [countResult] = await pool.query(countQuery, queryParams);
        const total = countResult[0].total;
        
        // Get projects with milestones
        const query = `
            SELECT 
                cpp.id,
                cpp.title,
                cpp.description,
                cpp.category,
                cpp.location,
                cpp.estimated_cost,
                cpp.justification,
                cpp.expected_benefits,
                cpp.timeline,
                cpp.status,
                cpp.priority,
                cpp.department,
                cpp.project_manager,
                cpp.contact,
                cpp.start_date,
                cpp.end_date,
                cpp.progress,
                cpp.budget_allocated,
                cpp.budget_utilized,
                cpp.stakeholders,
                cpp.risks,
                cpp.created_at,
                cpp.updated_at
            FROM county_proposed_projects cpp
            WHERE ${whereClause}
            ORDER BY cpp.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        queryParams.push(parseInt(limit), offset);
        const [projects] = await pool.query(query, queryParams);
        
        // Get milestones for each project
        for (let project of projects) {
            const milestonesQuery = `
                SELECT 
                    id,
                    name,
                    description,
                    target_date,
                    completed,
                    completed_date,
                    sequence_order
                FROM county_proposed_project_milestones
                WHERE project_id = ?
                ORDER BY sequence_order, target_date
            `;
            const [milestones] = await pool.query(milestonesQuery, [project.id]);
            project.milestones = milestones;
        }
        
        res.json({
            projects,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching county proposed projects:', error);
        res.status(500).json({ 
            error: 'Failed to fetch projects',
            details: error.message || 'Database error occurred'
        });
    }
});

/**
 * @route GET /api/public/county-proposed-projects/:id
 * @description Get a specific county proposed project by ID
 * @access Public
 */
router.get('/county-proposed-projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                cpp.id,
                cpp.title,
                cpp.description,
                cpp.category,
                cpp.location,
                cpp.estimated_cost,
                cpp.justification,
                cpp.expected_benefits,
                cpp.timeline,
                cpp.status,
                cpp.priority,
                cpp.department,
                cpp.project_manager,
                cpp.contact,
                cpp.start_date,
                cpp.end_date,
                cpp.progress,
                cpp.budget_allocated,
                cpp.budget_utilized,
                cpp.stakeholders,
                cpp.risks,
                cpp.created_at,
                cpp.updated_at
            FROM county_proposed_projects cpp
            WHERE cpp.id = ? AND cpp.voided = 0 AND cpp.approved_for_public = 1
        `;
        
        const [projects] = await pool.query(query, [id]);
        
        if (projects.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        const project = projects[0];
        
        // Get milestones
        const milestonesQuery = `
            SELECT 
                id,
                name,
                description,
                target_date,
                completed,
                completed_date,
                sequence_order
            FROM county_proposed_project_milestones
            WHERE project_id = ?
            ORDER BY sequence_order, target_date
        `;
        const [milestones] = await pool.query(milestonesQuery, [id]);
        project.milestones = milestones;
        
        res.json(project);
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// ==================== PROJECT ANNOUNCEMENTS ====================

/**
 * @route GET /api/public/announcements
 * @description Get all project announcements with optional filtering
 * @access Public
 */
router.get('/announcements', async (req, res) => {
    try {
        const { category, status, page = 1, limit = 20 } = req.query;
        
        let whereConditions = ['voided = 0', 'approved_for_public = 1'];
        const queryParams = [];
        
        if (category && category !== 'All') {
            whereConditions.push('category = ?');
            queryParams.push(category);
        }
        
        if (status && status !== 'All') {
            whereConditions.push('status = ?');
            queryParams.push(status);
        }
        
        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;
        
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM project_announcements WHERE ${whereClause}`;
        const [countResult] = await pool.query(countQuery, queryParams);
        const total = countResult[0].total;
        
        // Get announcements
        const query = `
            SELECT 
                id,
                title,
                description,
                content,
                category,
                type,
                date,
                time,
                location,
                organizer,
                status,
                priority,
                image_url,
                attendees,
                max_attendees,
                created_at,
                updated_at
            FROM project_announcements
            WHERE ${whereClause}
            ORDER BY date DESC, time DESC
            LIMIT ? OFFSET ?
        `;
        
        queryParams.push(parseInt(limit), offset);
        const [announcements] = await pool.query(query, queryParams);
        
        res.json({
            announcements,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ 
            error: 'Failed to fetch announcements',
            details: error.message || 'Database error occurred'
        });
    }
});

/**
 * @route GET /api/public/announcements/:id
 * @description Get a specific announcement by ID
 * @access Public
 */
router.get('/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                id,
                title,
                description,
                content,
                category,
                type,
                date,
                time,
                location,
                organizer,
                status,
                priority,
                image_url,
                attendees,
                max_attendees,
                created_at,
                updated_at
            FROM project_announcements
            WHERE id = ? AND voided = 0 AND approved_for_public = 1
        `;
        
        const [announcements] = await pool.query(query, [id]);
        
        if (announcements.length === 0) {
            return res.status(404).json({ error: 'Announcement not found' });
        }
        
        res.json(announcements[0]);
    } catch (error) {
        console.error('Error fetching announcement:', error);
        res.status(500).json({ error: 'Failed to fetch announcement' });
    }
});

/**
 * @route GET /api/public/agencies
 * @description Get all agencies for public use (e.g., registration form)
 * @access Public
 */
router.get('/agencies', async (req, res) => {
    try {
        const search = req.query.search || '';
        
        // Check if table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'agencies'
            );
        `);
        
        if (!tableCheck.rows[0]?.exists) {
            return res.status(200).json({
                data: [],
                total: 0,
                message: 'agencies table does not exist. Please run the migration script to create it.'
            });
        }
        
        let query = `
            SELECT 
                id,
                ministry,
                state_department,
                agency_name,
                created_at,
                updated_at
            FROM agencies
            WHERE voided = false
        `;
        const params = [];
        
        if (search) {
            query += ` AND (
                agency_name ILIKE $1 OR
                ministry ILIKE $1 OR
                state_department ILIKE $1
            )`;
            params.push(`%${search}%`);
        }
        
        query += ` ORDER BY ministry, state_department, agency_name`;
        
        const result = await pool.query(query, params);
        
        res.status(200).json({
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching agencies for public:', error);
        res.status(500).json({ 
            error: 'Failed to fetch agencies', 
            details: error.message 
        });
    }
});

/**
 * @route GET /api/public/ministries
 * @description Ministries and optional departments/directorates (for self-registration; no auth).
 * @query withDepartments=1 — nest departments under each ministry (same shape as GET /api/ministries)
 * @query withSections=1 — when withDepartments=1, include sections/directorates under each department
 */
router.get('/ministries', async (req, res) => {
    try {
        const withDeps = req.query.withDepartments === '1' || req.query.withDepartments === 'true';
        const withSections = req.query.withSections === '1' || req.query.withSections === 'true';
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'ministries'
            );
        `);
        if (!tableCheck.rows[0]?.exists) {
            return res.status(200).json(withDeps ? [] : []);
        }
        if ((process.env.DB_TYPE || 'postgresql') !== 'postgresql') {
            return res.status(501).json({ message: 'Ministries catalog requires PostgreSQL.' });
        }
        const r = await pool.query(
            `SELECT "ministryId", name, alias, voided, "createdAt", "updatedAt", "userId"
             FROM ministries
             WHERE voided = false
             ORDER BY name`
        );
        const ministries = r.rows || [];
        if (!withDeps) {
            return res.status(200).json(ministries);
        }
        const dr = await pool.query(
            `SELECT d."departmentId", d.name, d.alias, d."ministryId", d.voided, d."createdAt", d."updatedAt"
             FROM departments d
             WHERE (d.voided IS NULL OR d.voided = false)
             ORDER BY d.name`
        );
        const depts = dr.rows || [];
        let sectionsByDept = new Map();
        if (withSections) {
            const sr = await pool.query(
                `SELECT s."sectionId", s.name, s.alias, s."departmentId", s.voided, s."createdAt", s."updatedAt"
                 FROM sections s
                 WHERE (s.voided IS NULL OR s.voided = false)
                 ORDER BY s.name`
            );
            const sections = sr.rows || [];
            sectionsByDept = sections.reduce((acc, section) => {
                const depId = section.departmentId;
                if (depId == null) return acc;
                if (!acc.has(depId)) acc.set(depId, []);
                acc.get(depId).push(section);
                return acc;
            }, new Map());
        }
        const byMin = new Map();
        ministries.forEach((m) => byMin.set(m.ministryId, { ...m, departments: [] }));
        depts.forEach((d) => {
            if (d.ministryId != null && byMin.has(d.ministryId)) {
                const deptPayload = withSections
                    ? { ...d, sections: sectionsByDept.get(d.departmentId) || [] }
                    : d;
                byMin.get(d.ministryId).departments.push(deptPayload);
            }
        });
        return res.status(200).json(Array.from(byMin.values()));
    } catch (error) {
        console.error('Error fetching public ministries:', error);
        res.status(500).json({ error: 'Failed to fetch ministries', details: error.message });
    }
});

module.exports = router;

