import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  CssBaseline,
  Button,
  CircularProgress,
  GlobalStyles,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Outlet, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageTitleProvider, usePageTitle } from '../context/PageTitleContext.jsx';
import { AIPageContextProvider, useAIPageContextState } from '../context/AIPageContext.jsx';
import { ProfileModalProvider, useProfileModal } from '../context/ProfileModalContext.jsx';
import ProfileModal from '../components/ProfileModal.jsx';
import { MenuCategoryProvider } from '../context/MenuCategoryContext.jsx';
import { SidebarProvider, useSidebar } from '../context/SidebarContext.jsx';
import { useNavigationLayout } from '../context/NavigationLayoutContext.jsx';
import { usePageTitleEffect } from '../hooks/usePageTitle.js';
import { ROUTES } from '../configs/appConfig.js';
import { useTheme, useMediaQuery } from "@mui/material";
import { isAdmin, normalizeRoleName, isContractor, isEngineerPortalUser } from '../utils/privilegeUtils.js';
import { getFilteredMenuCategories } from '../configs/menuConfigUtils.js';
import {
  getFirstVisibleMenuPath,
  hasRestrictiveMenuProfile,
  isAlwaysAllowedUiProfilePath,
  isContractorPortalPath,
  isEngineerWorkflowPath,
  isPathAllowedByVisibleMenu,
  isUiProfileBypassUser,
} from '../utils/uiProfileUtils.js';
// ✨ Removed old theme system imports
import Topbar from "./Topbar.jsx";
import Sidebar from "./Sidebar.jsx";
import FloatingChatButton from "../components/chat/FloatingChatButton.jsx";
import AIAssistantPanel from "../components/ai/AIAssistantPanel.jsx";
import RibbonMenu from "./RibbonMenu.jsx";
import gprisLogo from '../assets/gpris.png';
import { treeLayoutDataGridGlobalStyles } from '../utils/dataGridTheme.js';
import {
  TREE_NAV_APPBAR_FALLBACK,
  TREE_NAV_APPBAR_GRAD,
} from '../configs/treeNavChrome.js';

const expandedSidebarWidthRibbon = 200;
const expandedSidebarWidthTree = 248;
const collapsedSidebarWidth = 64;

