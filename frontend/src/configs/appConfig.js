/**
 * @file Configuration settings for the application.
 * This file centralizes default map coordinates, resource types, and all application routes,
 * making them easy to modify for different deployments.
 */

// Default map center coordinates for initial load (e.g., Nairobi, Kenya)
export const INITIAL_MAP_POSITION = [-1.286389, 36.817223];

// Default county configuration for hierarchical filtering
export const DEFAULT_COUNTY = {
    countyId: null, // Will be resolved by name if not set - defaults to Kisumu
    name: 'Kisumu',
    code: 'KSM'
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
    
    // NEW: Admin dashboard route
    ADMIN: '/admin',

    // Main layout routes
    RAW_DATA: '/raw-data',
    PROJECTS: '/projects',
    REPORTS: '/reports',
    GIS_MAPPING: '/maps',
    GIS_DASHBOARD: '/gis-dashboard',
    REPORTING_OVERVIEW: '/view-reports',
    REGIONAL_REPORTING: '/regional-reports',
    REGIONAL_DASHBOARD: '/regional-dashboard',
    USER_MANAGEMENT: '/user-management',
    STRATEGIC_PLANNING: '/strategic-planning',
    METADATA_MANAGEMENT: '/metadata-management',
    HR: '/hr-module', // New route for the HR module
    WORKFLOW_MANAGEMENT: '/workflow-management',
    APPROVAL_LEVELS_MANAGEMENT: '/approval-levels-management', // ✨ NEW: Add the approval levels management route
    FEEDBACK_MANAGEMENT: '/feedback-management', // ✨ NEW: Public feedback management route
    ABSORPTION_REPORT: '/absorption-report', // ✨ NEW: Absorption report route
    PERFORMANCE_MANAGEMENT_REPORT: '/performance-management-report', // ✨ NEW: Performance Management report route
    CAPR_REPORT: '/capr-report', // ✨ NEW: CAPR report route
    QUARTERLY_IMPLEMENTATION_REPORT: '/quarterly-implementation-report', // ✨ NEW: Quarterly Implementation report route
    COUNTY_PROPOSED_PROJECTS: '/county-proposed-projects', // ✨ NEW: Proposed Projects management route
    PROJECT_ANNOUNCEMENTS: '/project-announcements', // ✨ NEW: Project Announcements management route
    PUBLIC_APPROVAL: '/public-approval', // ✨ NEW: Public Content Approval management route
    BUDGET_MANAGEMENT: '/budget-management', // ✨ NEW: Budget Management route
    PROJECT_TYPES: '/project-types', // ✨ NEW: Project Types management route
    JOB_CATEGORIES: '/job-categories', // ✨ NEW: Job Categories management route
    SECTORS: '/sectors', // ✨ NEW: Sectors management route
    KENYA_WARDS: '/kenya-wards', // ✨ NEW: Kenya Wards management route
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
    PLANNING_PROGRAMS_GUIDE: '/planning/programs-guide',
    JOBS_DASHBOARD: '/jobs-dashboard', // ✨ NEW: Jobs & Impact Dashboard route
    FINANCE_DASHBOARD: '/finance-dashboard', // ✨ NEW: Finance Dashboard route
    PROJECT_BY_STATUS_DASHBOARD: '/project-by-status-dashboard', // ✨ NEW: Project By Status Dashboard route
    PROJECT_BY_SECTOR_DASHBOARD: '/project-by-sector-dashboard',
    PROJECTS_UPLOAD_LOG: '/data-upload-log',
    REPORTING_DASHBOARD: '/reporting-dashboard', // ✨ NEW: Reporting Dashboard route
};