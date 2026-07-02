const express = require('express');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const engineerWorkspace = require('../services/engineerWorkspaceService');

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
    ],
    { anyOf: true }
);

router.get('/workspace', canAccess, async (req, res) => {
    try {
        const { search, limit } = req.query;
        const data = await engineerWorkspace.getEngineerWorkspace(req.user, {
            search: search || '',
            limit: limit ? Number(limit) : 100,
        });
        res.json(data);
    } catch (error) {
        console.error('engineer workspace:', error);
        res.status(500).json({ message: error.message || 'Failed to load engineer workspace' });
    }
});

router.get('/workspace/progress-photos', canAccess, async (req, res) => {
    try {
        const { projectId, status, limit } = req.query;
        const data = await engineerWorkspace.getEngineerProgressPhotos(req.user, {
            projectId: projectId || undefined,
            status: status || undefined,
            limit: limit ? Number(limit) : 120,
        });
        res.json(data);
    } catch (error) {
        console.error('engineer workspace progress photos:', error);
        res.status(500).json({ message: error.message || 'Failed to load progress photos' });
    }
});

module.exports = router;
