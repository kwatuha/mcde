import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  CssBaseline,
  Button,
  CircularProgress,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Outlet, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageTitleProvider } from '../context/PageTitleContext.jsx';
import { ProfileModalProvider, useProfileModal } from '../context/ProfileModalContext.jsx';
import ProfileModal from '../components/ProfileModal.jsx';
import { MenuCategoryProvider } from '../context/MenuCategoryContext.jsx';
import { SidebarProvider, useSidebar } from '../context/SidebarContext.jsx';
import { usePageTitleEffect } from '../hooks/usePageTitle.js';
import { ROUTES } from '../configs/appConfig.js';
import { useTheme } from "@mui/material";
import { isAdmin, normalizeRoleName } from '../utils/privilegeUtils.js';
// ✨ Removed old theme system imports
import Topbar from "./Topbar.jsx";
import Sidebar from "./Sidebar.jsx";
import FloatingChatButton from "../components/chat/FloatingChatButton.jsx";
import RibbonMenu from "./RibbonMenu.jsx";

const expandedSidebarWidth = 200; // Width with labels
const collapsedSidebarWidth = 64; // Width with icons only

function MainLayoutContent() {
  const theme = useTheme();
  // ✨ Using MUI theme directly - simpler and clearer!

  const [mobileOpen, setMobileOpen] = useState(false);
  // Sidebar pin (expanded) state for desktop
  const [isSidebarPinnedOpen, setIsSidebarPinnedOpen] = useState(false);
  
  // Safely get auth context with error handling
  let authContext;
  try {
    authContext = useAuth();
  } catch (error) {
    // If context is not available, return null and let React handle it
    console.error('Auth context not available:', error);
    return null;
  }
  
  const { token, user, logout, loading } = authContext || {};
  const isAdminLike = isAdmin(user);
  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  const navigate = useNavigate();
  const location = useLocation();
  const { isCollapsed } = useSidebar();
  const { isOpen: isProfileModalOpen, closeModal: closeProfileModal } = useProfileModal();
  
  // Calculate current sidebar width
  const currentSidebarWidth = isCollapsed ? collapsedSidebarWidth : expandedSidebarWidth;

  // Auto-update page title based on route
  usePageTitleEffect();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };
  
  useEffect(() => {
    if (user && normalizedRole === 'contractor' && location.pathname !== ROUTES.CONTRACTOR_DASHBOARD) {
        navigate(ROUTES.CONTRACTOR_DASHBOARD, { replace: true });
        return;
    }
    const isExecutiveViewer = normalizedRole === 'executive_viewer' || normalizedRole === 'project_lead';
    if (isExecutiveViewer && (location.pathname === ROUTES.DASHBOARD || location.pathname === '/dashboard')) {
      navigate(ROUTES.SYSTEM_DASHBOARD, { replace: true });
    }
  }, [location.pathname, user, normalizedRole, navigate]);

  // Show loading state while auth is initializing
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!token) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  const handleLogout = () => {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };
  
  return (
    <>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
        }}
      >
        <Toolbar sx={{ p: 0, minHeight: '48px !important', height: '48px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 1.5, display: { sm: 'none' }, p: 1 }}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
            
            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: '180px' }}>
              <Typography variant="h6" noWrap component="div" sx={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
                GPRIS
              </Typography>
            </Box>
            
            <Topbar />
            
            <Button
              variant="contained"
              color="secondary"
              onClick={handleLogout}
              size="small"
              sx={{
                ml: 1.5, 
                backgroundColor: '#dc2626',
                '&:hover': { backgroundColor: '#b91c1c' },
                color: 'white', 
                fontWeight: 'semibold', 
                borderRadius: '6px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                transition: 'background-color 0.2s ease-in-out',
                minWidth: '70px',
                py: 0.5,
                px: 1.5,
                fontSize: '0.875rem'
              }}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex' }}>
        <Sidebar 
          mobileOpen={mobileOpen}
          onMobileClose={handleDrawerToggle}
          isPinnedOpen={isSidebarPinnedOpen}
          onTogglePinned={() => setIsSidebarPinnedOpen((v) => !v)}
        />
        <Box
          component="main"
          sx={{
            flexGrow: 1, 
            p: 0,
            mt: '48px',
            // Adjust width based on sidebar collapse state
            width: { sm: `calc(100% - ${currentSidebarWidth}px)` },
            ml: { sm: `${currentSidebarWidth}px` },
            transition: 'margin-left 0.3s ease-in-out, width 0.3s ease-in-out',
            minHeight: 'calc(100vh - 48px)',
            backgroundColor: theme.palette.mode === 'dark' 
              ? theme.palette.background.default
              : '#ffffff',
            borderLeft: { sm: `none` },
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Ribbon-style top menu (experimental) */}
          <RibbonMenu isAdmin={isAdminLike} />
          <Box sx={{ 
            flex: 1,
            p: { xs: 0.75, sm: 1, md: 1.25 },
            overflow: 'auto'
          }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
      
      {/* Floating Chat Button - Hidden for now */}
      {/* <FloatingChatButton /> */}

      {/* Profile Modal */}
      <ProfileModal
        open={isProfileModalOpen}
        onClose={closeProfileModal}
      />
    </>
  );
}

function MainLayout() {
  return (
    <PageTitleProvider>
      <ProfileModalProvider>
        <MenuCategoryProvider>
          <SidebarProvider>
            <MainLayoutContent />
          </SidebarProvider>
        </MenuCategoryProvider>
      </ProfileModalProvider>
    </PageTitleProvider>
  );
}

export default MainLayout;