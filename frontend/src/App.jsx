import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

// Import AuthProvider and ChatProvider
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { useAuth } from './context/AuthContext';

// Import Layout and Page Components
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import DashboardLandingPage from './pages/DashboardLandingPage';
import HomePage from './pages/HomePage';
import ProjectManagementPage from './pages/ProjectManagementPage';
import ProjectTeamsPage from './pages/ProjectTeamsPage';
import ProjectStatusPage from './pages/ProjectStatusPage';
import ProjectEvaluationPage from './pages/ProjectEvaluationPage';
import ProjectDocumentsByProjectPage from './pages/ProjectDocumentsByProjectPage';
import ProjectFeedbackByProjectPage from './pages/ProjectFeedbackByProjectPage';
import VerifyCertificatePage from './pages/VerifyCertificatePage';
import ProjectDetailsPage from './pages/ProjectDetailsPage';
import ProjectGanttChartPage from './pages/ProjectGanttChartPage';
import ReportsPage from './pages/ReportsPage';
import UserManagementPage from './pages/UserManagementPage';
import Login from './components/Login';
import Register from './components/Register';
import ForcePasswordChangePage from './pages/ForcePasswordChangePage';
import HelpSupportPage from './pages/HelpSupportPage';

// Import the StrategicPlanningPage
import StrategicPlanningPage from './pages/StrategicPlanningPage';
import PlanningIndicatorsPage from './pages/PlanningIndicatorsPage';
import PlanningProjectActivitiesPage from './pages/PlanningProjectActivitiesPage';
import PlanningProjectRisksPage from './pages/PlanningProjectRisksPage';
import PlanningReportingFrequencyPage from './pages/PlanningReportingFrequencyPage';
import {
  ProjectPlanningActivityLinksPage,
  ProjectPlanningRiskLinksPage,
} from './pages/ProjectPlanningCatalogLinksPages';
// Import the StrategicPlanDetailsPage
import StrategicPlanDetailsPage from './pages/StrategicPlanDetailsPage';
// Import the DataImportPage
import DataImportPage from './pages/DataImportPage';
// NEW: Import the KdspProjectDetailsPage
import KdspProjectDetailsPage from './pages/KdspProjectDetailsPage';
// NEW: Import the GISMapPage for the new mapping component
import GISMapPage from './pages/GISMapPage';
import GISDashboardPage from './pages/GISDashboardPage';
// NEW: Import the MapDataImportPage for the map data import form
import MapDataImportPage from './pages/MapDataImportPage';
// NEW: Import the SettingsPage
import SettingsPage from './pages/SettingsPage';
// CORRECTED: Import the ProjectCategoryPage component
import ProjectCategoryPage from './pages/ProjectCategoryPage';
// NEW: Import the ProjectPhotoManager component
import ProjectPhotoManager from './pages/ProjectPhotoManager';
// NEW: Import the PersonalDashboard component (formerly ContractorDashboard)
import PersonalDashboard from './pages/ContractorDashboard';
// NEW: Import the ContractorManagementPage component
import ContractorManagementPage from './pages/ContractorManagementPage';
// NEW: Import the HrModulePage component
import HrModulePage from './pages/HrModulePage';
// ✨ NEW: Import the WorkflowManagementPage component
import WorkflowManagementPage from './pages/WorkflowManagementPage';
// ✨ NEW: Import the ApprovalLevelsManagementPage component
import ApprovalLevelsManagementPage from './pages/ApprovalLevelsManagementPage';
// ✨ NEW: Import the AdminPage component
import AdminPage from './pages/AdminPage';
import AuditTrailPage from './pages/AuditTrailPage';
// ✨ NEW: Import the FeedbackManagementPage component
import FeedbackManagementPage from './pages/FeedbackManagementPage';
// ✨ NEW: Import the AbsorptionReport component
import AbsorptionReport from './components/AbsorptionReport';
// ✨ NEW: Import the PerformanceManagementReport component
import PerformanceManagementReport from './components/PerformanceManagementReport';
// ✨ NEW: Import the CAPRReport component
import CAPRReport from './components/CAPRReport';
// ✨ NEW: Import the QuarterlyImplementationReport component
import QuarterlyImplementationReport from './components/QuarterlyImplementationReport';
// ✨ NEW: Import the Proposed Projects and Announcements management pages
import CountyProposedProjectsManagementPage from './pages/CountyProposedProjectsManagementPage';
import ProjectAnnouncementsManagementPage from './pages/ProjectAnnouncementsManagementPage';
// ✨ NEW: Import the Public Approval Management page
import PublicApprovalManagementPage from './pages/PublicApprovalManagementPage';
import FeedbackModerationPage from './pages/FeedbackModerationPage';
// ✨ NEW: Import the Project Analytics page
import ProjectAnalyticsPage from './pages/ProjectAnalyticsPage';
// ✨ NEW: Import the Budget Management page
import BudgetManagementPage from './pages/BudgetManagementPage';
// ✨ NEW: Import the Job Categories page
import JobCategoriesPage from './pages/JobCategoriesPage';
// ✨ NEW: Import the Kenya Wards page
import KenyaWardsPage from './pages/KenyaWardsPage';
// ✨ NEW: Import the Agencies page
import AgenciesPage from './pages/AgenciesPage';
import MinistriesManagementPage from './pages/MinistriesManagementPage';
// ✨ NEW: Import the Sectors page
import SectorsPage from './pages/SectorsPage';
// ✨ NEW: Import specialized dashboards
import OperationsDashboardPage from './pages/OperationsDashboardPage';
import JobsImpactDashboardPage from './pages/JobsImpactDashboardPage';
import FinanceDashboardPage from './pages/FinanceDashboardPage';
import PaymentCertificatesPage from './pages/PaymentCertificatesPage';
import ProjectByStatusDashboardPage from './pages/ProjectByStatusDashboardPage';
import ProjectBySectorDashboardPage from './pages/ProjectBySectorDashboardPage';
import ProjectsUploadLogPage from './pages/ProjectsUploadLogPage';
import ReportingDashboardPage from './pages/ReportingDashboardPage';
import ProjectOrganizationDashboardPage from './pages/ProjectOrganizationDashboardPage';
 