function MainLayoutContent() {
  const theme = useTheme();
  const isDesktopUp = useMediaQuery(theme.breakpoints.up('sm'));
  // ✨ Using MUI theme directly - simpler and clearer!

  const [mobileOpen, setMobileOpen] = useState(false);
  // Sidebar pin (expanded) state for desktop
  const [isSidebarPinnedOpen, setIsSidebarPinnedOpen] = useState(false);
  const [headerGovLogoFailed, setHeaderGovLogoFailed] = useState(false);
  
  const { token, user, logout, loading, mustChangePassword, hasPrivilege } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isCollapsed } = useSidebar();
  const { isTreeLayout } = useNavigationLayout();
  const { isOpen: isProfileModalOpen, closeModal: closeProfileModal } = useProfileModal();
  const { pageTitle } = usePageTitle();
  const { pageContext: aiPageContext } = useAIPageContextState();
  const isAdminLike = isAdmin(user);
  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);

  const expandedSidebarWidth = isTreeLayout ? expandedSidebarWidthTree : expandedSidebarWidthRibbon;
  const currentSidebarWidth = isCollapsed ? collapsedSidebarWidth : expandedSidebarWidth;
  /** Full-viewport sidebar + inset AppBar (tree only, sm+); phones keep bar over full width. */
  const treeSidebarFlushTop = isTreeLayout && isDesktopUp;
  const treeAppBarLightChrome = isTreeLayout && theme.palette.mode === 'light';

  // Auto-update page title based on route
  usePageTitleEffect();

  const assistantPageContext = useMemo(() => ({
    path: location.pathname,
    title: pageTitle || (typeof document !== 'undefined' ? document.title : ''),
    ...aiPageContext,
  }), [location.pathname, pageTitle, aiPageContext]);

  const handleDrawerToggle = () => {
    setMobileOpen((open) => !open);
  };

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);
  
  const menuCategories = useMemo(
    () => getFilteredMenuCategories(isAdminLike, hasPrivilege, user),
    [isAdminLike, hasPrivilege, user]
  );

  useEffect(() => {
    if (
      user &&
      hasRestrictiveMenuProfile(user) &&
      !isUiProfileBypassUser(user) &&
      !isAlwaysAllowedUiProfilePath(location.pathname, user) &&
      !(isContractor(user) && isContractorPortalPath(location.pathname)) &&
      !(isEngineerPortalUser(user) && isEngineerWorkflowPath(location.pathname)) &&
      !isPathAllowedByVisibleMenu(location.pathname, menuCategories)
    ) {
      const fallback = getFirstVisibleMenuPath(menuCategories, user);
      if (fallback && normalizePath(fallback) !== normalizePath(location.pathname)) {
        navigate(fallback, { replace: true });
      }
    }
  }, [user, location.pathname, menuCategories, navigate]);

  function normalizePath(pathname) {
    return String(pathname || '').split('?')[0].split('#')[0];
  }
  
  useEffect(() => {
    if (
      user &&
      isContractor(user) &&
      !isContractorPortalPath(location.pathname) &&
      location.pathname !== ROUTES.VERIFY_CERTIFICATE
    ) {
        navigate(ROUTES.CONTRACTOR_DASHBOARD, { replace: true });
        return;
    }
    const isExecutiveViewer = normalizedRole === 'executive_viewer'
      || normalizedRole === 'project_lead'
      || normalizedRole === 'executive_supervisor';
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
    if (location.pathname === ROUTES.VERIFY_CERTIFICATE) {
      return (
        <>
          <CssBaseline />
          <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <Outlet />
          </Box>
        </>
      );
    }
    return <Navigate to={ROUTES.LOGIN} replace />;
  }
  if (mustChangePassword) {
    return <Navigate to={ROUTES.FORCE_PASSWORD_CHANGE} replace />;
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
        elevation={treeAppBarLightChrome ? 0 : undefined}
        sx={{
          zIndex: 1000,
          ...(treeAppBarLightChrome
            ? {
                backgroundImage: TREE_NAV_APPBAR_GRAD,
                backgroundColor: TREE_NAV_APPBAR_FALLBACK,
                color: '#fff',
                boxShadow: '0 1px 0 rgba(255,255,255,0.08)',
              }
            : {}),
          ...(treeSidebarFlushTop
            ? {
                left: `${currentSidebarWidth}px`,
                width: `calc(100% - ${currentSidebarWidth}px)`,
                transition: 'left 0.3s ease-in-out, width 0.3s ease-in-out',
              }
            : {
                left: 0,
                width: '100%',
              }),
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
            
            {/* Tree + desktop: brand lives in full-height sidebar; keep header for titles + actions only */}
            {!(treeSidebarFlushTop) && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.875, sm: 1.125 },
                flexShrink: 0,
                minWidth: 0,
                pr: { xs: 0.5, sm: 1 },
              }}
            >
              {!headerGovLogoFailed && (
                <Box
                  component="img"
                  src={gprisLogo}
                  alt=""
                  aria-hidden
                  onError={() => setHeaderGovLogoFailed(true)}
                  sx={{
                    height: { xs: 36, sm: 42 },
                    width: 'auto',
                    maxWidth: { xs: 96, sm: 144 },
                    objectFit: 'contain',
                    objectPosition: 'center',
                    display: 'block',
                    flexShrink: 0,
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
                  }}
                />
              )}
              <Typography
                variant="h6"
                noWrap
                component="div"
                sx={{ color: 'white', fontWeight: 700, fontSize: { xs: '1.05rem', sm: '1.15rem' }, letterSpacing: '-0.01em' }}
              >
                MCMES
              </Typography>
            </Box>
            )}
            
            <Topbar />
            
            <Button
              variant="contained"
              color="secondary"
              onClick={handleLogout}
              size="small"
              sx={{
                ml: { xs: 0.5, sm: 1.5 },
                backgroundColor: '#dc2626',
                '&:hover': { backgroundColor: '#b91c1c' },
                color: 'white', 
                fontWeight: 'semibold', 
                borderRadius: '6px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                transition: 'background-color 0.2s ease-in-out',
                minWidth: { xs: '56px', sm: '70px' },
                py: 0.5,
                px: { xs: 1, sm: 1.5 },
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                flexShrink: 0,
              }}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex' }}>
        <Sidebar
          expandedSidebarWidth={expandedSidebarWidth}
          treeSidebarFlushTop={treeSidebarFlushTop}
          mobileOpen={mobileOpen}
          onMobileClose={handleMobileClose}
          isPinnedOpen={isSidebarPinnedOpen}
          onTogglePinned={() => setIsSidebarPinnedOpen((v) => !v)}
        />
        <Box
          component="main"
          className="mcmes-app-main"
          sx={{
            flexGrow: 1, 
            p: 0,
            mt: '48px',
            width: { xs: '100%', sm: `calc(100% - ${currentSidebarWidth}px)` },
            ml: { xs: 0, sm: `${currentSidebarWidth}px` },
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
          {isTreeLayout && theme.palette.mode === 'light' ? (
            <GlobalStyles styles={treeLayoutDataGridGlobalStyles} />
          ) : null}
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
      <AIAssistantPanel pageContext={assistantPageContext} />

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
      <AIPageContextProvider>
        <ProfileModalProvider>
          <MenuCategoryProvider>
            <SidebarProvider>
              <MainLayoutContent />
            </SidebarProvider>
          </MenuCategoryProvider>
        </ProfileModalProvider>
      </AIPageContextProvider>
    </PageTitleProvider>
  );
}

export default MainLayout;