const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');

/**
 * @route GET /api/citizen-proposals
 * @description Get all citizen proposals (admin view - shows all, including unapproved)
 * @access Protected - requires public_content.approve privilege (or admin role)
 */
router.get('/', auth, async (req, res) => {
    // Check if user is admin or has public_content.approve privilege
    const isAdmin = privilege.isAdminLike(req.user);
    const hasPrivilege = req.user?.privileges?.includes('public_content.approve') || 
                        req.user?.privileges?.includes('feedback.respond');
    
    if (!isAdmin && !hasPrivilege) {
        return res.status(403).json({ 
            error: 'Access denied. You do not have the necessary privileges to perform this action.' 
        });
    }
    
    try {
        const { status, category, page = 1, limit = 20, search } = req.query;
        
        let whereConditions = ['voided = 0'];
        const queryParams = [];
        
        if (status && status !== 'all') {
            whereConditions.push('status = ?');
            queryParams.push(status);
        }
        
        if (category && category !== 'all') {
            whereConditions.push('category = ?');
            queryParams.push(category);
        }
        
        if (search) {
            whereConditions.push('(title LIKE ? OR description LIKE ? OR proposer_name LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
                approved_for_public,
                approved_by,
                approved_at,
                approval_notes,
                revision_requested,
                revision_notes,
                revision_requested_by,
                revision_requested_at,
                revision_submitted_at,
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
            details: error.message
        });
    }
});

/**
 * @route PUT /api/citizen-proposals/:id/approval
 * @description Approve, revoke, or request revision for a citizen proposal
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
            UPDATE citizen_proposals
            SET ${updateFields.join(', ')}
            WHERE id = ? AND voided = 0
        `;

        const [result] = await pool.query(query, updateValues);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Proposal not found' });
        }

        let message = 'Proposal updated successfully';
        if (revision_requested) {
            message = 'Revision requested successfully';
        } else if (approved_for_public !== undefined) {
            message = `Proposal ${approved_for_public ? 'approved' : 'revoked'} for public viewing`;
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

module.exports = router;

