// src/routes/metadataRoutes.js

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { sqlMachakosDepartmentPredicate } = require('../utils/metadataOrgScope');

// Import sub-routers from the new /metadata folder
const departmentRouter = require('./metadata/departmentRoutes');
const financialYearRouter = require('./metadata/financialYearRoutes');
const programRouter = require('./metadata/programRoutes');
const subProgramRouter = require('./metadata/subProgramRoutes');
const countyRouter = require('./metadata/countyRoutes');
const subcountyRouter = require('./metadata/subcountyRoutes');
const wardRouter = require('./metadata/wardRoutes');
const projectCategoryRouter = require('./metadata/projectCategoryRoutes');
const sectionRouter = require('./metadata/sectionRoutes'); // <-- CORRECTED: Added this import

// Mount sub-routers under their respective paths
router.use('/departments', departmentRouter);
router.use('/financialyears', financialYearRouter);
router.use('/programs', programRouter);
router.use('/subprograms', subProgramRouter);
router.use('/counties', countyRouter);
router.use('/subcounties', subcountyRouter);
router.use('/wards', wardRouter);
router.use('/projectcategories', projectCategoryRouter);
router.use('/sections', sectionRouter); // <-- CORRECTED: Mounted the sectionRouter

/**
 * @route GET /api/metadata/import-cache
 * @description Get all metadata needed for import validation (optimized, names only)
 * @access Private
 * This endpoint returns lightweight metadata for client-side caching and comparison
 */
router.get('/import-cache', async (req, res) => {
    try {
        const startTime = Date.now();
        
        const orgPred = sqlMachakosDepartmentPredicate('d', 'm');
        const [deptRes, wardsRes, subRes, fyRes, budgetRes] = await Promise.all([
            pool.query(`
                SELECT d.name, d.alias
                FROM departments d
                LEFT JOIN ministries m ON m."ministryId" = d."ministryId"
                WHERE COALESCE(d.voided::text, '0') IN ('0', 'false', 'f')
                  AND (${orgPred})
            `),
            pool.query('SELECT name FROM wards WHERE COALESCE(voided, false) = false'),
            pool.query('SELECT name FROM subcounties WHERE COALESCE(voided, false) = false'),
            pool.query('SELECT "finYearName" AS "finYearName" FROM financialyears WHERE COALESCE(voided, false) = false'),
            pool.query('SELECT "budgetName" AS "budgetName" FROM budgets WHERE COALESCE(voided, false) = false'),
        ]);
        const departments = deptRes.rows;
        const wards = wardsRes.rows;
        const subcounties = subRes.rows;
        const financialYears = fyRes.rows;
        const budgets = budgetRes.rows;
        
        const queryTime = Date.now() - startTime;
        console.log(`Metadata cache query took ${queryTime}ms`);
        
        res.json({
            departments: departments.map(d => ({ name: d.name, alias: d.alias || '' })),
            wards: wards.map(w => w.name),
            subcounties: subcounties.map(s => s.name),
            financialYears: financialYears.map(fy => fy.finYearName),
            budgets: budgets.map(b => b.budgetName),
            cachedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching metadata cache:', error);
        res.status(500).json({ message: 'Error fetching metadata cache', error: error.message });
    }
});

module.exports = router;