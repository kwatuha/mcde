const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/authenticate');

function isPostgresDb() {
    return (process.env.DB_TYPE || 'mysql') === 'postgresql';
}

/** node-pg returns { rows }; mysql2 returns [rows, fields] — moderation routes must use rows here. */
function rowsFrom(result) {
    if (!result) return [];
    if (Array.isArray(result.rows)) return result.rows;
    if (Array.isArray(result[0])) return result[0];
    return [];
}

// ==================== MODERATION MANAGEMENT ====================

/**
 * @route GET /api/moderate/queue
 * @description Get public feedback items pending moderation
 * @access Protected (Admin/Moderator)
 */
router.get('/queue', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, moderation_status, moderation_reason } = req.query;
        const offset = (page - 1) * limit;

        // Build where condition based on parameters
        let whereCondition = '';
        const queryParams = [];

        console.log('API Debug - moderation_status:', moderation_status);
        console.log('API Debug - moderation_reason:', moderation_reason);

        const pg = isPostgresDb();

        // If only moderation_reason is provided, get all statuses for that reason
        if (moderation_reason && !moderation_status) {
            whereCondition = 'WHERE f.moderation_reason = ?';
            queryParams.push(moderation_reason);
        } else if (moderation_reason && moderation_status && moderation_status !== 'all') {
            whereCondition = 'WHERE f.moderation_status = ? AND f.moderation_reason = ?';
            queryParams.push(moderation_status, moderation_reason);
        } else if (moderation_status && moderation_status !== 'all') {
            whereCondition = 'WHERE f.moderation_status = ?';
            queryParams.push(moderation_status);
        } else {
            // No status filter (e.g. "All" — frontend omits param) or explicit all
            whereCondition = '';
        }

        console.log('API Debug - whereCondition:', whereCondition);
        console.log('API Debug - queryParams:', queryParams);

        const projectJoin = pg
            ? 'LEFT JOIN projects p ON f.project_id = p.project_id'
            : 'LEFT JOIN projects p ON f.project_id = p.id';
        const projectNameExpr = pg ? 'p.name AS project_name' : 'p.projectName AS project_name';
        const userJoin = pg
            ? 'LEFT JOIN users u ON f.moderated_by = u.userid'
            : 'LEFT JOIN users u ON f.moderated_by = u.userId';
        const moderatorNameExpr = pg
            ? `(TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.lastname, ''))) AS moderator_name`
            : `CONCAT(u.firstName, ' ', u.lastName) AS moderator_name`;

        const countSelect = pg ? 'COUNT(*)::bigint AS total' : 'COUNT(*) AS total';
        const countQuery = `
            SELECT ${countSelect}
            FROM public_feedback f
            ${projectJoin}
            ${userJoin}
            ${whereCondition}
        `;
        const countRows = rowsFrom(await pool.query(countQuery, queryParams));
        const totalItems = Number(countRows[0]?.total ?? 0);

        const limitN = parseInt(limit, 10) || 10;
        const offsetN = (parseInt(page, 10) - 1) * limitN;

        const queueQuery = `
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
                f.responded_by,
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
                ${projectNameExpr},
                ${moderatorNameExpr}
            FROM public_feedback f
            ${projectJoin}
            ${userJoin}
            ${whereCondition}
            ORDER BY f.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const items = rowsFrom(await pool.query(queueQuery, [...queryParams, limitN, offsetN]));

        res.json({
            success: true,
            items,
            pagination: {
                total: totalItems,
                page: parseInt(page, 10),
                limit: limitN,
                totalPages: Math.max(1, Math.ceil(totalItems / limitN))
            }
        });
    } catch (error) {
        console.error('Error fetching moderation queue:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch moderation queue' 
        });
    }
});

/**
 * @route GET /api/moderate/statistics
 * @description Get moderation statistics
 * @access Protected (Admin/Moderator)
 */
router.get('/statistics', auth, async (req, res) => {
    try {
        const pg = isPostgresDb();
        const statsQuery = `
            SELECT 
                COUNT(*) as total_feedback,
                SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN moderation_status = 'approved' THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN moderation_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
                SUM(CASE WHEN moderation_status = 'flagged' THEN 1 ELSE 0 END) as flagged_count
            FROM public_feedback
        `;
        const statsRows = rowsFrom(await pool.query(statsQuery));
        const stats = statsRows[0] || {};

        // Get moderation reasons breakdown
        const reasonsQuery = `
            SELECT 
                moderation_reason,
                COUNT(*) as count
            FROM public_feedback
            WHERE moderation_reason IS NOT NULL
            GROUP BY moderation_reason
            ORDER BY count DESC
        `;
        const reasons = rowsFrom(await pool.query(reasonsQuery));

        const userJoin = pg
            ? 'LEFT JOIN users u ON f.moderated_by = u.userid'
            : 'LEFT JOIN users u ON f.moderated_by = u.userId';
        const moderatorNameExpr = pg
            ? `(TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.lastname, ''))) AS moderator_name`
            : `CONCAT(u.firstName, ' ', u.lastName) AS moderator_name`;

        // Get recent moderation activity
        const activityQuery = `
            SELECT 
                f.id,
                f.name,
                f.subject,
                f.moderation_status,
                f.moderation_reason,
                f.moderated_at,
                ${moderatorNameExpr}
            FROM public_feedback f
            ${userJoin}
            WHERE f.moderated_at IS NOT NULL
            ORDER BY f.moderated_at DESC
            LIMIT 10
        `;
        const recentActivity = rowsFrom(await pool.query(activityQuery));

        res.json({
            success: true,
            statistics: stats,
            reasonsBreakdown: reasons,
            recentActivity
        });
    } catch (error) {
        console.error('Error fetching moderation statistics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch moderation statistics' 
        });
    }
});

/**
 * @route GET /api/moderate/analytics
 * @description Get comprehensive moderation analytics
 * @access Protected (Admin/Moderator)
 */
router.get('/analytics', auth, async (req, res) => {
    try {
        const pg = isPostgresDb();

        const trendsQuery = pg
            ? `
            SELECT 
                (moderated_at::date) AS date,
                COUNT(*) FILTER (WHERE moderation_status = 'approved') AS approved,
                COUNT(*) FILTER (WHERE moderation_status = 'rejected') AS rejected,
                COUNT(*) FILTER (WHERE moderation_status = 'flagged') AS flagged,
                COUNT(*) AS total_moderated
            FROM public_feedback 
            WHERE moderated_at >= (CURRENT_DATE - INTERVAL '30 days')
            GROUP BY (moderated_at::date)
            ORDER BY date DESC
        `
            : `
            SELECT 
                DATE(moderated_at) as date,
                COUNT(CASE WHEN moderation_status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN moderation_status = 'rejected' THEN 1 END) as rejected,
                COUNT(CASE WHEN moderation_status = 'flagged' THEN 1 END) as flagged,
                COUNT(*) as total_moderated
            FROM public_feedback 
            WHERE moderated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY DATE(moderated_at)
            ORDER BY date DESC
        `;

        const moderatorQuery = pg
            ? `
            SELECT 
                (TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.lastname, ''))) AS moderator_name,
                COUNT(*) AS total_moderated,
                COUNT(*) FILTER (WHERE f.moderation_status = 'approved') AS approved_count,
                COUNT(*) FILTER (WHERE f.moderation_status = 'rejected') AS rejected_count,
                COUNT(*) FILTER (WHERE f.moderation_status = 'flagged') AS flagged_count,
                ROUND(AVG(EXTRACT(EPOCH FROM (f.moderated_at - f.created_at)) / 60.0)::numeric, 2) AS avg_response_time_minutes
            FROM public_feedback f
            JOIN users u ON f.moderated_by = u.userid
            WHERE f.moderated_at IS NOT NULL
            GROUP BY f.moderated_by, u.userid, u.firstname, u.lastname
            ORDER BY total_moderated DESC
        `
            : `
            SELECT 
                CONCAT(u.firstName, ' ', u.lastName) as moderator_name,
                COUNT(*) as total_moderated,
                COUNT(CASE WHEN f.moderation_status = 'approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN f.moderation_status = 'rejected' THEN 1 END) as rejected_count,
                COUNT(CASE WHEN f.moderation_status = 'flagged' THEN 1 END) as flagged_count,
                ROUND(AVG(TIMESTAMPDIFF(MINUTE, f.created_at, f.moderated_at)), 2) as avg_response_time_minutes
            FROM public_feedback f
            JOIN users u ON f.moderated_by = u.userId
            WHERE f.moderated_at IS NOT NULL
            GROUP BY f.moderated_by, u.firstName, u.lastName
            ORDER BY total_moderated DESC
        `;

        const volumeQuery = pg
            ? `
            SELECT 
                (created_at::date) AS date,
                COUNT(*) AS total_submitted,
                COUNT(*) FILTER (WHERE moderation_status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE moderation_status = 'approved') AS approved,
                COUNT(*) FILTER (WHERE moderation_status = 'rejected') AS rejected,
                COUNT(*) FILTER (WHERE moderation_status = 'flagged') AS flagged
            FROM public_feedback 
            WHERE created_at >= (CURRENT_DATE - INTERVAL '30 days')
            GROUP BY (created_at::date)
            ORDER BY date DESC
        `
            : `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total_submitted,
                COUNT(CASE WHEN moderation_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN moderation_status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN moderation_status = 'rejected' THEN 1 END) as rejected,
                COUNT(CASE WHEN moderation_status = 'flagged' THEN 1 END) as flagged
            FROM public_feedback 
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `;

        const ratingsQuery = `
            SELECT 
                moderation_status,
                ROUND(AVG(rating_overall_support), 2) as avg_overall_support,
                ROUND(AVG(rating_quality_of_life_impact), 2) as avg_quality_impact,
                ROUND(AVG(rating_community_alignment), 2) as avg_community_alignment,
                ROUND(AVG(rating_transparency), 2) as avg_transparency,
                ROUND(AVG(rating_feasibility_confidence), 2) as avg_feasibility_confidence,
                COUNT(*) as count
            FROM public_feedback 
            WHERE moderation_status IS NOT NULL
            GROUP BY moderation_status
        `;

        const responseTimeQuery = pg
            ? `
            SELECT 
                AVG(EXTRACT(EPOCH FROM (moderated_at - created_at)) / 3600.0) AS avg_response_hours,
                MIN(EXTRACT(EPOCH FROM (moderated_at - created_at)) / 3600.0) AS min_response_hours,
                MAX(EXTRACT(EPOCH FROM (moderated_at - created_at)) / 3600.0) AS max_response_hours,
                COUNT(*)::bigint AS total_moderated
            FROM public_feedback 
            WHERE moderated_at IS NOT NULL
        `
            : `
            SELECT 
                AVG(TIMESTAMPDIFF(HOUR, created_at, moderated_at)) as avg_response_hours,
                MIN(TIMESTAMPDIFF(HOUR, created_at, moderated_at)) as min_response_hours,
                MAX(TIMESTAMPDIFF(HOUR, created_at, moderated_at)) as max_response_hours,
                COUNT(*) as total_moderated
            FROM public_feedback 
            WHERE moderated_at IS NOT NULL
        `;

        const reasonQuery = pg
            ? `
            SELECT 
                moderation_reason,
                COUNT(*)::bigint AS count,
                ROUND((COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM public_feedback WHERE moderation_reason IS NOT NULL), 0))::numeric, 2) AS percentage
            FROM public_feedback 
            WHERE moderation_reason IS NOT NULL
            GROUP BY moderation_reason
            ORDER BY count DESC
        `
            : `
            SELECT 
                moderation_reason,
                COUNT(*) as count,
                ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM public_feedback WHERE moderation_reason IS NOT NULL)), 2) as percentage
            FROM public_feedback 
            WHERE moderation_reason IS NOT NULL
            GROUP BY moderation_reason
            ORDER BY count DESC
        `;

        const hourlyQuery = pg
            ? `
            SELECT 
                EXTRACT(HOUR FROM moderated_at)::int AS hour,
                COUNT(*)::bigint AS moderation_count
            FROM public_feedback 
            WHERE moderated_at >= (CURRENT_DATE - INTERVAL '7 days')
            GROUP BY EXTRACT(HOUR FROM moderated_at)
            ORDER BY hour
        `
            : `
            SELECT 
                HOUR(moderated_at) as hour,
                COUNT(*) as moderation_count
            FROM public_feedback 
            WHERE moderated_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY HOUR(moderated_at)
            ORDER BY hour
        `;

        const trendsResults = rowsFrom(await pool.query(trendsQuery));
        const moderatorResults = rowsFrom(await pool.query(moderatorQuery));
        const volumeResults = rowsFrom(await pool.query(volumeQuery));
        const ratingsResults = rowsFrom(await pool.query(ratingsQuery));
        const responseTimeRows = rowsFrom(await pool.query(responseTimeQuery));
        const reasonResults = rowsFrom(await pool.query(reasonQuery));
        const hourlyResults = rowsFrom(await pool.query(hourlyQuery));

        res.json({
            success: true,
            analytics: {
                moderationTrends: trendsResults,
                moderatorActivity: moderatorResults,
                volumeTrends: volumeResults,
                ratingsByStatus: ratingsResults,
                responseTimeStats: responseTimeRows[0] || {},
                reasonBreakdown: reasonResults,
                hourlyPatterns: hourlyResults
            }
        });
    } catch (error) {
        console.error('Error fetching moderation analytics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch moderation analytics' 
        });
    }
});

/**
 * @route POST /api/moderate/:feedbackId/approve
 * @description Approve a feedback item
 * @access Protected (Admin/Moderator)
 */
router.post('/:feedbackId/approve', auth, async (req, res) => {
    try {
        const { feedbackId } = req.params;
        const { moderator_notes } = req.body;
        const moderatorId = req.user.userId;

        // Update the public feedback moderation status
        const updateQuery = `
            UPDATE public_feedback 
            SET 
                moderation_status = 'approved',
                moderation_reason = NULL,
                custom_reason = NULL,
                moderator_notes = ?,
                moderated_by = ?,
                moderated_at = NOW()
            WHERE id = ?
        `;

        await pool.query(updateQuery, [moderator_notes, moderatorId, feedbackId]);

        res.json({
            success: true,
            message: 'Feedback approved successfully'
        });
    } catch (error) {
        console.error('Error approving feedback:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to approve feedback' 
        });
    }
});

/**
 * @route POST /api/moderate/:feedbackId/reject
 * @description Reject a feedback item (Permanent decision - requires justification to reopen)
 * @access Protected (Admin/Moderator)
 * @note: Rejected items are permanently hidden from public view. Reopening requires explicit justification.
 */
router.post('/:feedbackId/reject', auth, async (req, res) => {
    try {
        const { feedbackId } = req.params;
        const { moderation_reason, custom_reason, moderator_notes } = req.body;
        const moderatorId = req.user.userId;

        // Validate required fields
        if (!moderation_reason) {
            return res.status(400).json({
                success: false,
                error: 'Moderation reason is required'
            });
        }

        // Update the public feedback moderation status
        const updateQuery = `
            UPDATE public_feedback 
            SET 
                moderation_status = 'rejected',
                moderation_reason = ?,
                custom_reason = ?,
                moderator_notes = ?,
                moderated_by = ?,
                moderated_at = NOW()
            WHERE id = ?
        `;

        await pool.query(updateQuery, [
            moderation_reason, 
            custom_reason, 
            moderator_notes, 
            moderatorId, 
            feedbackId
        ]);

        res.json({
            success: true,
            message: 'Feedback rejected successfully'
        });
    } catch (error) {
        console.error('Error rejecting feedback:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reject feedback' 
        });
    }
});

/**
 * @route POST /api/moderate/:feedbackId/flag
 * @description Flag a feedback item for further review (temporary status - can be re-reviewed)
 * @access Protected (Admin/Moderator)
 */
router.post('/:feedbackId/flag', auth, async (req, res) => {
    try {
        const { feedbackId } = req.params;
        const { moderation_reason, custom_reason, moderator_notes } = req.body;
        const moderatorId = req.user.userId;

        // Update the public feedback moderation status
        const updateQuery = `
            UPDATE public_feedback 
            SET 
                moderation_status = 'flagged',
                moderation_reason = ?,
                custom_reason = ?,
                moderator_notes = ?,
                moderated_by = ?,
                moderated_at = NOW()
            WHERE id = ?
        `;

        await pool.query(updateQuery, [
            moderation_reason, 
            custom_reason, 
            moderator_notes, 
            moderatorId, 
            feedbackId
        ]);

        res.json({
            success: true,
            message: 'Feedback flagged successfully for further review'
        });
    } catch (error) {
        console.error('Error flagging feedback:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to flag feedback' 
        });
    }
});

/**
 * @route POST /api/moderate/:feedbackId/reopen
 * @description Reopen a flagged or rejected feedback item for re-review (changes status back to pending)
 * @access Protected (Admin/Moderator)
 * @note: This is primarily for flagged items, but can also be used for rejected items with proper justification
 */
router.post('/:feedbackId/reopen', auth, async (req, res) => {
    try {
        const { feedbackId } = req.params;
        const { reopen_reason, moderator_notes } = req.body;
        const moderatorId = req.user.userId;

        // First, check the current status
        const currentRows = rowsFrom(
            await pool.query('SELECT moderation_status FROM public_feedback WHERE id = ?', [feedbackId])
        );

        if (currentRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Feedback not found'
            });
        }

        const status = currentRows[0].moderation_status;

        // Update the public feedback moderation status back to pending
        const updateQuery = `
            UPDATE public_feedback 
            SET 
                moderation_status = 'pending',
                moderation_reason = NULL,
                custom_reason = ?,
                moderator_notes = ?,
                moderated_by = ?,
                moderated_at = NOW()
            WHERE id = ?
        `;

        await pool.query(updateQuery, [
            reopen_reason || `Reopened from ${status} status for re-review`,
            moderator_notes || `Reopened by moderator for further review`,
            moderatorId, 
            feedbackId
        ]);

        res.json({
            success: true,
            message: `Feedback reopened successfully from ${status} status`
        });
    } catch (error) {
        console.error('Error reopening feedback:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reopen feedback' 
        });
    }
});

/**
 * @route GET /api/moderate/:feedbackId/details
 * @description Get detailed information about a specific feedback item
 * @access Protected (Admin/Moderator)
 */
router.get('/:feedbackId/details', auth, async (req, res) => {
    try {
        const { feedbackId } = req.params;
        const pg = isPostgresDb();
        const projectJoin = pg
            ? 'LEFT JOIN projects p ON f.project_id = p.project_id'
            : 'LEFT JOIN projects p ON f.project_id = p.id';
        const projectNameExpr = pg ? 'p.name AS project_name' : 'p.projectName AS project_name';
        const userJoin = pg
            ? 'LEFT JOIN users u ON f.moderated_by = u.userid'
            : 'LEFT JOIN users u ON f.moderated_by = u.userId';
        const moderatorNameExpr = pg
            ? `(TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.lastname, ''))) AS moderator_name`
            : `CONCAT(u.firstName, ' ', u.lastName) AS moderator_name`;

        const detailsQuery = `
            SELECT 
                f.*,
                ${projectNameExpr},
                ${moderatorNameExpr}
            FROM public_feedback f
            ${projectJoin}
            ${userJoin}
            WHERE f.id = ?
        `;

        const details = rowsFrom(await pool.query(detailsQuery, [feedbackId]));

        if (details.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Feedback not found'
            });
        }

        res.json({
            success: true,
            feedback: details[0]
        });
    } catch (error) {
        console.error('Error fetching feedback details:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch feedback details' 
        });
    }
});

/**
 * @route GET /api/moderate/settings
 * @description Get moderation settings
 * @access Protected (Admin)
 */
router.get('/settings', auth, async (req, res) => {
    try {
        const settingsQuery = `
            SELECT setting_name, setting_value, description
            FROM feedback_moderation_settings
            ORDER BY setting_name
        `;
        const settings = rowsFrom(await pool.query(settingsQuery));

        // Convert to object for easier frontend consumption
        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.setting_name] = {
                value: setting.setting_value,
                description: setting.description
            };
        });

        res.json({
            success: true,
            settings: settingsObj
        });
    } catch (error) {
        console.error('Error fetching moderation settings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch moderation settings' 
        });
    }
});

/**
 * @route PUT /api/moderate/settings
 * @description Update moderation settings
 * @access Protected (Admin)
 */
router.put('/settings', auth, async (req, res) => {
    try {
        const { settings } = req.body;

        for (const [settingName, settingData] of Object.entries(settings)) {
            const updateQuery = `
                UPDATE feedback_moderation_settings 
                SET setting_value = ?, updated_at = NOW()
                WHERE setting_name = ?
            `;
            await pool.query(updateQuery, [settingData.value, settingName]);
        }

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        console.error('Error updating moderation settings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update moderation settings' 
        });
    }
});

module.exports = router;
