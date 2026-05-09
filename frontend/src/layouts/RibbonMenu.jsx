import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Box, Button, Tooltip, useTheme } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GridViewIcon from '@mui/icons-material/GridView';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import GroupIcon from '@mui/icons-material/Group';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import MapIcon from '@mui/icons-material/Map';
import PaidIcon from '@mui/icons-material/Paid';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PeopleIcon from '@mui/icons-material/People';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ApprovalIcon from '@mui/icons-material/Approval';
import FeedbackIcon from '@mui/icons-material/Feedback';
import StorageIcon from '@mui/icons-material/Storage';
import BusinessIcon from '@mui/icons-material/Business';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import PublicIcon from '@mui/icons-material/Public';
import ApartmentIcon from '@mui/icons-material/Apartment';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import WorkIcon from '@mui/icons-material/Work';
import DescriptionIcon from '@mui/icons-material/Description';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import StraightenIcon from '@mui/icons-material/Straighten';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import UpdateIcon from '@mui/icons-material/Update';
import RepeatIcon from '@mui/icons-material/Repeat';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import GroupsIcon from '@mui/icons-material/Groups';
import HandshakeIcon from '@mui/icons-material/Handshake';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EventNoteIcon from '@mui/icons-material/EventNote';
import CelebrationIcon from '@mui/icons-material/Celebration';
import GavelIcon from '@mui/icons-material/Gavel';
import CategoryIcon from '@mui/icons-material/Category';
import ChecklistIcon from '@mui/icons-material/Checklist';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import HistoryIcon from '@mui/icons-material/History';
import WorkHistoryIcon from '@mui/icons-material/WorkHistory';
import SpeedIcon from '@mui/icons-material/Speed';
import ArticleIcon from '@mui/icons-material/Article';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { findCategoryIdForPath, getFilteredMenuCategories, hasConfiguredRole } from '../configs/menuConfigUtils.js';
import { useNavigationLayout } from '../context/NavigationLayoutContext.jsx';
import { sortMenuCategoriesForNav, categoryNavLabel } from '../configs/navigationLayoutConfig.js';
import { useMenuCategory } from '../context/MenuCategoryContext.jsx';

/** First sidebar destination when switching ribbon tab (menuConfig `route` keys). */
const DEFAULT_ROUTE_KEY_BY_CATEGORY = {
  dashboard: 'PROJECT_BY_STATUS_DASHBOARD',
  finance: 'FINANCE_PAYMENT_CERTIFICATES',
  reporting: 'PROJECTS',
  management: 'BUDGET_MANAGEMENT',
  procurement: 'PROCUREMENT',
  monitoring: 'PROJECT_DOCUMENTS_BY_PROJECT',
  reports: 'REPORT_LIBRARY',
  hr: 'HR_EMPLOYEES',
  public: 'PUBLIC_APPROVAL',
  admin: 'USER_MANAGEMENT',
};

// Icon mapping for Material-UI icons
const ICON_MAP = {
  DashboardIcon,
  GridViewIcon,
  AssessmentIcon,
  SettingsIcon,
  GroupIcon,
  CloudUploadIcon,
  MapIcon,
  PaidIcon,
  AdminPanelSettingsIcon,
  PeopleIcon,
  AccountTreeIcon,
  ApprovalIcon,
  FeedbackIcon,
  StorageIcon,
  BusinessIcon,
  AssignmentIcon,
  AnnouncementIcon,
  PublicIcon,
  ApartmentIcon,
  CategoryIcon,
  AnalyticsIcon,
  GroupsIcon,
  HandshakeIcon,
  ScheduleIcon,
  EventNoteIcon,
  CelebrationIcon,
  GavelIcon,
  MenuBookIcon,
  LocationOnIcon,
  WorkIcon,
  DescriptionIcon,
  AttachMoneyIcon,
  ShowChartIcon,
  StraightenIcon,
  VerifiedUserIcon,
  HistoryIcon,
  WorkHistoryIcon,
  TaskAltIcon,
  ReportProblemIcon,
  UpdateIcon,
  RepeatIcon,
  FactCheckIcon,
  ChecklistIcon,
  SpeedIcon,
  ArticleIcon,
};

