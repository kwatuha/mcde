// src/routes/milestoneActivityRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const DB_TYPE = process.env.DB_TYPE || 'mysql';

// GET all activities for a specific milestone
router.get('/by-milestone/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;
    try {
        let query;
        let params;
        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT a.*, ma."milestoneId"
                FROM activities a
                JOIN milestone_activities ma ON a."activityId" = ma."activityId"
                WHERE ma."milestoneId" = $1 AND a.voided = false
            `;
            params = [milestoneId];
        } else {
            query = `
                SELECT a.*, ma.milestoneId
                FROM activities a
                JOIN milestone_activities ma ON a.activityId = ma.activityId
                WHERE ma.milestoneId = ? AND a.voided = 0
            `;
            params = [milestoneId];
        }
        const result = await pool.execute(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || []) : (Array.isArray(result) ? result[0] : []);
        res.status(200).json(rows);
    } catch (error) {
        // If it's a "table doesn't exist" error (MySQL error code 1146 or PostgreSQL error 42P01), return empty array instead of error
        if (error.code === 'ER_NO_SUCH_TABLE' || error.code === '42P01' || error.message.includes("doesn't exist") || error.message.includes("does not exist")) {
            console.warn('milestone_activities table does not exist, returning empty array');
            return res.status(200).json([]);
        }
        console.error('Error fetching milestone activities:', error);
        res.status(500).json({ message: 'Error fetching milestone activities', error: error.message });
    }
});

// GET all milestone-activity links for a given activity
router.get('/by-activity/:activityId', async (req, res) => {
    const { activityId } = req.params;
    try {
        let query;
        let params;
        if (DB_TYPE === 'postgresql') {
            query = 'SELECT * FROM milestone_activities WHERE "activityId" = $1';
            params = [activityId];
        } else {
            query = 'SELECT * FROM milestone_activities WHERE activityId = ?';
            params = [activityId];
        }
        const result = await pool.execute(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || []) : (Array.isArray(result) ? result[0] : []);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching milestone-activity links by activity ID:', error);
        res.status(500).json({ message: 'Error fetching milestone-activity links', error: error.message });
    }
});

// POST a new link between a milestone and an activity
router.post('/', async (req, res) => {
    const { milestoneId, activityId } = req.body;
    try {
        if (DB_TYPE === 'postgresql') {
            const maxIdRes = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM milestone_activities');
            const nextId = Number(maxIdRes.rows?.[0]?.next_id || 1);
            const insertRes = await pool.query(
                'INSERT INTO milestone_activities (id, "milestoneId", "activityId", voided) VALUES ($1, $2, $3, 0) RETURNING id',
                [nextId, milestoneId, activityId]
            );
            return res.status(201).json({ id: insertRes.rows?.[0]?.id || nextId, milestoneId, activityId });
        }
        const [result] = await pool.query('INSERT INTO milestone_activities (milestoneId, activityId) VALUES (?, ?)', [milestoneId, activityId]);
        return res.status(201).json({ id: result.insertId, milestoneId, activityId });
    } catch (error) {
        console.error('Error creating milestone activity link:', error);
        res.status(500).json({ message: 'Error creating milestone activity link', error: error.message });
    }
});

// DELETE a link between a milestone and an activity
router.delete('/:milestoneId/:activityId', async (req, res) => {
    const { milestoneId, activityId } = req.params;
    try {
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                'DELETE FROM milestone_activities WHERE "milestoneId" = $1 AND "activityId" = $2',
                [milestoneId, activityId]
            );
            if (result.rowCount > 0) {
                return res.status(204).send();
            }
            return res.status(404).json({ message: 'Milestone-Activity link not found' });
        }
        const [result] = await pool.query('DELETE FROM milestone_activities WHERE milestoneId = ? AND activityId = ?', [milestoneId, activityId]);
        if (result.affectedRows > 0) {
            return res.status(204).send();
        }
        return res.status(404).json({ message: 'Milestone-Activity link not found' });
    } catch (error) {
        console.error('Error deleting milestone activity link:', error);
        res.status(500).json({ message: 'Error deleting milestone activity link', error: error.message });
    }
});

module.exports = router;