import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

// Import AuthProvider and ChatProvider
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';

// Import Layout and Page Components
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import DashboardLandingPage from './pages/DashboardLandingPage';
import HomePage from './pages/HomePage';
import ProjectManagementPage from './pages/ProjectManagementPage';
import ProjectDetailsPage from './pages/ProjectDetailsPage';
import ProjectGanttChartPage from './pages/ProjectGanttChartPage';
import ReportsPage from './pages/ReportsPage';
import UserManagementPage from './pages/UserManagementPage';
import Login from './components/Login';
import Register from './components/Register';

// Import the StrategicPlanningPage
import StrategicPlanningPage from './pages/StrategicPlanningPage';
// Import the StrategicPlanDetailsPage
import StrategicPlanDetailsPage from './pages/StrategicPlanDetailsPage';
// Import the DataImportPage
import DataImportPage from './pages/DataImportPage';
// NEW: Import the KdspProjectDetailsPage
import KdspProjectDetailsPage from './pages/KdspProjectDetailsPage';
// NEW: Import the GISMapPage for the new mapping component
import GISMapPage from './pages/GISMapPage';
// NEW: Import the MapDataImportPage for the map data import form
import MapDataImportPage from './pages/MapDataImportPage';
// NEW: Import the SettingsPage
import SettingsPage from './pages/SettingsPage';
// CORRECTED: Import the ProjectCategoryPage component
import ProjectCategoryPage from './pages/ProjectCategoryPage';
// NEW: Import the ProjectPhotoManager component
import ProjectPhotoManager from './pages/ProjectPhotoManager';
// NEW: Import the ContractorDashboard component
import ContractorDashboard from './pages/ContractorDashboard';
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
// ✨ NEW: Import the Sectors page
import SectorsPage from './pages/SectorsPage';
 
import ReportingView from './components/ReportingView';
import RegionalReportsView from './components/RegionalReportsView';
import RegionalDashboard from './components/RegionalDashboard';

import ProjectDashboardPage from './pages/ProjectsDashboardPage';
import DashboardConfigManager from './components/DashboardConfigManager';
// NEW: Import the simplified modern theme
import { modernTheme } from './theme/modernTheme';
// Add CentralImportPage for unified import hub
import CentralImportPage from './pages/CentralImportPage';

// Define your routes with basename for /impes path
const router = createBrowserRouter([
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
        path: 'dashboard-config',
        element: <DashboardConfigManager />,
      },
      {
        path: 'admin',
        element: <AdminPage />,
      },
      {
        path: 'contractor-dashboard',
        element: <ContractorDashboard />,
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
        path: 'budgets',
        element: <Navigate to="/budget-management" replace />,
      },
      {
        path: 'project-analytics',
        element: <ProjectAnalyticsPage />,
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
], {
  basename: '/impes'  // Add this basename configuration
});

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