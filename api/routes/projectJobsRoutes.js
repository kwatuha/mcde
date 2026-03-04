const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../config/db');

// NOTE: These routes assume DB_TYPE=postgresql and the existence of:
// - job_categories (id, name, description, voided, timestamps)
// - project_jobs (id, project_id, category_id, jobs_count, male_count, female_count, youth_count, voided, timestamps)

// Get job summary and breakdown for a single project
// GET /api/projects/:id/jobs  or /api/projects/:projectId/jobs (depending on parent router)
router.get('/jobs', async (req, res) => {
    // Support both :id and :projectId param names due to mergeParams routing
    const { id, projectId: paramProjectId } = req.params;
    const projectId = parseInt(id || paramProjectId, 10);

    if (isNaN(projectId)) {
        return res.status(400).json({ message: 'Invalid project ID' });
    }

    try {
        // Check if project_jobs table exists
        const tableCheckQuery = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'project_jobs'
            )
        `;
        const tableCheck = await pool.query(tableCheckQuery);
        const tableExists = tableCheck.rows?.[0]?.exists || false;

        if (!tableExists) {
            // Table doesn't exist yet, return empty result
            return res.status(200).json({
                projectId,
                summary: {
                    totalJobs: 0,
                    totalMale: 0,
                    totalFemale: 0,
                    totalYouth: 0,
                },
                jobs: [],
            });
        }

        // Summary: total jobs for project
        const summaryQuery = `
            SELECT 
                COALESCE(SUM(j.jobs_count), 0) AS total_jobs,
                COALESCE(SUM(j.male_count), 0) AS total_male,
                COALESCE(SUM(j.female_count), 0) AS total_female,
                COALESCE(SUM(j.youth_count), 0) AS total_youth
            FROM project_jobs j
            WHERE j.project_id = $1
              AND j.voided = false
        `;
        const summaryResult = await pool.query(summaryQuery, [projectId]);
        const summaryRow = summaryResult.rows?.[0] || {};

        // Breakdown by category
        const breakdownQuery = `
            SELECT 
                j.id,
                j.project_id,
                j.category_id,
                c.name AS category_name,
                c.description AS category_description,
                j.jobs_count,
                j.male_count,
                j.female_count,
                j.youth_count,
                j.created_at
            FROM project_jobs j
            LEFT JOIN job_categories c ON j.category_id = c.id
            WHERE j.project_id = $1
              AND j.voided = false
            ORDER BY j.created_at DESC, c.name ASC, j.id ASC
        `;
        const breakdownResult = await pool.query(breakdownQuery, [projectId]);
        const rows = breakdownResult.rows || [];

        return res.status(200).json({
            projectId,
            summary: {
                totalJobs: parseInt(summaryRow.total_jobs, 10) || 0,
                totalMale: parseInt(summaryRow.total_male, 10) || 0,
                totalFemale: parseInt(summaryRow.total_female, 10) || 0,
                totalYouth: parseInt(summaryRow.total_youth, 10) || 0,
            },
            jobs: rows,
        });
    } catch (error) {
        console.error('Error fetching project jobs:', error);
        // Return empty result instead of error to prevent frontend crash
        return res.status(200).json({
            projectId,
            summary: {
                totalJobs: 0,
                totalMale: 0,
                totalFemale: 0,
                totalYouth: 0,
            },
            jobs: [],
        });
    }
});

// Create a new job record for a project
// POST /api/projects/:id/jobs  or /api/projects/:projectId/jobs
router.post('/jobs', async (req, res) => {
    // Support both :id and :projectId param names due to mergeParams routing
    const { id, projectId: paramProjectId } = req.params;
    const projectId = parseInt(id || paramProjectId, 10);
    const { categoryId, jobsCount, maleCount, femaleCount, youthCount } = req.body || {};

    if (isNaN(projectId)) {
        return res.status(400).json({ message: 'Invalid project ID' });
    }
    if (!categoryId) {
        return res.status(400).json({ message: 'Job category is required' });
    }
    const jobsCountInt = parseInt(jobsCount, 10);
    if (!Number.isFinite(jobsCountInt) || jobsCountInt <= 0) {
        return res.status(400).json({ message: 'Jobs count must be a positive number' });
    }

    try {
        const insertQuery = `
            INSERT INTO project_jobs (
                project_id,
                category_id,
                jobs_count,
                male_count,
                female_count,
                youth_count,
                voided
            )
            VALUES ($1, $2, $3, $4, $5, $6, false)
            RETURNING 
                id,
                project_id,
                category_id,
                jobs_count,
                male_count,
                female_count,
                youth_count,
                created_at,
                updated_at,
                voided
        `;

        const result = await pool.query(insertQuery, [
            projectId,
            categoryId,
            jobsCountInt,
            maleCount != null && maleCount !== '' ? parseInt(maleCount, 10) : null,
            femaleCount != null && femaleCount !== '' ? parseInt(femaleCount, 10) : null,
            youthCount != null && youthCount !== '' ? parseInt(youthCount, 10) : null,
        ]);

        const row = result.rows?.[0];
        return res.status(201).json({
            message: 'Project job record created successfully',
            job: row,
        });
    } catch (error) {
        console.error('Error creating project job record:', error);
        return res.status(500).json({ message: 'Error creating project job record', error: error.message });
    }
});

// (Optional) CRUD for job_categories could be added later under /api/job-categories

module.exports = router;

