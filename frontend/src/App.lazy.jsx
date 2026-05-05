import React, { lazy, Suspense } from 'react';
import { CssBaseline, ThemeProvider, Box, CircularProgress } from '@mui/material';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

// Import AuthProvider and ChatProvider (keep these - they're small)
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { modernTheme } from './pages/dashboard/theme';

// Import Layout (keep this - it's needed immediately)
import MainLayout from './layouts/MainLayout';

// Lazy load all page components
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DashboardLandingPage = lazy(() => import('./pages/DashboardLandingPage'));
const ProjectManagementPage = lazy(() => import('./pages/ProjectManagementPage'));
const ProjectFeedbackByProjectPage = lazy(() => import('./pages/ProjectFeedbackByProjectPage'));
const VerifyCertificatePage = lazy(() => import('./pages/VerifyCertificatePage'));
const ProjectImportPage = lazy(() => import('./pages/ProjectImportPage'));
const CentralImportPage = lazy(() => import('./pages/CentralImportPage'));
const ProjectDetailsPage = lazy(() => import('./pages/ProjectDetailsPage'));
const ProjectGanttChartPage = lazy(() => import('./pages/ProjectGanttChartPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const Login = lazy(() => import('./components/Login'));
const Register = lazy(() => import('./components/Register'));
const StrategicPlanningPage = lazy(() => import('./pages/StrategicPlanningPage'));
const PlanningIndicatorsPage = lazy(() => import('./pages/PlanningIndicatorsPage'));
const PlanningProjectActivitiesPage = lazy(() => import('./pages/PlanningProjectActivitiesPage'));
const PlanningProjectRisksPage = lazy(() => import('./pages/PlanningProjectRisksPage'));
const ProjectPlanningActivityLinksPage = lazy(() =>
  import('./pages/ProjectPlanningCatalogLinksPages').then((m) => ({ default: m.ProjectPlanningActivityLinksPage }))
);
const ProjectPlanningRiskLinksPage = lazy(() =>
  import('./pages/ProjectPlanningCatalogLinksPages').then((m) => ({ default: m.ProjectPlanningRiskLinksPage }))
);
const StrategicPlanDetailsPage = lazy(() => import('./pages/StrategicPlanDetailsPage'));
const DataImportPage = lazy(() => import('./pages/DataImportPage'));
const KdspProjectDetailsPage = lazy(() => import('./pages/KdspProjectDetailsPage'));
const GISMapPage = lazy(() => import('./pages/GISMapPage'));
const MapDataImportPage = lazy(() => import('./pages/MapDataImportPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProjectCategoryPage = lazy(() => import('./pages/ProjectCategoryPage'));
const ProjectPhotoManager = lazy(() => import('./pages/ProjectPhotoManager'));
const PersonalDashboard = lazy(() => import('./pages/ContractorDashboard'));
const ContractorManagementPage = lazy(() => import('./pages/ContractorManagementPage'));
const PaymentCertificatesPage = lazy(() => import('./pages/PaymentCertificatesPage'));
const DashboardConfigManager = lazy(() => import('./pages/DashboardConfigManager'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AuditTrailPage = lazy(() => import('./pages/AuditTrailPage'));
const WorkflowManagementPage = lazy(() => import('./pages/WorkflowManagementPage'));
const ApprovalLevelsManagementPage = lazy(() => import('./pages/ApprovalLevelsManagementPage'));
const FeedbackManagementPage = lazy(() => import('./pages/FeedbackManagementPage'));
const FeedbackModerationPage = lazy(() => import('./pages/FeedbackModerationPage'));
const HrModulePage = lazy(() => import('./pages/HrModulePage'));
const ProjectDashboardPage = lazy(() => import('./pages/ProjectDashboardPage'));
const ReportingView = lazy(() => import('./pages/ReportingView'));
const RegionalDashboard = lazy(() => import('./pages/RegionalDashboard'));
const RegionalReportsView = lazy(() => import('./pages/RegionalReportsView'));

// Loading component
const LoadingFallback = () => (
  <Box sx={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    minHeight: '100vh' 
  }}>
    <CircularProgress />
  </Box>
);

// Wrapper component to add Suspense to lazy-loaded routes
const LazyRoute = ({ component: Component }) => (
  <Suspense fallback={<LoadingFallback />}>
    <Component />
  </Suspense>
);

// Define routes with lazy loading
const router = createBrowserRouter([
  { path: '/impes', element: <Navigate to="/" replace /> },
  { path: '/impes/*', element: <Navigate to="/" replace /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <LazyRoute component={DashboardLandingPage} />,
      },
      {
        path: 'dashboard',
        element: <LazyRoute component={DashboardPage} />,
      },
      {
        path: 'dashboard-config',
        element: <LazyRoute component={DashboardConfigManager} />,
      },
      {
        path: 'admin',
        element: <LazyRoute component={AdminPage} />,
      },
      {
        path: 'audit-trail',
        element: <LazyRoute component={AuditTrailPage} />,
      },
      {
        path: 'contractor-dashboard',
        element: <LazyRoute component={PersonalDashboard} />,
      },
      {
        path: 'contractor-management',
        element: <LazyRoute component={ContractorManagementPage} />,
      },
      {
        path: 'finance/payment-certificates',
        element: <LazyRoute component={PaymentCertificatesPage} />,
      },
      {
        path: 'projects',
        element: <LazyRoute component={ProjectManagementPage} />,
      },
      {
        path: 'projects/import-data',
        element: <LazyRoute component={ProjectImportPage} />,
      },
      {
        path: 'projects/feedback-by-project',
        element: <LazyRoute component={ProjectFeedbackByProjectPage} />,
      },
      {
        path: 'projects/planning-activity-links',
        element: <LazyRoute component={ProjectPlanningActivityLinksPage} />,
      },
      {
        path: 'projects/planning-risk-links',
        element: <LazyRoute component={ProjectPlanningRiskLinksPage} />,
      },
      {
        path: 'verify-certificate',
        element: <LazyRoute component={VerifyCertificatePage} />,
      },
      {
        path: 'data-import',
        element: <LazyRoute component={CentralImportPage} />,
      },
      {
        path: 'projects/:projectId',
        element: <LazyRoute component={ProjectDetailsPage} />,
      },
      {
        path: 'projects/:projectId/gantt-chart',
        element: <LazyRoute component={ProjectGanttChartPage} />,
      },
      {
        path: 'projects/:projectId/photos',
        element: <LazyRoute component={ProjectPhotoManager} />,
      },
      {
        path: 'reports',
        element: <LazyRoute component={ReportsPage} />,
      },
      {
        path: 'view-reports',
        element: <LazyRoute component={ReportingView} />,
      },
      {
        path: 'regional-dashboard',
        element: <LazyRoute component={RegionalDashboard} />,
      },
      {
        path: 'regional-reports',
        element: <LazyRoute component={RegionalReportsView} />,
      },
      {
        path: 'maps',
        element: <LazyRoute component={GISMapPage} />,
      },
      {
        path: 'maps/import-data',
        element: <LazyRoute component={MapDataImportPage} />,
      },
      {
        path: 'user-management',
        element: <LazyRoute component={UserManagementPage} />,
      },
      {
        path: 'workflow-management',
        element: <LazyRoute component={WorkflowManagementPage} />,
      },
      {
        path: 'approval-levels-management',
        element: <LazyRoute component={ApprovalLevelsManagementPage} />,
      },
      {
        path: 'feedback-management',
        element: <LazyRoute component={FeedbackManagementPage} />,
      },
      {
        path: 'public-feedback-moderation',
        element: <LazyRoute component={FeedbackModerationPage} />,
      },
      {
        path: 'strategic-planning',
        element: <LazyRoute component={StrategicPlanningPage} />,
      },
      {
        path: 'planning/indicators',
        element: <LazyRoute component={PlanningIndicatorsPage} />,
      },
      {
        path: 'planning/project-activities',
        element: <LazyRoute component={PlanningProjectActivitiesPage} />,
      },
      {
        path: 'planning/project-risks',
        element: <LazyRoute component={PlanningProjectRisksPage} />,
      },
      {
        path: 'strategic-planning/:planId',
        element: <LazyRoute component={StrategicPlanDetailsPage} />,
      },
      {
        path: 'strategic-planning/import',
        element: <LazyRoute component={DataImportPage} />,
      },
      {
        path: 'projects/:projectId/kdsp-details',
        element: <LazyRoute component={KdspProjectDetailsPage} />,
      },
      {
        path: 'metadata-management',
        element: <LazyRoute component={SettingsPage} />,
      },
      {
        path: 'settings/project-categories',
        element: <LazyRoute component={ProjectCategoryPage} />,
      },
      {
        path: 'hr-module',
        element: <LazyRoute component={HrModulePage} />,
      },
      {
        path: 'projects-dashboard/view',
        element: <LazyRoute component={ProjectDashboardPage} />,
      },
    ],
  },
  {
    path: '/login',
    element: <LazyRoute component={Login} />,
  },
  {
    path: '/register',
    element: <LazyRoute component={Register} />,
  },
]);

function App() {
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

