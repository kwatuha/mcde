const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');

// ==================== COUNTY PROPOSED PROJECTS MANAGEMENT ====================

// Helper function to format dates to YYYY-MM-DD format (extract date part from ISO datetime strings)
const formatDate = (dateValue) => {
    if (!dateValue) return null;
    if (typeof dateValue === 'string') {
        // If it's an ISO datetime string, extract just the date part
        if (dateValue.includes('T')) {
            return dateValue.split('T')[0];
        }
        // If it's already in YYYY-MM-DD format, return as is
        return dateValue;
    }
    return null;
};

/**
 * @route GET /api/county-proposed-projects
 * @description Get all county proposed projects (admin view)
 * @access Protected - requires county_proposed_projects.read OR public_content.approve
 */
router.get('/', auth, privilege(['county_proposed_projects.read', 'public_content.approve'], { anyOf: true }), async (req, res) => {
    try {
        const { category, status, priority, page = 1, limit = 20, search } = req.query;
        
        let whereConditions = ['cpp.voided = 0'];
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
        
        if (search) {
            whereConditions.push('(cpp.title LIKE ? OR cpp.description LIKE ? OR cpp.location LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;
        
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM county_proposed_projects cpp WHERE ${whereClause}`;
        const [countResult] = await pool.query(countQuery, queryParams);
        const total = countResult[0].total;
        
        // Get projects
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
                cpp.approved_for_public,
                cpp.approved_by,
                cpp.approved_at,
                cpp.approval_notes,
                cpp.revision_requested,
                cpp.revision_notes,
                cpp.revision_requested_by,
                cpp.revision_requested_at,
                cpp.revision_submitted_at,
                cpp.created_by,
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
            details: error.message
        });
    }
});

/**
 * @route GET /api/county-proposed-projects/:id
 * @description Get a specific county proposed project by ID
 * @access Protected - requires county_proposed_projects.read OR public_content.approve
 */
router.get('/:id', auth, privilege(['county_proposed_projects.read', 'public_content.approve'], { anyOf: true }), async (req, res) => {
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
                cpp.created_by,
                cpp.created_at,
                cpp.updated_at
            FROM county_proposed_projects cpp
            WHERE cpp.id = ? AND cpp.voided = 0
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
        res.status(500).json({ 
            error: 'Failed to fetch project',
            details: error.message
        });
    }
});

/**
 * @route POST /api/county-proposed-projects
 * @description Create a new county proposed project
 * @access Protected
 */
router.post('/', auth, privilege(['county_proposed_projects.create']), async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            location,
            estimatedCost,
            justification,
            expectedBenefits,
            timeline,
            status,
            priority,
            department,
            projectManager,
            contact,
            startDate,
            endDate,
            progress,
            budgetAllocated,
            budgetUtilized,
            stakeholders,
            risks,
            milestones
        } = req.body;
        
        const userId = req.user?.id || req.user?.userId;
        
        if (!title || !description || !category || !location || !estimatedCost || 
            !justification || !expectedBenefits || !timeline || !department || 
            !projectManager || !contact) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const query = `
            INSERT INTO county_proposed_projects (
                title, description, category, location, estimated_cost,
                justification, expected_benefits, timeline, status, priority,
                department, project_manager, contact, start_date, end_date,
                progress, budget_allocated, budget_utilized, stakeholders, risks,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            title, description, category, location, estimatedCost,
            justification, expectedBenefits, timeline, 
            status || 'Planning', priority || 'Medium',
            department, projectManager, contact, formatDate(startDate), formatDate(endDate),
            progress || 0, budgetAllocated || 0, budgetUtilized || 0,
            stakeholders ? JSON.stringify(stakeholders) : null,
            risks ? JSON.stringify(risks) : null,
            userId
        ]);
        
        const projectId = result.insertId;
        
        // Insert milestones if provided
        if (milestones && Array.isArray(milestones) && milestones.length > 0) {
            const milestoneQuery = `
                INSERT INTO county_proposed_project_milestones 
                (project_id, name, description, target_date, completed, sequence_order)
                VALUES ?
            `;
            const milestoneValues = milestones.map((m, index) => [
                projectId,
                m.name,
                m.description || null,
                formatDate(m.target_date),
                m.completed || false,
                m.sequence_order || index + 1
            ]);
            await pool.query(milestoneQuery, [milestoneValues]);
        }
        
        res.status(201).json({
            message: 'Project created successfully',
            id: projectId
        });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ 
            error: 'Failed to create project',
            details: error.message
        });
    }
});

/**
 * @route PUT /api/county-proposed-projects/:id
 * @description Update a county proposed project
 * @access Protected
 */