import ReportingView from './components/ReportingView';
import RegionalReportsView from './components/RegionalReportsView';
import RegionalDashboard from './components/RegionalDashboard';

import ProjectDashboardPage from './pages/ProjectsDashboardPage';
import SystemDashboardPage from './pages/SystemDashboardPage';
import DashboardConfigManager from './components/DashboardConfigManager';
// NEW: Import the simplified modern theme
import { modernTheme } from './theme/modernTheme';
// Add CentralImportPage for unified import hub
import CentralImportPage from './pages/CentralImportPage';
import { ROUTES } from './configs/appConfig';
import { canAccessProjectBySectorDashboard, isMdaIctAdminOrSuperAdmin } from './utils/privilegeUtils';

function ProjectBySectorRouteGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!canAccessProjectBySectorDashboard(user)) {
    return <Navigate to={ROUTES.SYSTEM_DASHBOARD} replace />;
  }
  return <ProjectBySectorDashboardPage />;
}

function ProjectsUploadLogRouteGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!isMdaIctAdminOrSuperAdmin(user)) {
    return <Navigate to={ROUTES.SYSTEM_DASHBOARD} replace />;
  }
  return <ProjectsUploadLogPage />;
}

// Define routes at domain root ("/")
const router = createBrowserRouter([
  // Legacy bookmarks: app moved from /impes/ to / — avoid in-app 404 when nginx serves SPA on old URL
  { path: '/impes', element: <Navigate to="/" replace /> },
  { path: '/impes/*', element: <Navigate to="/" replace /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'dashboard',
        element: <DashboardLandingPage />,
      },
      {
        path: 'summary-statistics',
        element: <SystemDashboardPage />,
      },
      {
        path: 'system-dashboard',
        element: <Navigate to="/summary-statistics" replace />,
      },
      {
        path: 'operations-dashboard',
        element: <OperationsDashboardPage />,
      },
      {
        path: 'project-by-status-dashboard',
        element: <ProjectByStatusDashboardPage />,
      },
      {
        path: 'project-by-sector-dashboard',
        element: <ProjectBySectorRouteGuard />,
      },
      {
        path: 'data-upload-log',
        element: <ProjectsUploadLogRouteGuard />,
      },
      {
        path: 'reporting-dashboard',
        element: <ReportingDashboardPage />,
      },
      {
        path: 'jobs-dashboard',
        element: <JobsImpactDashboardPage />,
      },
      {
        path: 'finance-dashboard',
        element: <FinanceDashboardPage />,
      },
      {
        path: 'finance/payment-certificates',
        element: <PaymentCertificatesPage />,
      },
      {
        path: 'dashboard-config',
        element: <DashboardConfigManager />,
      },
      {
        path: 'admin',
        element: <AdminPage />,
      },
      {
        path: 'audit-trail',
        element: <AuditTrailPage />,
      },
      {
        path: 'contractor-dashboard',
        element: <PersonalDashboard />,
      },
      {
        path: 'contractor-management',
        element: <ContractorManagementPage />,
      },
      {
        path: 'projects',
        element: <ProjectManagementPage />,
      },
      {
        path: 'projects/documents-by-project',
        element: <ProjectDocumentsByProjectPage />,
      },
      {
        path: 'projects/status',
        element: <ProjectStatusPage />,
      },
      {
        path: 'projects/teams',
        element: <ProjectTeamsPage />,
      },
      {
        path: 'projects/feedback-by-project',
        element: <ProjectFeedbackByProjectPage />,
      },
      {
        path: 'projects/planning-activity-links',
        element: <ProjectPlanningActivityLinksPage />,
      },
      {
        path: 'projects/planning-risk-links',
        element: <ProjectPlanningRiskLinksPage />,
      },
      {
        path: 'projects/evaluation',
        element: <ProjectEvaluationPage />,
      },
      {
        path: 'projects/:projectId',
        element: <ProjectDetailsPage />,
      },
      {
        path: 'projects/:projectId/gantt-chart',
        element: <ProjectGanttChartPage />,
      },
      {
        path: 'projects/:projectId/photos',
        element: <ProjectPhotoManager />,
      },
      {
        path: 'reports',
        element: <ReportsPage />,
      },
      {
        path: 'view-reports',
        element: <ReportingView />,
      },
      {
        path: 'regional-dashboard',
        element: <RegionalDashboard />,
      },
      {
        path: 'regional-reports',
        element: <RegionalReportsView />,
      },
      {
        path: 'maps',
        element: <GISMapPage />,
      },
      {
        path: 'gis-dashboard',
        element: <GISDashboardPage />,
      },
      {
        path: 'maps/import-data',
        element: <MapDataImportPage />,
      },
      {
        path: 'data-import',
        element: <CentralImportPage />,
      },
      {
        path: 'user-management',
        element: <UserManagementPage />,
      },
      {
        path: 'workflow-management',
        element: <WorkflowManagementPage />,
      },
      {
        path: 'approval-levels-management',
        element: <ApprovalLevelsManagementPage />,
      },
      {
        path: 'feedback-management',
        element: <FeedbackManagementPage />,
      },
      {
        path: 'absorption-report',
        element: <AbsorptionReport />,
      },
      {
        path: 'performance-management-report',
        element: <PerformanceManagementReport />,
      },
      {
        path: 'capr-report',
        element: <CAPRReport />,
      },
      {
        path: 'quarterly-implementation-report',
        element: <QuarterlyImplementationReport />,
      },
      {
        path: 'strategic-planning',
        element: <StrategicPlanningPage />,
      },
      {
        path: 'planning/indicators',
        element: <PlanningIndicatorsPage />,
      },
      {
        path: 'planning/project-activities',
        element: <PlanningProjectActivitiesPage />,
      },
      {
        path: 'planning/project-risks',
        element: <PlanningProjectRisksPage />,
      },
      {
        path: 'planning/reporting-frequency',
        element: <PlanningReportingFrequencyPage />,
      },
      {
        path: 'strategic-planning/:planId',
        element: <StrategicPlanDetailsPage />,
      },
      {
        path: 'strategic-planning/import',
        element: <DataImportPage />,
      },
      {
        path: 'projects/:projectId/kdsp-details',
        element: <KdspProjectDetailsPage />,
      },
      {
        path: 'metadata-management',
        element: <SettingsPage />,
      },
      {
        path: 'settings/project-categories',
        element: <ProjectCategoryPage />,
      },
      {
        path: 'project-types',
        element: <ProjectCategoryPage />,
      },
      {
        path: 'hr-module',
        element: <HrModulePage />,
      },
      {
        path: 'projects-dashboard/view',
        element: <ProjectDashboardPage />,
      },
      {
        path: 'county-proposed-projects',
        element: <CountyProposedProjectsManagementPage />,
      },
      {
        path: 'project-announcements',
        element: <ProjectAnnouncementsManagementPage />,
      },
      {
        path: 'public-approval',
        element: <PublicApprovalManagementPage />,
      },
      {
        path: 'public-feedback-moderation',
        element: <FeedbackModerationPage />,
      },
      {
        path: 'budget-management',
        element: <BudgetManagementPage />,
      },
      {
        path: 'job-categories',
        element: <JobCategoriesPage />,
      },
      {
        path: 'sectors',
        element: <SectorsPage />,
      },
      {
        path: 'kenya-wards',
        element: <KenyaWardsPage />,
      },
      {
        path: 'agencies',
        element: <AgenciesPage />,
      },
      {
        path: 'ministries-management',
        element: <MinistriesManagementPage />,
      },
      {
        path: 'help-support',
        element: <HelpSupportPage />,
      },
      {
        path: 'verify-certificate',
        element: <VerifyCertificatePage />,
      },
      {
        path: 'budgets',
        element: <Navigate to="/budget-management" replace />,
      },
      {
        path: 'project-analytics',
        element: <ProjectAnalyticsPage />,
      },
      {
        path: 'projects-by-organization',
        element: <ProjectOrganizationDashboardPage />,
      },
    ],
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/force-password-change',
    element: <ForcePasswordChangePage />,
  },
]);

function App() {
  // ✨ Using the new simplified modern theme - no more mode switching!
  return (
    <ThemeProvider theme={modernTheme}>
      <CssBaseline />
      <AuthProvider>
        <ChatProvider>
          <RouterProvider router={router} />
        </ChatProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;