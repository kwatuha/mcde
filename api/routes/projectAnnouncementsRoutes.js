const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');

// ==================== PROJECT ANNOUNCEMENTS MANAGEMENT ====================

/**
 * @route GET /api/project-announcements
 * @description Get all project announcements (admin view)
 * @access Protected - requires project_announcements.read OR public_content.approve
 */
router.get('/', auth, privilege(['project_announcements.read', 'public_content.approve'], { anyOf: true }), async (req, res) => {
    try {
        const { category, status, page = 1, limit = 20, search } = req.query;
        
        let whereConditions = ['voided = 0'];
        const queryParams = [];
        
        if (category && category !== 'All') {
            whereConditions.push('category = ?');
            queryParams.push(category);
        }
        
        if (status && status !== 'All') {
            whereConditions.push('status = ?');
            queryParams.push(status);
        }
        
        if (search) {
            whereConditions.push('(title LIKE ? OR description LIKE ? OR content LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
                approved_for_public,
                approved_by,
                approved_at,
                approval_notes,
                revision_requested,
                revision_notes,
                revision_requested_by,
                revision_requested_at,
                revision_submitted_at,
                created_by,
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
            details: error.message
        });
    }
});

/**
 * @route GET /api/project-announcements/:id
 * @description Get a specific announcement by ID
 * @access Protected - requires project_announcements.read OR public_content.approve
 */
router.get('/:id', auth, privilege(['project_announcements.read', 'public_content.approve'], { anyOf: true }), async (req, res) => {
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
                created_by,
                created_at,
                updated_at
            FROM project_announcements
            WHERE id = ? AND voided = 0
        `;
        
        const [announcements] = await pool.query(query, [id]);
        
        if (announcements.length === 0) {
            return res.status(404).json({ error: 'Announcement not found' });
        }
        
        res.json(announcements[0]);
    } catch (error) {
        console.error('Error fetching announcement:', error);
        res.status(500).json({ 
            error: 'Failed to fetch announcement',
            details: error.message
        });
    }
});

/**
 * @route POST /api/project-announcements
 * @description Create a new project announcement
 * @access Protected
 */
router.post('/', auth, privilege(['project_announcements.create']), async (req, res) => {
    try {
        const {
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
            imageUrl,
            attendees,
            maxAttendees
        } = req.body;
        
        const userId = req.user?.id || req.user?.userId;
        
        if (!title || !description || !content || !category || !type || 
            !date || !time || !location || !organizer) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const query = `
            INSERT INTO project_announcements (
                title, description, content, category, type,
                date, time, location, organizer, status, priority,
                image_url, attendees, max_attendees, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            title, description, content, category, type,
            date, time, location, organizer,
            status || 'Upcoming', priority || 'Medium',
            imageUrl || null, attendees || 0, maxAttendees || 0,
            userId
        ]);
        
        res.status(201).json({
            message: 'Announcement created successfully',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ 
            error: 'Failed to create announcement',
            details: error.message
        });
    }
});

/**
 * @route PUT /api/project-announcements/:id
 * @description Update a project announcement
 * @access Protected
 */
router.put('/:id', auth, privilege(['project_announcements.update']), async (req, res) => {
    try {
        const { id } = req.params;
        const {
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
            imageUrl,
            attendees,
            maxAttendees
        } = req.body;
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (content !== undefined) { updates.push('content = ?'); values.push(content); }
        if (category !== undefined) { updates.push('category = ?'); values.push(category); }
        if (type !== undefined) { updates.push('type = ?'); values.push(type); }
        if (date !== undefined) { updates.push('date = ?'); values.push(date); }
        if (time !== undefined) { updates.push('time = ?'); values.push(time); }
        if (location !== undefined) { updates.push('location = ?'); values.push(location); }
        if (organizer !== undefined) { updates.push('organizer = ?'); values.push(organizer); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
        if (imageUrl !== undefined) { updates.push('image_url = ?'); values.push(imageUrl); }
        if (attendees !== undefined) { updates.push('attendees = ?'); values.push(attendees); }
        if (maxAttendees !== undefined) { updates.push('max_attendees = ?'); values.push(maxAttendees); }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(id);
        
        const query = `
            UPDATE project_announcements 
            SET ${updates.join(', ')}
            WHERE id = ? AND voided = 0
        `;
        
        await pool.query(query, values);
        
        res.json({ message: 'Announcement updated successfully' });
    } catch (error) {
        console.error('Error updating announcement:', error);
        res.status(500).json({ 
            error: 'Failed to update announcement',
            details: error.message
        });
    }
});

/**
 * @route DELETE /api/project-announcements/:id
 * @description Soft delete a project announcement
 * @access Protected
 */
/**
 * @route PUT /api/project-announcements/:id/approval
 * @description Approve, revoke, or request revision for a project announcement
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

        // Build update query dynamically
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
            // Convert ISO string to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
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
            UPDATE project_announcements
            SET ${updateFields.join(', ')}
            WHERE id = ? AND voided = 0
        `;

        const [result] = await pool.query(query, updateValues);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Announcement not found' });
        }

        let message = 'Announcement updated successfully';
        if (revision_requested) {
            message = 'Revision requested successfully';
        } else if (approved_for_public !== undefined) {
            message = `Announcement ${approved_for_public ? 'approved' : 'revoked'} for public viewing`;
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

router.delete('/:id', auth, privilege(['project_announcements.delete']), async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = 'UPDATE project_announcements SET voided = 1 WHERE id = ?';
        await pool.query(query, [id]);
        
        res.json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({ 
            error: 'Failed to delete announcement',
            details: error.message
        });
    }
});

module.exports = router;