router.put('/:id', auth, privilege(['county_proposed_projects.update']), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            category,
            location,
            estimatedCost,
            justification,
            expectedBenefits,
            timeline,
            status,
            priority,
            department,
            projectManager,
            contact,
            startDate,
            endDate,
            progress,
            budgetAllocated,
            budgetUtilized,
            stakeholders,
            risks,
            milestones
        } = req.body;
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (category !== undefined) { updates.push('category = ?'); values.push(category); }
        if (location !== undefined) { updates.push('location = ?'); values.push(location); }
        if (estimatedCost !== undefined) { updates.push('estimated_cost = ?'); values.push(estimatedCost); }
        if (justification !== undefined) { updates.push('justification = ?'); values.push(justification); }
        if (expectedBenefits !== undefined) { updates.push('expected_benefits = ?'); values.push(expectedBenefits); }
        if (timeline !== undefined) { updates.push('timeline = ?'); values.push(timeline); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
        if (department !== undefined) { updates.push('department = ?'); values.push(department); }
        if (projectManager !== undefined) { updates.push('project_manager = ?'); values.push(projectManager); }
        if (contact !== undefined) { updates.push('contact = ?'); values.push(contact); }
        if (startDate !== undefined) { updates.push('start_date = ?'); values.push(formatDate(startDate)); }
        if (endDate !== undefined) { updates.push('end_date = ?'); values.push(formatDate(endDate)); }
        if (progress !== undefined) { updates.push('progress = ?'); values.push(progress); }
        if (budgetAllocated !== undefined) { updates.push('budget_allocated = ?'); values.push(budgetAllocated); }
        if (budgetUtilized !== undefined) { updates.push('budget_utilized = ?'); values.push(budgetUtilized); }
        if (stakeholders !== undefined) { updates.push('stakeholders = ?'); values.push(JSON.stringify(stakeholders)); }
        if (risks !== undefined) { updates.push('risks = ?'); values.push(JSON.stringify(risks)); }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(id);
        
        const query = `
            UPDATE county_proposed_projects 
            SET ${updates.join(', ')}
            WHERE id = ? AND voided = 0
        `;
        
        await pool.query(query, values);
        
        // Update milestones if provided
        if (milestones && Array.isArray(milestones)) {
            // Delete existing milestones
            await pool.query('DELETE FROM county_proposed_project_milestones WHERE project_id = ?', [id]);
            
            // Insert new milestones
            if (milestones.length > 0) {
                const milestoneQuery = `
                    INSERT INTO county_proposed_project_milestones 
                    (project_id, name, description, target_date, completed, completed_date, sequence_order)
                    VALUES ?
                `;
                const milestoneValues = milestones.map((m, index) => [
                    id,
                    m.name,
                    m.description || null,
                    formatDate(m.target_date),
                    m.completed || false,
                    m.completed ? formatDate(m.completed_date) || null : null,
                    m.sequence_order || index + 1
                ]);
                await pool.query(milestoneQuery, [milestoneValues]);
            }
        }
        
        res.json({ message: 'Project updated successfully' });
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ 
            error: 'Failed to update project',
            details: error.message
        });
    }
});

/**
 * @route DELETE /api/county-proposed-projects/:id
 * @description Soft delete a county proposed project
 * @access Protected
 */
/**
 * @route PUT /api/county-proposed-projects/:id/approval
 * @description Approve, revoke, or request revision for a county proposed project
 * @access Protected - requires public_content.approve privilege or admin role
 */
router.put('/:id/approval', auth, async (req, res) => {
    // Check if user is admin or has public_content.approve privilege
    const isAdmin = privilege.isAdminLike(req.user);
    const hasPrivilege = req.user?.privileges?.includes('public_content.approve');
    
    if (!isAdmin && !hasPrivilege) {
        return res.status(403).json({ 
            error: 'Access denied. You do not have the necessary privileges to perform this action.' 
        });
    }
    
    try {
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

        // Build update query dynamically based on what's being updated
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
                // Convert ISO string to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
                const revisionRequestedAt = revision_requested_at ? new Date(revision_requested_at) : new Date();
                updateValues.push(revisionRequestedAt.toISOString().slice(0, 19).replace('T', ' '));
                // Reset approval when revision is requested
                updateFields.push('approved_for_public = 0');
            } else {
                // Clear revision fields
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
            // Convert ISO string to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
            const approvedAt = approved_at ? new Date(approved_at) : new Date();
            updateValues.push(approvedAt.toISOString().slice(0, 19).replace('T', ' '));
            
            // Clear revision request when approving/rejecting
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
            UPDATE county_proposed_projects
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
    } catch (error) {
        console.error('Error updating approval:', error);
        res.status(500).json({ error: 'Failed to update approval status' });
    }
});

router.delete('/:id', auth, privilege(['county_proposed_projects.delete']), async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = 'UPDATE county_proposed_projects SET voided = 1 WHERE id = ?';
        await pool.query(query, [id]);
        
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ 
            error: 'Failed to delete project',
            details: error.message
        });
    }
});

module.exports = router;

