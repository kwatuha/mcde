const express = require('express');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const coFinanceWorkspace = require('../services/coFinanceWorkspaceService');

const canAccess = privilege(
    [
        'project.read',
        'project.read_all',
        'project.update',
        'project.file_checklist.read',
        'payment_request.read_all',
        'payment_request.update',
        'document.read_all',
        'document.create',
        'document.read',
        'budget.read',
        'approval_levels.read',
    ],
    { anyOf: true }
);

router.get('/workspace', canAccess, async (req, res) => {
    try {
        const { search, limit, include } = req.query;
        const data = await coFinanceWorkspace.getCoFinanceWorkspace(req.user, {
            search: search || '',
            limit: limit ? Number(limit) : 120,
            include: include || undefined,
        });
        res.json(data);
    } catch (error) {
        console.error('co-finance workspace:', error);
        res.status(500).json({ message: error.message || 'Failed to load co-finance workspace' });
    }
});

module.exports = router;
