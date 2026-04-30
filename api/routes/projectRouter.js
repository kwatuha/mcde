const express = require('express');
const router = express.Router();

// Import all project-related sub-routers
const projectRoutes = require('./projectRoutes');
const projectConceptNoteRoutes = require('./projectConceptNoteRoutes');
const projectNeedsAssessmentRoutes = require('./projectNeedsAssessmentRoutes');
const projectFinancialsRoutes = require('./projectFinancialsRoutes');
const projectFyBreakdownRoutes = require('./projectFyBreakdownRoutes');
const projectSustainabilityRoutes = require('./projectSustainabilityRoutes');
const projectImplementationPlanRoutes = require('./projectImplementationPlanRoutes');
const projectMAndERoutes = require('./projectMAndERoutes');
const projectRisksRoutes = require('./projectRisksRoutes');
const projectStakeholdersRoutes = require('./projectStakeholdersRoutes');
const projectReadinessRoutes = require('./projectReadinessRoutes');
const projectHazardAssessmentRoutes = require('./projectHazardAssessmentRoutes');
const projectClimateRiskRoutes = require('./projectClimateRiskRoutes');
const projectEsohsgScreeningRoutes = require('./projectEsohsgScreeningRoutes');
const projectPdfRoutes = require('./projectPdfRoutes');
const projectAssignmentRoutes = require('./projectAssignmentRoutes');
const projectInspectionRoutes = require('./projectInspectionRoutes');
const projectFundingRoutes = require('./projectFundingRoutes');


// Mount all the individual routers under this main project router.
// The base path for all these routes is now handled by the parent app.use('/api/projects', projectRouter)
// IMPORTANT: mount specific/static paths before generic '/:id' routes from projectRoutes.
router.use('/', projectFundingRoutes);
router.use('/', projectInspectionRoutes);
router.use('/', projectRoutes);
router.use('/', projectConceptNoteRoutes);
router.use('/', projectNeedsAssessmentRoutes);
router.use('/', projectFinancialsRoutes);
router.use('/', projectFyBreakdownRoutes);
router.use('/', projectSustainabilityRoutes);
router.use('/', projectImplementationPlanRoutes);
router.use('/', projectMAndERoutes);
router.use('/', projectRisksRoutes);
router.use('/', projectStakeholdersRoutes);
router.use('/', projectReadinessRoutes);
router.use('/', projectHazardAssessmentRoutes);
router.use('/', projectClimateRiskRoutes);
router.use('/', projectEsohsgScreeningRoutes);
router.use('/', projectPdfRoutes);
// Note: Photo routes are mounted in projectRoutes.js at /:projectId/photos
router.use('/', projectAssignmentRoutes);


module.exports = router;