/**
 * @file Configuration settings for the application.
 * This file centralizes default map coordinates, resource types, and all application routes,
 * making them easy to modify for different deployments.
 */

// Default map center coordinates for initial load (e.g., Nairobi, Kenya)
export const INITIAL_MAP_POSITION = [-1.286389, 36.817223];

// Default county configuration for hierarchical filtering
export const DEFAULT_COUNTY = {
    countyId: null, // Resolved by name where an ID is still needed.
    name: 'Machakos',
    code: 'MKS'
};

// Default sub-county configuration for initial chart loading
export const DEFAULT_SUBCOUNTY = {
    subcountyId: 1, // Default sub-county ID (e.g., Kitui Central)
    name: 'Kitui Central',
    code: 'KIT_CENTRAL'
};

// Define the available resource types for the dropdowns
export const RESOURCE_TYPES = [
    { value: 'projects', label: 'Projects' },
    { value: 'participants', label: 'Participants' },
    { value: 'poles', label: 'Poles' },
    // Add other resource types here specific to a county or client
];

// NEW: Project types with default icon URLs.
// You can replace these with custom icon URLs for a better visual representation.
export const PROJECT_TYPES = [
    { value: 'all', label: 'All Projects', icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
    { value: 'hospitals', label: 'Hospitals', icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' },
    { value: 'water_projects', label: 'Water Projects', icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' },
    { value: 'classrooms', label: 'Classrooms', icon: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png' },
    { value: 'offices', label: 'Offices', icon: 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png' },
    { value: 'roads', label: 'Roads', icon: 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png' },
    { value: 'schools', label: 'Schools', icon: 'http://maps.google.com/mapfiles/ms/icons/pink-dot.png' },
];

// --- Define application routes in a centralized object ---
export const ROUTES = {
    // Top-level routes
    LOGIN: '/login',
    FORCE_PASSWORD_CHANGE: '/force-password-change',
    HELP_SUPPORT: '/help-support',
    DASHBOARD: '/',
    
    // NEW: Contractor-specific route
    CONTRACTOR_DASHBOARD: '/contractor-dashboard',
    
    // NEW: Administrative route for managing contractors
    CONTRACTOR_MANAGEMENT: '/contractor-management',
    CONTRACTOR_TYPES: '/contractor-types',
    
    // NEW: Admin dashboard route
    ADMIN: '/admin',

    // Main layout routes
    RAW_DATA: '/raw-data',
    BENEFICIARY_REGISTRY: '/beneficiary-registry',
    PROJECTS: '/projects',
    /** Cross-project implementation readiness workbench; drills into Project Details > Implementation Plan. */
    PROJECT_IMPLEMENTATION_PLANS: '/projects/implementation-plans',
    /** Cross-project registry: documents grouped by project (sidebar under Projects). */
    PROJECT_DOCUMENTS_BY_PROJECT: '/projects/documents-by-project',
    /** CIMES-style cross-project milestone target list. */
    PROJECT_MILESTONES: '/projects/milestones',
    /** Project team members by project (sidebar under Projects). */
    PROJECT_TEAMS: '/projects/teams',
    /** Project-wide status/progress updates screen. */
    PROJECT_STATUS: '/projects/status',
    /** Monitoring hub linking to status, documents, evaluation, and feedback (sidebar under Monitoring). */
    PROJECT_UPDATES: '/projects/updates',
    /** CIMES-style project monitoring records list (sidebar under Monitoring). */
    MONITORING_PROJECT_MONITORING: '/monitoring/project-monitoring',
    PMC_WARD_REPORTS: '/monitoring/pmc-ward-reports',
    WARD_ACCOUNTABILITY: '/monitoring/ward-accountability',
    PROJECT_PARTNERS: '/partners',
    PROCUREMENT: '/procurement',
    /** Completed procurements (handed off to contractor; audit trail on project). */
    PROCUREMENT_PROCURED_PROJECTS: '/procurement/procured-projects',
    /** Budget lines awaiting registry project creation before procurement. */
    PROCUREMENT_BUDGET_ITEMS: '/procurement/budget-items',
    /** Catalog of workflow stages for procurement (sidebar under Procurement). */
    PROCUREMENT_STAGES: '/procurement-stages',
    /** Link registry planning activities to projects (Projects sidebar). */
    PROJECT_PLANNING_ACTIVITY_LINKS: '/projects/planning-activity-links',
    /** Link registry planning risks to projects (Projects sidebar). */
    PROJECT_PLANNING_RISK_LINKS: '/projects/planning-risk-links',
    /** Project evaluation grid → M&E CSV export (data_compete). */
    PROJECT_EVALUATION: '/projects/evaluation',
    /** Public feedback linked to projects, grouped by project (optional direct URL; not in main ribbon). */
    PROJECT_FEEDBACK_BY_PROJECT: '/projects/feedback-by-project',
    /** Public certificate verification (no login); same path when opened from the Projects menu while signed in. */
    VERIFY_CERTIFICATE: '/verify-certificate',
    /** Curated index linking to existing report and analytics screens. */
    REPORTS_HUB: '/reports-hub',
    REPORTS: '/reports',
    REPORT_LIBRARY: '/report-library',
    COUNTY_OPERATIONS_REPORT: '/county-operations-report',
    APR_REPORTS: '/apr-reports',
    REPORTING_TEMPLATE: '/reporting-template',
    PENDING_BILLS_REPORT: '/pending-bills-report',
    BUDGET_JUSTIFICATION_REPORT: '/budget-justification-report',
    PROJECT_FINANCE_OVERVIEW_REPORT: '/project-finance-overview',
    SCHEDULED_REPORTS: '/scheduled-reports',
    /** Inspection / monitoring checklist templates and standalone visits. */
    DATA_COLLECTION_TOOLS: '/data-collection-tools',
    GIS_MAPPING: '/maps',
    GIS_DASHBOARD: '/gis-dashboard',
    PROJECT_GIS_MAP: '/project-gis-map',
    REPORTING_OVERVIEW: '/view-reports',
    REGIONAL_REPORTING: '/regional-reports',
    DEPARTMENTAL_REPORTING: '/departmental-reports',
    REGIONAL_DASHBOARD: '/regional-dashboard',
    USER_MANAGEMENT: '/user-management',
    /** Admin-only security and operations event log (sidebar under Admin). */
    AUDIT_TRAIL: '/audit-trail',
    STRATEGIC_PLANNING: '/strategic-planning',
    CIDP_PILLARS: '/planning/cidp-pillars',
    PLANNING_CIDP_PERIODS: '/planning/cidp-periods',
    PLANNING_ADP_PERIODS: '/planning/adp-periods',
    ADP_IMPLEMENTATION: '/planning/adp-implementation',
    RRI_PROGRAMMES: '/planning/rri-programmes',
    RRI_PROGRAMME_DETAIL: '/planning/rri-programmes/:programmeId',
    CIDP_PROGRAMME_PROGRESS: '/planning/cidp-programme-progress',
    ADP_PROGRAMME_PROGRESS: '/planning/adp-programme-progress',
    COUNTY_PLANNING_OVERVIEW: '/planning/county-overview',
    BUDGET_TRACEABILITY: '/planning/budget-traceability',
    PLANNING_PROGRAMMES: '/planning/programmes',
    PLANNING_SECTOR_LIST: '/planning/sector-list',
    PLANNING_BUDGET_ALLOCATION: '/planning/budget-allocation',
    PLANNING_INDICATORS: '/planning/indicators',
    /** Measurable activity catalog (linked to KPIs / indicators) for projects & M&E. */
    PLANNING_PROJECT_ACTIVITIES: '/planning/project-activities',
    /** Standard risk register entries for projects (code, name, description). */
    PLANNING_PROJECT_RISKS: '/planning/project-risks',
    /** Indicator / milestone reporting cadence (CIMES-aligned catalog). */
    PLANNING_REPORTING_FREQUENCY: '/planning/reporting-frequency',
    METADATA_MANAGEMENT: '/metadata-management',
    HR: '/hr-module',
    /** HR ribbon deep-links (query `view` synced in HrModulePage). */
    HR_EMPLOYEES: '/hr-module?view=employees',
    HR_PERSONNEL: '/hr-module?view=personnel',
    HR_JOB_GROUPS: '/hr-module?view=jobGroups',
    HR_LEAVE_TYPES: '/hr-module?view=leaveTypes',
    HR_PUBLIC_HOLIDAYS: '/hr-module?view=publicHolidays',
    WORKFLOW_MANAGEMENT: '/workflow-management',
    APPROVAL_LEVELS_MANAGEMENT: '/approval-levels-management', // ✨ NEW: Add the approval levels management route
    AI_USAGE: '/ai-usage',
    FEEDBACK_MANAGEMENT: '/feedback-management', // ✨ NEW: Public feedback management route
    ABSORPTION_REPORT: '/absorption-report', // ✨ NEW: Absorption report route
    PERFORMANCE_MANAGEMENT_REPORT: '/performance-management-report', // ✨ NEW: Performance Management report route
    CAPR_REPORT: '/capr-report', // ✨ NEW: CAPR report route
    QUARTERLY_IMPLEMENTATION_REPORT: '/quarterly-implementation-report', // ✨ NEW: Quarterly Implementation report route
    YEARLY_TRENDS_REPORT: '/yearly-trends-report',
    STATUS_REPORT: '/status-report',
    COUNTY_PROPOSED_PROJECTS: '/county-proposed-projects', // ✨ NEW: Proposed Projects management route
    PROJECT_ANNOUNCEMENTS: '/project-announcements', // ✨ NEW: Project Announcements management route
    PUBLIC_APPROVAL: '/public-approval', // ✨ NEW: Public Content Approval management route
    /** Citizen feedback review queue & analytics (sidebar under Public). */
    PUBLIC_FEEDBACK_MODERATION: '/public-feedback-moderation',
    BUDGET_MANAGEMENT: '/budget-management', // ✨ NEW: Budget Management route
    PROJECT_TYPES: '/project-types', // ✨ NEW: Project Types management route
    JOB_CATEGORIES: '/job-categories', // ✨ NEW: Job Categories management route
    SECTORS: '/sectors', // ✨ NEW: Sectors management route
    KENYA_WARDS: '/kenya-wards', // ✨ NEW: Kenya Wards management route
    SUBLOCATION_VILLAGES: '/sublocation-villages',
    AGENCIES: '/agencies', // ✨ NEW: Agencies management route
    MINISTRIES_MANAGEMENT: '/ministries-management',

    // Sub-routes with dynamic parameters
    PROJECT_DETAILS: '/projects/:projectId',
    PROJECT_GANTT_CHART: '/projects/:projectId/gantt-chart',
    PROJECT_IMPORT: '/projects/import-data',
    KDSP_PROJECT_DETAILS: '/projects/:projectId/kdsp-details',
    MAP_DATA_IMPORT: '/maps/import-data',
    STRATEGIC_PLAN_DETAILS: '/strategic-planning/:planId',
    STRATEGIC_DATA_IMPORT: '/strategic-planning/import',
    CENTRAL_IMPORT: '/data-import', // ✨ NEW: Central Import route
    NEW_DASHBOARD: '/projects-dashboard/view',
    PROJECT_ANALYTICS: '/project-analytics', // ✨ NEW: Project Analytics route
    PROJECTS_BY_ORGANIZATION: '/projects-by-organization', // ✨ NEW: Projects by organization dashboard
    SYSTEM_DASHBOARD: '/summary-statistics', // ✨ NEW: Summary Statistics route
    OPERATIONS_DASHBOARD: '/operations-dashboard', // ✨ NEW: Operations Dashboard route
    JOBS_DASHBOARD: '/jobs-dashboard', // ✨ NEW: Jobs & Impact Dashboard route
    FINANCE_DASHBOARD: '/finance-dashboard', // ✨ NEW: Finance Dashboard route
    FINANCE_PAYMENT_CERTIFICATES: '/finance/payment-certificates',
    FINANCE_PAYMENT_LIST: '/finance/payment-list',
    FINANCE_FUNDING_SOURCES_REPORT: '/finance/funding-sources-report',
    PROJECT_BY_STATUS_DASHBOARD: '/project-by-status-dashboard', // ✨ NEW: Project By Status Dashboard route
    PROJECT_BY_SECTOR_DASHBOARD: '/project-by-sector-dashboard',
    PROJECTS_UPLOAD_LOG: '/data-upload-log',
    REPORTING_DASHBOARD: '/reporting-dashboard', // ✨ NEW: Reporting Dashboard route
};