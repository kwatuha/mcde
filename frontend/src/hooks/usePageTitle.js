import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageTitle } from '../context/PageTitleContext';
import { ROUTES } from '../configs/appConfig';

// Comprehensive route to title mapping - matches Sidebar menu structure
const routeTitles = {
  // Dashboard routes
  '/': { title: 'Dashboard', subtitle: 'Overview & Analytics' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview & Analytics' },
  '/raw-data': { title: 'Raw Data', subtitle: 'Data Management' },
  '/projects': { title: 'Projects', subtitle: 'Project Management' },
  '/projects/documents-by-project': { title: 'Project Documents', subtitle: 'Attachments by project' },
  '/projects/milestones': { title: 'Project Milestone List', subtitle: 'Projects - milestones, targets, periods, and remarks' },
  '/projects/teams': { title: 'Project Teams', subtitle: 'Manage team members across projects' },
  '/projects/status': { title: 'Project Status', subtitle: 'Manage overall status and progress updates' },
  '/projects/updates': { title: 'Project Updates', subtitle: 'Monitoring hub for status, documents, and feedback' },
  '/monitoring/project-monitoring': {
    title: 'Project Monitoring List',
    subtitle: 'Monitoring - project activities, indicators, evidence and achieved values',
  },
  '/projects/planning-activity-links': {
    title: 'Project activity links',
    subtitle: 'Associate Planning catalog activities with projects',
  },
  '/projects/planning-risk-links': {
    title: 'Project risk links',
    subtitle: 'Associate Planning catalog risks with projects',
  },
  '/projects/evaluation': {
    title: 'Project evaluation',
    subtitle: 'M&E evaluation lines and CSV export',
  },
  '/projects/feedback-by-project': { title: 'Project Feedback', subtitle: 'Public feedback by project' },
  '/verify-certificate': { title: 'Verify Certificate', subtitle: 'Confirm a project payment certificate by number' },
  '/contractor-dashboard': { title: 'Personal Dashboard', subtitle: 'My Activities' },
  '/project-analytics': { title: 'Project Analytics', subtitle: 'Performance Metrics & Statistics' },
  '/project-by-status-dashboard': { title: 'Project By Status', subtitle: 'Status distribution & filters' },
  '/project-by-sector-dashboard': { title: 'Project By Sector', subtitle: 'Sector spread & registry alignment' },
  '/operations-dashboard': { title: 'County Operational Dashboard', subtitle: 'Departments, regional KPIs, activities, evaluations, and risks' },
  '/finance/payment-certificates': { title: 'Payment Certificates', subtitle: 'All projects' },
  '/finance/payment-list': { title: 'Payment List', subtitle: 'Project payments with budget and funding context' },
  '/finance/funding-sources-report': { title: 'Funding Sources Report', subtitle: 'Projects grouped by funding source' },

  // Reporting routes
  '/reports-hub': { title: 'Reports hub', subtitle: 'Find reports & analytics' },
  '/reports': { title: 'Project status charts', subtitle: 'Status & directorate distribution' },
  '/county-operations-report': { title: 'County Operations Report', subtitle: 'Department, region, KPI, and evaluation tracking' },
  '/apr-reports': { title: 'APR Reports', subtitle: 'Annual performance Word reports by financial year' },
  '/reporting-template': { title: 'Reporting Template', subtitle: 'Filtered departmental Word reporting template' },
  '/pending-bills-report': { title: 'Pending Bills Report', subtitle: 'Filter and download outstanding project bill balances' },
  '/budget-justification-report': { title: 'Budget Justification', subtitle: 'Filter projects and download justification report' },
  '/project-finance-overview': { title: 'Project Finance Overview', subtitle: 'Comprehensive financing and partner contribution analysis' },
  '/view-reports': { title: 'Project Dashboards', subtitle: 'Project Analytics' },
  '/reporting-overview': { title: 'Project Dashboards', subtitle: 'Project Analytics' },
  '/regional-dashboard': { title: 'Regional Rpts', subtitle: 'Regional Analytics' },
  '/regional-reports': { title: 'Regional Breakdown Dashboard', subtitle: 'Sub-county and ward dashboards' },
  '/departmental-reports': { title: 'Departmental Reports', subtitle: 'Executive department performance overview' },
  '/regional-reporting': { title: 'Regional Dashboards', subtitle: 'Regional Overview' },
  '/absorption-report': { title: 'Absorption Report', subtitle: 'Financial Analytics' },
  '/performance-management-report': { title: 'Performance Management Report', subtitle: 'Performance Analytics' },
  '/capr-report': { title: 'CAPR Report', subtitle: 'County Annual Performance Report' },
  '/quarterly-implementation-report': { title: 'Quarterly Implementation Report', subtitle: 'Quarterly Analytics' },
  
  // Management routes
  '/data-import': { title: 'Central Data Import', subtitle: 'Data Import' },
  '/maps': { title: 'GIS Mapping', subtitle: 'Geographic Information' },
  '/gis-mapping': { title: 'GIS Mapping', subtitle: 'Geographic Information' },
  '/maps/import-data': { title: 'Import Map Data', subtitle: 'Data Import' },
  '/map-data-import': { title: 'Import Map Data', subtitle: 'Data Import' },
  '/strategic-planning': { title: 'CIDP', subtitle: 'County Integrated Development Plan' },
  '/planning/cidp-pillars': {
    title: 'CIDP Pillars',
    subtitle: 'Planning - pillars, objectives, sectors, programmes, and SDG linkages',
  },
  '/planning/cidp-periods': {
    title: 'CIDP Period List',
    subtitle: 'Planning - CIDP implementation periods',
  },
  '/planning/adp-periods': {
    title: 'ADP Period List',
    subtitle: 'Planning - annual development plan periods',
  },
  '/planning/programmes': {
    title: 'Programme List',
    subtitle: 'Planning - programmes, objectives, sectors, and SDG linkages',
  },
  '/planning/sector-list': {
    title: 'Sector List',
    subtitle: 'Planning - sectors and project counts',
  },
  '/planning/budget-allocation': {
    title: 'Budget Allocation List',
    subtitle: 'Planning - project allocation register',
  },
  '/planning/indicators': {
    title: 'Indicators & KPIs',
    subtitle: 'Planning — measurement types, KPIs & indicators',
  },
  '/planning/project-activities': {
    title: 'Project Activities',
    subtitle: 'Planning — measurable activities linked to indicators',
  },
  '/planning/project-risks': {
    title: 'Project Risks',
    subtitle: 'Planning — standard risk register (code, name, description)',
  },
  '/planning/reporting-frequency': {
    title: 'Reporting frequency',
    subtitle: 'Planning — how often indicators or milestones are reported',
  },
  '/budget-management': { title: 'ADP-Budget', subtitle: 'Annual Development Plan & budget containers' },
  '/strategic-planning/import': { title: 'Import Strategic Data', subtitle: 'Strategic Data' },
  '/strategic-data-import': { title: 'Import Strategic Data', subtitle: 'Strategic Data' },
  '/hr-module': { title: 'HR Module', subtitle: 'Human Resources' },
  '/hr': { title: 'HR Module', subtitle: 'Human Resources' },
  
  // Admin routes
  '/admin': { title: 'Admin Dashboard', subtitle: 'Administration' },
  '/audit-trail': { title: 'Audit trail', subtitle: 'Security & operations events' },
  '/user-management': { title: 'User Management', subtitle: 'Users & Roles' },
  '/workflow-management': { title: 'Workflow Management', subtitle: 'Process Management' },
  '/approval-levels-management': { title: 'Approvals & workflows', subtitle: 'Approval levels & workflow configuration' },
  '/kenya-wards': { title: 'Wards', subtitle: 'Machakos County ward reference (IEBC)' },
  '/feedback-management': { title: 'Feedback Management', subtitle: 'Citizen Feedback' },
  '/metadata-management': { title: 'Metadata Management', subtitle: 'Data Configuration' },
  '/ministries-management': { title: 'Ministries', subtitle: 'Ministries & State Departments' },
  '/contractor-management': { title: 'Contractor Management', subtitle: 'Contractor Administration' },
  '/contractor-types': { title: 'Contractor Types', subtitle: 'Manage contractor type categories' },
  '/procurement': { title: 'Project Procurement', subtitle: 'Under-procurement workflow management' },
  '/procurement-stages': { title: 'Procurement stages', subtitle: 'Configure workflow stage labels for procurement projects' },
  '/county-proposed-projects': { title: 'Proposed Projects', subtitle: 'Project Proposals' },
  '/project-announcements': { title: 'Project Announcements', subtitle: 'Public Announcements' },
  '/public-approval': { title: 'Public Content Approval', subtitle: 'Approve content for the public site' },
  '/public-feedback-moderation': { title: 'Feedback Review', subtitle: 'Citizen feedback queue & analytics' },
  
  // Contractor sub-routes
  '/contractor-dashboard/payments': { title: 'Payment Requests', subtitle: 'Payment Management' },
  '/contractor-dashboard/photos': { title: 'Progress Photos', subtitle: 'Photo Management' },
  
  // Project sub-routes
  '/projects/import-data': { title: 'Import Project Data', subtitle: 'Data Import' },
  '/projects-dashboard/view': { title: 'Projects Dashboard', subtitle: 'Project Analytics' },
};

export const usePageTitleEffect = () => {
  const location = useLocation();
  const { updatePageTitle } = usePageTitle();

  useEffect(() => {
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search || '');

    // Find exact match first (most specific routes first)
    let titleInfo = routeTitles[path];

    if (path === '/planning/indicators' && searchParams.get('section') === 'measurement-types') {
      titleInfo = {
        title: 'Measurement types',
        subtitle: 'Planning — units for KPIs, indicators & sub-program targets',
      };
    }
    
    // If no exact match, try to find partial matches
    // Sort routes by length (longest first) to match most specific routes first
    if (!titleInfo) {
      const sortedRoutes = Object.keys(routeTitles)
        .filter(route => route !== '/')
        .sort((a, b) => b.length - a.length);
      
      const matchingRoute = sortedRoutes.find(route => {
        // For dynamic routes like /projects/:projectId, check if path matches pattern
        if (route.includes(':')) {
          const routePattern = route.replace(/:[^/]+/g, '[^/]+');
          const regex = new RegExp(`^${routePattern}(/.*)?$`);
          return regex.test(path);
        }
        // For static routes, check if path starts with route
        return path.startsWith(route);
      });
      
      if (matchingRoute) {
        titleInfo = routeTitles[matchingRoute];
      }
    }
    
    // Handle dynamic project routes
    if (!titleInfo && path.startsWith('/projects/')) {
      if (path === '/projects/feedback-by-project') {
        titleInfo = { title: 'Project Feedback', subtitle: 'Public feedback by project' };
      } else if (path === '/projects/updates') {
        titleInfo = { title: 'Project Updates', subtitle: 'Monitoring hub for status, documents, and feedback' };
      } else if (path === '/projects/documents-by-project') {
        titleInfo = { title: 'Project Documents', subtitle: 'Attachments by project' };
      } else if (path === '/projects/planning-activity-links') {
        titleInfo = { title: 'Project activity links', subtitle: 'Associate Planning catalog activities with projects' };
      } else if (path === '/projects/planning-risk-links') {
        titleInfo = { title: 'Project risk links', subtitle: 'Associate Planning catalog risks with projects' };
      } else if (path.includes('/gantt-chart')) {
        titleInfo = { title: 'Gantt Chart', subtitle: 'Project Timeline' };
      } else if (path.includes('/kdsp-details')) {
        titleInfo = { title: 'KDSP Details', subtitle: 'Project Details' };
      } else if (path.match(/^\/projects\/\d+$/)) {
        titleInfo = { title: 'Project Details', subtitle: 'Project Information' };
      }
    }
    
    // Handle dynamic strategic planning routes
    if (!titleInfo && path.startsWith('/strategic-planning/')) {
      if (path.match(/^\/strategic-planning\/\d+$/)) {
        titleInfo = { title: 'Strategic Plan Details', subtitle: 'Plan Information' };
      }
    }
    
    // Default fallback
    if (!titleInfo) {
      // Try to extract a meaningful title from the path
      const pathParts = path.split('/').filter(p => p);
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        const formattedTitle = lastPart
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        titleInfo = { 
          title: formattedTitle, 
          subtitle: 'Page' 
        };
      } else {
        titleInfo = { 
          title: 'Dashboard', 
          subtitle: 'Overview & Analytics' 
        };
      }
    }
    
    updatePageTitle(titleInfo.title, titleInfo.subtitle);
  }, [location.pathname, location.search, updatePageTitle]);
};