// Simple ribbon-like top menu with grouped actions - Click-based only, no hover switching
export default function RibbonMenu({ isAdmin = false }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { layoutMode } = useNavigationLayout();
  const { hasPrivilege, user } = useAuth();
  const { selectedCategoryId, setSelectedCategoryId } = useMenuCategory();
  const [collapsed, setCollapsed] = useState(false);
  const manualSelectionRef = useRef(false); // Track manual category selections
  
  // Get filtered menu categories based on user permissions (memoized to prevent unnecessary recalculations)
  const menuCategories = useMemo(() => {
    const cats = getFilteredMenuCategories(isAdmin, hasPrivilege, user);
    return sortMenuCategoriesForNav(cats);
  }, [isAdmin, hasPrivilege, user]);
  
  // Find the index of the selected category
  const selectedCategoryIndex = useMemo(() => {
    const index = menuCategories.findIndex(cat => cat.id === selectedCategoryId);
    return index >= 0 ? index : 0;
  }, [selectedCategoryId, menuCategories]);
  
  // Only collapse the primary menu bar height on scroll
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setCollapsed(window.scrollY > 80);
          ticking = false;
        });
        ticking = true;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const getDefaultRouteForCategory = (categoryId) => {
    const category = menuCategories.find((cat) => cat.id === categoryId);
    if (!category || !category.submenus) return null;

    const preferredKey = DEFAULT_ROUTE_KEY_BY_CATEGORY[categoryId];
    if (preferredKey) {
      const submenu = category.submenus.find((s) => s.route === preferredKey);
      if (submenu && !submenu.hidden) {
        const hasPermission = (() => {
          if (Array.isArray(submenu.permissionsAny) && submenu.permissionsAny.length > 0) {
            return (
              (hasPrivilege && submenu.permissionsAny.some((p) => hasPrivilege(p))) || isAdmin
            );
          }
          return !submenu.permission || (hasPrivilege && hasPrivilege(submenu.permission));
        })();
        const hasRole = !submenu.roles || hasConfiguredRole(user, submenu.roles);
        if (hasPermission && hasRole) {
          if (submenu.route && ROUTES[submenu.route]) return ROUTES[submenu.route];
          if (submenu.to) return submenu.to;
        }
      }
    }

    for (const submenu of category.submenus) {
      if (submenu.hidden) continue;
      if (Array.isArray(submenu.permissionsAny) && submenu.permissionsAny.length > 0) {
        const pass =
          (hasPrivilege && submenu.permissionsAny.some((p) => hasPrivilege(p))) || isAdmin;
        if (!pass) continue;
      } else if (submenu.permission && hasPrivilege && !hasPrivilege(submenu.permission)) continue;
      if (submenu.roles && user && !hasConfiguredRole(user, submenu.roles)) continue;
      if (submenu.route && ROUTES[submenu.route]) return ROUTES[submenu.route];
      if (submenu.to) return submenu.to;
    }
    return null;
  };

  // Sync ribbon category from URL + navigate to default when switching tabs (same tick as stale category was the flicker bug)
  useEffect(() => {
    if (!selectedCategoryId) return;

    const currentPath = location.pathname;
    const standaloneAllowedRoutes = new Set([ROUTES.HELP_SUPPORT, ROUTES.VERIFY_CERTIFICATE]);
    if (standaloneAllowedRoutes.has(currentPath)) {
      manualSelectionRef.current = false;
      return;
    }

    const categoryForPath = findCategoryIdForPath(currentPath, menuCategories);
    // Path is valid in the app but not listed in this user's filtered menu (e.g. finance
    // without document.read_all). Do not redirect to another ribbon tab's default route.
    if (!categoryForPath) {
      manualSelectionRef.current = false;
      return;
    }
    // In-app navigation (sidebar, quick actions, notifications) updates URL before React state; align ribbon and do not redirect away
    if (!manualSelectionRef.current && categoryForPath && categoryForPath !== selectedCategoryId) {
      setSelectedCategoryId(categoryForPath);
      manualSelectionRef.current = false;
      return;
    }

    // Get all routes for the selected category
    const category = menuCategories.find((cat) => cat.id === selectedCategoryId);
    if (!category || !category.submenus) return;
    
    const categoryRoutes = category.submenus
      .map(s => {
        const route = s.route && ROUTES[s.route] ? ROUTES[s.route] : s.to;
        return route ? String(route).split('?')[0] : null;
      })
      .filter(Boolean);
    
    // Check if we're already on a route in this category
    const isOnCategoryRoute = categoryRoutes.some(route => {
      const routePath = String(route).split('?')[0];
      return currentPath === routePath || currentPath.startsWith(routePath + '/');
    });
    
    // If current URL is not under the selected ribbon category, go to that category's default screen.
    // (Do not skip navigation just because the path matches a *different* category — that blocked tab switches before.)
    if (!isOnCategoryRoute) {
      const defaultRoute = getDefaultRouteForCategory(selectedCategoryId);
      if (defaultRoute) {
        manualSelectionRef.current = false;
        navigate(defaultRoute);
      } else {
        manualSelectionRef.current = false;
      }
    } else {
      manualSelectionRef.current = false;
    }
  }, [selectedCategoryId, menuCategories, navigate, location.pathname, hasPrivilege, user]);

  // Keyboard shortcuts: Alt+1..4 to switch categories quickly
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= menuCategories.length) {
        const category = menuCategories[num - 1];
        if (category) {
          setSelectedCategoryId(category.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin, menuCategories, setSelectedCategoryId]);

  if (layoutMode === 'tree') {
    return null;
  }

  return (
    <Box sx={{
      position: 'sticky',
      top: '48px',
      zIndex: 998,
      // Glass / gradient background
      bgcolor: theme.palette.mode === 'dark' ? 'rgba(20,25,30,0.65)' : 'rgba(255,255,255,0.7)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      backgroundImage: theme.palette.mode === 'dark'
        ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))'
        : 'linear-gradient(180deg, rgba(0,0,0,0.03), rgba(0,0,0,0))',
      borderBottom: `1px solid ${theme.palette.divider}`,
      boxShadow: theme.palette.mode === 'dark' ? 'inset 0 -1px 0 rgba(255,255,255,0.06)' : '0 2px 8px rgba(0,0,0,0.06)',
      marginTop: 0,
      marginBottom: 0,
    }}
    onMouseEnter={() => {
      // Prevent collapse when hovering over the ribbon
      setCollapsed(false);
    }}
    onMouseLeave={() => { 
      // Collapse if scrolled
      if (window.scrollY > 80) {
        setCollapsed(true);
      }
    }}
    >
      {/* Segmented ribbon bar — minHeight fits two-line labels (e.g. Financial Tracking) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          px: 0.75,
          py: collapsed ? 0.375 : 0.5,
          minHeight: collapsed ? 40 : 52,
          transition: 'min-height 0.2s ease-in-out, padding 0.2s ease-in-out',
          overflow: 'visible',
        }}
      >
        {menuCategories.map((category, idx, arr) => {
          const IconComponent = ICON_MAP[category.icon] || DashboardIcon;
          const isActive = category.id === selectedCategoryId;
          return (
            <Button
            key={category.id}
            onClick={() => {
              manualSelectionRef.current = true; // Mark as manual selection
              setSelectedCategoryId(category.id);
              setCollapsed(false);
            }}
            startIcon={<IconComponent sx={{ fontSize: collapsed ? 18 : 20 }} />}
            disableElevation
            sx={{
              flex: 1,
              textTransform: 'none',
              color: '#fff',
              fontWeight: 600,
              letterSpacing: 0.2,
              fontSize: collapsed ? 10.5 : 11,
              lineHeight: 1.25,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              minHeight: collapsed ? 36 : 46,
              height: 'auto',
              py: 0.75,
              px: 0.5,
              transition: 'min-height 0.2s ease-in-out, background 0.15s ease-in-out, font-size 0.2s ease-in-out',
              borderRadius: 0,
              borderTopLeftRadius: idx === 0 ? 8 : 0,
              borderBottomLeftRadius: idx === 0 ? 8 : 0,
              borderTopRightRadius: idx === arr.length - 1 ? 8 : 0,
              borderBottomRightRadius: idx === arr.length - 1 ? 8 : 0,
              background: isActive
                ? 'linear-gradient(180deg, #1099b6, #0e8ea9)'
                : 'linear-gradient(180deg, #28b9d4, #18a8c4)',
              boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.15), 0 2px 6px rgba(0,0,0,0.15)' : 'inset 0 0 0 1px rgba(255,255,255,0.12)',
              '&:hover': {
                background: isActive
                  ? 'linear-gradient(180deg, #0f91ae, #0c86a2)'
                  : 'linear-gradient(180deg, #22b2ce, #159fba)'
              },
              borderRight: idx !== arr.length - 1 ? '1px solid rgba(255,255,255,0.25)' : 'none',
              justifyContent: 'center',
              alignItems: 'center',
              '& .MuiButton-startIcon': {
                marginRight: '6px',
                marginLeft: 0,
                alignSelf: 'center',
              },
            }}
          >
            {categoryNavLabel(category)}
          </Button>
          );
        })}
      </Box>

      {/* Removed submenu row - submenus now appear in sidebar */}
    </Box>
  );
}


