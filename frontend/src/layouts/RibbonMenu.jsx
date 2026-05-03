import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Box, Button, Tooltip, useTheme } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
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
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getFilteredMenuCategories, hasConfiguredRole } from '../configs/menuConfigUtils.js';
import { useMenuCategory } from '../context/MenuCategoryContext.jsx';

/** First sidebar destination when switching ribbon tab (menuConfig `route` keys). */
const DEFAULT_ROUTE_KEY_BY_CATEGORY = {
  dashboard: 'PROJECT_BY_STATUS_DASHBOARD',
  finance: 'FINANCE_PAYMENT_CERTIFICATES',
  reporting: 'PROJECTS',
  management: 'BUDGET_MANAGEMENT',
  public: 'PUBLIC_APPROVAL',
  admin: 'USER_MANAGEMENT',
};

/** Which ribbon category owns this pathname (first match in menu order). */
function findCategoryIdForPath(pathname, menuCategories) {
  for (const cat of menuCategories) {
    if (!cat.submenus?.length) continue;
    for (const sub of cat.submenus) {
      const route = sub.route && ROUTES[sub.route] ? ROUTES[sub.route] : sub.to;
      if (!route) continue;
      const routePath = String(route).split('?')[0];
      if (pathname === routePath || pathname.startsWith(`${routePath}/`)) {
        return cat.id;
      }
    }
  }
  return null;
}

// Icon mapping for Material-UI icons
const ICON_MAP = {
  DashboardIcon,
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
  MenuBookIcon,
  LocationOnIcon,
  WorkIcon,
  DescriptionIcon,
  AttachMoneyIcon,
  ShowChartIcon,
  StraightenIcon,
};

// Simple ribbon-like top menu with grouped actions - Click-based only, no hover switching
export default function RibbonMenu({ isAdmin = false }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPrivilege, user } = useAuth();
  const { selectedCategoryId, setSelectedCategoryId } = useMenuCategory();
  const [collapsed, setCollapsed] = useState(false);
  const manualSelectionRef = useRef(false); // Track manual category selections
  
  // Get filtered menu categories based on user permissions (memoized to prevent unnecessary recalculations)
  const menuCategories = useMemo(() => {
    return getFilteredMenuCategories(isAdmin, hasPrivilege, user);
  }, [isAdmin, hasPrivilege, user]);
  
  // Find the index of the selected category
  const selectedCategoryIndex = useMemo(() => {
    const index = menuCategories.findIndex(cat => cat.id === selectedCategoryId);
    return index >= 0 ? index : 0;
  }, [selectedCategoryId, menuCategories]);
  
  const go = (to) => () => navigate(to);

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
        const hasPermission =
          !submenu.permission || (hasPrivilege && hasPrivilege(submenu.permission));
        const hasRole = !submenu.roles || hasConfiguredRole(user, submenu.roles);
        if (hasPermission && hasRole) {
          if (submenu.route && ROUTES[submenu.route]) return ROUTES[submenu.route];
          if (submenu.to) return submenu.to;
        }
      }
    }

    for (const submenu of category.submenus) {
      if (submenu.hidden) continue;
      if (submenu.permission && hasPrivilege && !hasPrivilege(submenu.permission)) continue;
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
    const standaloneAllowedRoutes = new Set([ROUTES.HELP_SUPPORT]);
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


  const Btn = ({ title, icon, to, route, onClick }) => {
    const IconComponent = ICON_MAP[icon] || DashboardIcon;
    const targetRoute = route && ROUTES[route] ? ROUTES[route] : to;
    const isActive = targetRoute && location.pathname.includes(String(targetRoute).split('?')[0]);
    
    return (
      <Tooltip title={title} arrow>
        <Button size="small" variant="contained" onClick={onClick || go(targetRoute)}
          sx={{
            px: 0.75,
            minWidth: 50,
            lineHeight: 1.2,
            fontSize: 10,
            height: 38,
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            textTransform: 'none',
            letterSpacing: 0.3,
            color: '#fff',
            background: isActive
              ? 'linear-gradient(180deg, #1e40af, #1e3a8a)'
              : 'linear-gradient(180deg, #3b82f6, #2563eb)',
            border: isActive 
              ? '2px solid #00FFFF'
              : '1px solid rgba(255,255,255,0.3)',
            boxShadow: isActive
              ? '0 4px 8px rgba(0,0,0,0.15), inset 0 0 8px rgba(0,255,255,0.2), 0 0 12px rgba(0,255,255,0.3)'
              : '0 2px 6px rgba(0,0,0,0.1)',
            transition: 'transform 120ms ease, box-shadow 120ms ease, background 120ms ease',
            '&:hover': {
              transform: 'translateY(-1px)',
              background: isActive
                ? 'linear-gradient(180deg, #1e40af, #1e3a8a)'
                : 'linear-gradient(180deg, #2563eb, #1d4ed8)'
            },
            '&:active': {
              transform: 'translateY(0px)',
            }
          }}>
          <Box sx={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.35)',
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.2)'
          }}>
            <Box sx={{ lineHeight: 0, fontSize: 18, color: isActive ? '#00FFFF' : '#FFD700' }}>
              <IconComponent fontSize="small" />
            </Box>
          </Box>
          <Box component="span" className="label" sx={{ display: { xs: 'none', sm: 'inline' } }}>{title}</Box>
        </Button>
      </Tooltip>
    );
  };

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
      {/* Segmented ribbon bar */}
      <Box sx={{
        display: 'flex',
        gap: 0,
        px: 0.75,
        py: 0.25,
        height: collapsed ? 22 : 26,
        transition: 'height 0.2s ease-in-out',
        overflow: 'hidden',
      }}>
        {menuCategories.map((category, idx, arr) => {
          const IconComponent = ICON_MAP[category.icon] || DashboardIcon;
          const isActive = category.id === selectedCategoryId;
          return (
            <Button
            key={category.label}
            onClick={() => {
              manualSelectionRef.current = true; // Mark as manual selection
              setSelectedCategoryId(category.id);
              setCollapsed(false);
            }}
            startIcon={<IconComponent fontSize="small" />}
            disableElevation
            sx={{
              flex: 1,
              textTransform: 'none',
              color: '#fff',
              fontWeight: 600,
              letterSpacing: 0.25,
              fontSize: 11,
              height: collapsed ? 22 : 26,
              transition: 'height 0.2s ease-in-out, background 0.15s ease-in-out',
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
            }}
          >
            {category.label}
          </Button>
          );
        })}
      </Box>

      {/* Removed submenu row - submenus now appear in sidebar */}
    </Box>
  );
}


