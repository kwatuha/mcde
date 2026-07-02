import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { 
  Box, 
  IconButton, 
  Typography, 
  useTheme, 
  Divider, 
  Tooltip, 
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  Fade,
  Zoom,
  Avatar,
  Badge,
  Chip,
  LinearProgress,
  Drawer,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
// ✨ Removed old theme system - using modern theme directly!
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TableChartIcon from '@mui/icons-material/TableChart';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AssessmentIcon from '@mui/icons-material/Assessment';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import HubIcon from '@mui/icons-material/Hub';
import MapIcon from '@mui/icons-material/Map';
import GroupIcon from '@mui/icons-material/Group';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import PaidIcon from '@mui/icons-material/Paid';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import Comment from '@mui/icons-material/Comment';
import StarIcon from '@mui/icons-material/Star';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PublicIcon from '@mui/icons-material/Public';
import FeedbackIcon from '@mui/icons-material/Feedback';
import ApprovalIcon from '@mui/icons-material/Approval';
import StorageIcon from '@mui/icons-material/Storage';
import WorkIcon from '@mui/icons-material/Work';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CategoryIcon from '@mui/icons-material/Category';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import DescriptionIcon from '@mui/icons-material/Description';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import StraightenIcon from '@mui/icons-material/Straighten';
import HistoryIcon from '@mui/icons-material/History';
import WorkHistoryIcon from '@mui/icons-material/WorkHistory';
import GridViewIcon from '@mui/icons-material/GridView';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import GroupsIcon from '@mui/icons-material/Groups';
import HandshakeIcon from '@mui/icons-material/Handshake';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EventNoteIcon from '@mui/icons-material/EventNote';
import CelebrationIcon from '@mui/icons-material/Celebration';
import GavelIcon from '@mui/icons-material/Gavel';
import ChecklistIcon from '@mui/icons-material/Checklist';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import SpeedIcon from '@mui/icons-material/Speed';
import ArticleIcon from '@mui/icons-material/Article';
import UpdateIcon from '@mui/icons-material/Update';
import EngineeringIcon from '@mui/icons-material/Engineering';

import { useAuth } from '../context/AuthContext.jsx';
import { useMenuCategory } from '../context/MenuCategoryContext.jsx';
import { useSidebar } from '../context/SidebarContext.jsx';
import { useNavigationLayout } from '../context/NavigationLayoutContext.jsx';
import { ROUTES } from '../configs/appConfig.js';
import { sortMenuCategoriesForNav } from '../configs/navigationLayoutConfig.js';
import {
  TREE_NAV_PANEL_BG as TREE_PANEL_BG,
  TREE_NAV_PANEL_GRAD as TREE_PANEL_GRAD,
  TREE_NAV_BORDER as TREE_BORDER,
} from '../configs/treeNavChrome.js';
import { findCategoryIdForPath, getFilteredMenuCategories, hasConfiguredRole } from '../configs/menuConfigUtils.js';
import { isAdmin, normalizeRoleName, isContractor, isEngineerPortalUser } from '../utils/privilegeUtils.js';
import { isSuperAdminUser } from '../utils/roleUtils.js';
import gprisLogo from '../assets/gpris.png';
import logoFallback from '../assets/logo.png';

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
  AttachMoneyIcon,
  WorkIcon,
  LocationOnIcon,
  ApartmentIcon,
  CategoryIcon,
  MenuBookIcon,
  DescriptionIcon,
  ShowChartIcon,
  StraightenIcon,
  HistoryIcon,
  WorkHistoryIcon,
  GridViewIcon,
  AnalyticsIcon,
  GroupsIcon,
  HandshakeIcon,
  FactCheckIcon,
  ScheduleIcon,
  EventNoteIcon,
  CelebrationIcon,
  GavelIcon,
  ChecklistIcon,
  PhoneAndroidIcon,
  VerifiedUserIcon,
  SpeedIcon,
  ArticleIcon,
  UpdateIcon,
  HubIcon,
};

/** Tree sidebar tokens (panel/border from treeNavChrome.js). */
const TREE_TEXT_MAIN = 'rgba(255,255,255,0.95)';
const TREE_TEXT_SUB = 'rgba(255,255,255,0.88)';
const TREE_ICON = 'rgba(255,255,255,0.9)';
const TREE_HOVER = 'rgba(255,255,255,0.1)';
const TREE_SEL_NESTED = 'rgba(255,255,255,0.2)';
const TREE_SEL_PARENT = 'rgba(255,255,255,0.16)';

/** Visible submenu rows for one ribbon category (shared by ribbon sidebar & tree sidebar). */
function filterCategorySubmenusToNavItems(category, hasPrivilege, user, isAdminLike) {
  if (!category?.submenus) return [];
  return category.submenus
    .filter((submenu) => {
      if (submenu.hidden) return false;
      if (submenu.superAdminOnly && !isSuperAdminUser(user)) return false;
      if (submenu.permission && submenu.roles) {
        const hasPermission = hasPrivilege && hasPrivilege(submenu.permission);
        const hasRole = hasConfiguredRole(user, submenu.roles);
        return hasPermission || hasRole;
      }
      if (Array.isArray(submenu.permissionsAny) && submenu.permissionsAny.length > 0) {
        const any = hasPrivilege && submenu.permissionsAny.some((p) => hasPrivilege(p));
        if (!any && !isAdminLike) return false;
      } else if (submenu.permission && hasPrivilege && !hasPrivilege(submenu.permission)) {
        return false;
      }
      if (submenu.roles && user && !hasConfiguredRole(user, submenu.roles)) {
        return false;
      }
      return true;
    })
    .map((submenu) => {
      const route = submenu.route && ROUTES[submenu.route] ? ROUTES[submenu.route] : submenu.to;
      const IconComponent = ICON_MAP[submenu.icon] || DashboardIcon;
      return {
        title: submenu.title,
        to: route,
        icon: <IconComponent />,
      };
    });
}

const Item = memo(({ title, to, icon, selected, setSelected, privilegeCheck, theme, isCollapsed, nested, treeChrome, onAfterNavigate }) => {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    setSelected(to);
    navigate(to);
    onAfterNavigate?.();
  }, [to, setSelected, navigate, onAfterNavigate]);

  if (privilegeCheck && !privilegeCheck()) {
    return null;
  }

  const isSel = selected === to;
  const labelColor = treeChrome
    ? nested
      ? isSel
        ? '#ffffff'
        : TREE_TEXT_SUB
      : isSel
        ? '#ffffff'
        : TREE_TEXT_MAIN
    : isSel
      ? theme.palette.primary.main
      : theme.palette.text.primary;

  return (
    <Tooltip title={isCollapsed ? title : ''} placement="right" arrow>
      <Box
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          padding: isCollapsed
            ? '8px'
            : treeChrome
              ? nested
                ? '3px 8px 3px 12px'
                : '4px 8px'
              : nested
                ? '5px 10px 5px 18px'
                : '6px 10px',
          margin: treeChrome ? '1px 4px' : '2px 6px',
          borderRadius: treeChrome ? '5px' : '6px',
          cursor: 'pointer',
          backgroundColor: treeChrome
            ? isSel
              ? nested
                ? TREE_SEL_NESTED
                : TREE_SEL_PARENT
              : 'transparent'
            : isSel
              ? theme.palette.action.selected
              : 'transparent',
          color: labelColor,
          '&:hover': {
            backgroundColor: treeChrome ? TREE_HOVER : theme.palette.action.hover,
            transform: isCollapsed ? 'scale(1.1)' : 'translateX(2px)',
            transition: 'all 0.2s ease-in-out',
          },
        }}
      >
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginRight: isCollapsed ? 0 : treeChrome ? '7px' : '10px',
        minWidth: isCollapsed ? 'auto' : treeChrome ? '17px' : '20px',
        justifyContent: 'center',
        '& svg': {
          fontSize: isCollapsed
            ? '20px'
            : treeChrome
              ? nested
                ? '15px'
                : '17px'
              : nested
                ? '16px'
                : '18px',
          color: treeChrome ? TREE_ICON : undefined,
        },
      }}>
        {icon}
      </Box>
        {!isCollapsed && (
          <Typography 
            variant="body2" 
            sx={{ 
              fontSize: treeChrome ? (nested ? '0.78rem' : '0.8125rem') : nested ? '0.78rem' : '0.8rem',
              fontWeight: selected === to ? '600' : nested ? '500' : '500',
              overflow: 'hidden', 
              whiteSpace: 'nowrap', 
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});

const MenuGroup = ({ title, icon, children, isOpen, onToggle, theme, colors, isCollapsed, treeChrome, isActiveGroup = false }) => {
  /* CIMES-like: one muted strip for the route’s category; inactive rows stay clean (no “always on” tint). */
  const headerBg = treeChrome
    ? isActiveGroup
      ? 'rgba(255,255,255,0.14)'
      : 'transparent'
    : isActiveGroup
      ? 'rgba(255,255,255,0.14)'
      : 'transparent';

  const headerHoverBg = treeChrome
    ? isActiveGroup
      ? 'rgba(255,255,255,0.22)'
      : TREE_HOVER
    : isActiveGroup
      ? 'rgba(255,255,255,0.18)'
      : 'rgba(255,255,255,0.08)';

  return (
    <Box>
      <Tooltip title={isCollapsed ? title : ''} placement="right" arrow>
        <Box
          onClick={onToggle}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            padding: isCollapsed ? '10px' : treeChrome ? '6px 10px' : '10px 12px',
            margin: treeChrome ? '2px 6px' : '4px 8px',
            borderRadius: treeChrome ? '5px' : '6px',
            cursor: 'pointer',
            backgroundColor: headerBg,
            color: treeChrome ? TREE_TEXT_MAIN : theme.palette.text.primary,
            '&:hover': {
              backgroundColor: headerHoverBg,
              transition: 'all 0.2s ease-in-out',
            },
            '& .MuiSvgIcon-root': treeChrome ? { color: TREE_ICON } : {},
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', marginRight: isCollapsed ? 0 : treeChrome ? '8px' : '12px' }}>
              {icon}
            </Box>
            {!isCollapsed && (
              <>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontSize: treeChrome ? '0.8125rem' : '0.9rem',
                    fontWeight: '700',
                    overflow: 'visible', 
                    whiteSpace: 'nowrap', 
                    textOverflow: 'unset',
                    flex: 1,
                    letterSpacing: treeChrome ? '0.02em' : undefined,
                  }}
                >
                  {title}
                </Typography>
                {isOpen ? (
                  <ExpandLessIcon sx={{ fontSize: treeChrome ? '17px' : '18px' }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: treeChrome ? '17px' : '18px' }} />
                )}
              </>
            )}
          </Box>
        </Box>
      </Tooltip>
      {!isCollapsed && (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <Box sx={{ pl: treeChrome ? 0.25 : 0.5 }}>
            {children}
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

const SearchableMenu = ({ items, selected, setSelected, theme, isCollapsed, nested, treeChrome, onAfterNavigate }) => {
  return (
    <Fade in={true} timeout={300}>
      <Box>
        {items.map((item, index) => (
          <Zoom in={true} timeout={300 + index * 50} key={index}>
            <Box>
              <Item
                title={item.title}
                to={item.to}
                icon={item.icon}
                selected={selected}
                setSelected={setSelected}
                privilegeCheck={item.privilege}
                theme={theme}
                isCollapsed={isCollapsed}
                nested={nested}
                treeChrome={treeChrome}
                onAfterNavigate={onAfterNavigate}
              />
            </Box>
          </Zoom>
        ))}
      </Box>
    </Fade>
  );
};

const Sidebar = ({
  expandedSidebarWidth = 200,
  treeSidebarFlushTop = false,
  mobileOpen = false,
  onMobileClose,
  isPinnedOpen = false,
  onTogglePinned,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { selectedCategoryId } = useMenuCategory();
  const { user, hasPrivilege } = useAuth();
  
  // ✨ Compatibility layer for theme colors (simplified from old token system)
  const colors = {
    grey: theme.palette.grey,
    primary: {
      50: theme.palette.background.default,
      100: theme.palette.background.paper,
      300: theme.palette.action.selected,
      400: theme.palette.background.paper,
      500: theme.palette.primary.dark,
      600: theme.palette.primary.main,
    },
    blueAccent: {
      200: theme.palette.primary.light,
      300: theme.palette.primary.light,
      400: theme.palette.primary.main,
      500: theme.palette.primary.main,
      600: theme.palette.primary.dark,
    },
    greenAccent: {
      400: theme.palette.success.light,
      600: theme.palette.success.main,
    }
  };
  
  const location = useLocation();
  const { isTreeLayout } = useNavigationLayout();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  
  const fullPath = `${location.pathname}${location.search || ''}`;
  const [selected, setSelected] = useState(fullPath);
  const previousFullPathRef = useRef(fullPath);
  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  const isAdminLike = isAdmin(user);
  const showContractorMenu = isContractor(user);
  const showEngineerMenu = isEngineerPortalUser(user);

  // Memoize setSelected to prevent Item components from re-rendering unnecessarily
  const stableSetSelected = useCallback((value) => {
    setSelected(value);
  }, []);

  const handleLogoHomeNavigation = useCallback(() => {
    setSelected(ROUTES.DASHBOARD);
    navigate(ROUTES.DASHBOARD);
    if (isMobile && typeof onMobileClose === 'function') onMobileClose();
  }, [navigate, isMobile, onMobileClose]);

  const closeMobileNav = useCallback(() => {
    if (isMobile && typeof onMobileClose === 'function') onMobileClose();
  }, [isMobile, onMobileClose]);

  const handleLogoKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleLogoHomeNavigation();
    }
  }, [handleLogoHomeNavigation]);
  
  // Get sidebar collapse state from context
  const { isCollapsed } = useSidebar();
  const effectiveCollapsed = isMobile ? false : isCollapsed;
  
  // Get filtered menu categories (tree layout uses CIMES-style category order)
  const menuCategories = useMemo(() => {
    const cats = getFilteredMenuCategories(isAdminLike, hasPrivilege, user);
    return sortMenuCategoriesForNav(cats);
  }, [hasPrivilege, user, isAdminLike]);

  const [openTreeGroups, setOpenTreeGroups] = useState(() => new Set());
  const [treeSidebarLogoFailed, setTreeSidebarLogoFailed] = useState(false);
  /** Accordion: opening one category collapses others (less sidebar scrolling). */
  const toggleTreeGroup = useCallback((id) => {
    setOpenTreeGroups((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const activeCategoryIdForPath = useMemo(
    () => findCategoryIdForPath(location.pathname, menuCategories),
    [location.pathname, menuCategories]
  );

  useEffect(() => {
    if ((!isTreeLayout && !isMobile) || !activeCategoryIdForPath || showContractorMenu || showEngineerMenu) return;
    setOpenTreeGroups(new Set([activeCategoryIdForPath]));
  }, [isTreeLayout, isMobile, activeCategoryIdForPath, showContractorMenu, showEngineerMenu]);

  useEffect(() => {
    if ((!isTreeLayout && !isMobile) || !showContractorMenu) return;
    setOpenTreeGroups((prev) => {
      if (prev.has('contractor-root')) return prev;
      const next = new Set(prev);
      next.add('contractor-root');
      return next;
    });
  }, [isTreeLayout, isMobile, showContractorMenu]);

  useEffect(() => {
    if ((!isTreeLayout && !isMobile) || !showEngineerMenu) return;
    setOpenTreeGroups((prev) => {
      if (prev.has('engineer-root')) return prev;
      const next = new Set(prev);
      next.add('engineer-root');
      return next;
    });
  }, [isTreeLayout, isMobile, showEngineerMenu]);

  /** When the mobile drawer opens, expand the current section so items are visible immediately. */
  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    if (showContractorMenu) {
      setOpenTreeGroups(new Set(['contractor-root']));
      return;
    }
    if (showEngineerMenu) {
      setOpenTreeGroups(new Set(['engineer-root']));
      return;
    }
    if (activeCategoryIdForPath) {
      setOpenTreeGroups(new Set([activeCategoryIdForPath]));
    } else if (menuCategories.length > 0) {
      setOpenTreeGroups(new Set([menuCategories[0].id]));
    }
  }, [isMobile, mobileOpen, activeCategoryIdForPath, showContractorMenu, showEngineerMenu, menuCategories]);

  // Get the selected category and its submenus
  const selectedCategory = useMemo(() => {
    return menuCategories.find(cat => cat.id === selectedCategoryId) || menuCategories[0];
  }, [selectedCategoryId, menuCategories]);
  
  // Get submenu items for the selected category
  const submenuItems = useMemo(
    () => filterCategorySubmenusToNavItems(selectedCategory, hasPrivilege, user, isAdminLike),
    [selectedCategory, hasPrivilege, user, isAdminLike]
  );
  
  // Update selected state when route changes (pathname + query for e.g. planning indicators section)
  useEffect(() => {
    const currentFull = `${location.pathname}${location.search || ''}`;
    if (currentFull !== previousFullPathRef.current) {
      previousFullPathRef.current = currentFull;
      setSelected((prev) => (prev !== currentFull ? currentFull : prev));
      if (isMobile && typeof onMobileClose === 'function') onMobileClose();
    }
  }, [location.pathname, location.search, isMobile, onMobileClose]);

  // Organized menu groups
  const dashboardItems = [
    { title: "Dashboard", to: ROUTES.DASHBOARD, icon: <DashboardIcon /> },
    { title: "Raw Data", to: ROUTES.RAW_DATA, icon: <TableChartIcon /> },
    { title: "Projects", to: ROUTES.PROJECTS, icon: <FolderOpenIcon /> },
    { title: "Personal Dashboard", to: ROUTES.CONTRACTOR_DASHBOARD, icon: <PaidIcon /> },
  ];

  const reportingItems = [
    { title: "Reports hub", to: ROUTES.REPORTS_HUB, icon: <HubOutlinedIcon /> },
    { title: "Project charts", to: ROUTES.REPORTS, icon: <AssessmentIcon /> },
    // { title: "Project Dashboards", to: ROUTES.REPORTING_OVERVIEW, icon: <AssessmentIcon /> }, // Hidden
    { title: "Regional Rpts", to: ROUTES.REGIONAL_DASHBOARD, icon: <AssessmentIcon /> },
    { title: "Regional Dashboards", to: ROUTES.REGIONAL_REPORTING, icon: <AssessmentIcon /> },
    { title: "Quarterly Implementation Report", to: ROUTES.QUARTERLY_IMPLEMENTATION_REPORT, icon: <AssessmentIcon /> },
  ];

  const managementItems = [
    { title: "Central Data Import", to: "/data-import", icon: <CloudUploadIcon /> },
  ];

  /* SCOPE_DOWN: hide workflow, approval-levels (admin); feedback-management, county-proposed-projects, project-announcements (public). Re-enable when restoring. */
  const adminItems = [
    { title: "Admin Dashboard", to: ROUTES.ADMIN, icon: <SettingsIcon /> },
    { title: "User Management", to: ROUTES.USER_MANAGEMENT, icon: <GroupIcon /> },
    { title: "Audit trail", to: ROUTES.AUDIT_TRAIL, icon: <HistoryIcon /> },
    // { title: "Workflow Management", to: ROUTES.WORKFLOW_MANAGEMENT, icon: <AccountTreeIcon />, privilege: () => hasPrivilege('project_workflow.read') },
    // { title: "Approval Levels", to: ROUTES.APPROVAL_LEVELS_MANAGEMENT, icon: <SettingsIcon />, privilege: () => hasPrivilege('approval_levels.read') },
    // { title: "Feedback Management", to: ROUTES.FEEDBACK_MANAGEMENT, icon: <Comment />, privilege: () => hasPrivilege('feedback.respond') || isAdminLike },
    // { title: "Metadata Management", to: ROUTES.METADATA_MANAGEMENT, icon: <SettingsIcon /> }, // Hidden
    { title: "Contractor Management", to: ROUTES.CONTRACTOR_MANAGEMENT, icon: <BusinessIcon /> },
    // { title: "Proposed Projects", to: ROUTES.COUNTY_PROPOSED_PROJECTS, icon: <AssignmentIcon /> },
    // { title: "Project Announcements", to: ROUTES.PROJECT_ANNOUNCEMENTS, icon: <AnnouncementIcon /> },
  ];

  const contractorItems = [
    { title: "Personal Dashboard", to: ROUTES.CONTRACTOR_DASHBOARD, icon: <FolderOpenIcon /> },
    { title: "Payment Requests", to: `${ROUTES.CONTRACTOR_DASHBOARD}/payments`, icon: <PaidIcon /> },
    { title: "Progress Photos", to: `${ROUTES.CONTRACTOR_DASHBOARD}/photos`, icon: <PhotoCameraIcon /> },
    { title: "Project Files", to: `${ROUTES.CONTRACTOR_DASHBOARD}/project-files`, icon: <UploadFileIcon /> },
  ];

  const engineerItems = [
    { title: "Workspace", to: ROUTES.ENGINEER_WORKSPACE, icon: <EngineeringIcon /> },
    { title: "Project Registry", to: `${ROUTES.ENGINEER_WORKSPACE}/projects`, icon: <FolderOpenIcon /> },
    { title: "Progress Photos", to: `${ROUTES.ENGINEER_WORKSPACE}/progress-photos`, icon: <PhotoCameraIcon /> },
    { title: "Payment Requests", to: `${ROUTES.ENGINEER_WORKSPACE}/payments`, icon: <PaidIcon /> },
    { title: "Certificates", to: `${ROUTES.ENGINEER_WORKSPACE}/certificates`, icon: <FactCheckIcon /> },
  ];

  // Get all items for search
  const allItems = useMemo(() => {
    if (showContractorMenu) {
      return contractorItems;
    }
    if (showEngineerMenu) {
      return engineerItems;
    }
    if (isAdminLike) {
      return [...dashboardItems, ...reportingItems, ...managementItems, ...adminItems];
    }
    return [...dashboardItems, ...reportingItems, ...managementItems];
  }, [showContractorMenu, showEngineerMenu, isAdminLike]);

  const collapsedWidth = 64; // Width with icons only
  const currentWidth = effectiveCollapsed ? collapsedWidth : expandedSidebarWidth;
  const treeChromeLight = isTreeLayout && theme.palette.mode !== 'dark';
  const sidebarTop = treeSidebarFlushTop ? 0 : '48px';
  const sidebarHeight = treeSidebarFlushTop ? '100vh' : 'calc(100vh - 48px)';
  const treeBrandMt = treeSidebarFlushTop ? 1 : 4;
  const treeBrandLogoH = treeSidebarFlushTop ? 44 : 40;
  const treeBrandLogoMaxW = treeSidebarFlushTop ? 128 : 118;

  /** Mobile drawer and tree layout both show the full category tree (ribbon mode only shows section items on desktop). */
  const showFullTreeMenu = isTreeLayout || isMobile;
  const menuTreeChrome = showFullTreeMenu && theme.palette.mode !== 'dark';

  const panelBackground = theme.palette.mode === 'dark'
    ? colors.primary[600]
    : menuTreeChrome
      ? TREE_PANEL_GRAD
      : '#81d4fa';

  const panelBorderColor = theme.palette.mode === 'dark'
    ? colors.primary[400]
    : menuTreeChrome
      ? 'rgba(255,255,255,0.14)'
      : '#4fc3f7';

  const sidebarMenuContent = (
    <>
          {showFullTreeMenu ? (
            <>
              {/* CIMES-style brand strip (tree layout only; emblem matches AppBar) */}
              {!effectiveCollapsed ? (
                <Box
                  role="button"
                  tabIndex={0}
                  aria-label="Go to home page"
                  onClick={handleLogoHomeNavigation}
                  onKeyDown={handleLogoKeyDown}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    mt: treeBrandMt,
                    mb: 0.5,
                    px: 1,
                    minHeight: 36,
                    cursor: 'pointer',
                    borderRadius: 1,
                    '&:hover': {
                      backgroundColor: menuTreeChrome ? 'rgba(255,255,255,0.10)' : theme.palette.action.hover,
                    },
                    '&:focus-visible': {
                      outline: `2px solid ${menuTreeChrome ? 'rgba(255,255,255,0.75)' : theme.palette.primary.main}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Box
                    component="img"
                    src={treeSidebarLogoFailed ? logoFallback : gprisLogo}
                    alt=""
                    aria-hidden
                    onError={() => setTreeSidebarLogoFailed(true)}
                    sx={{
                      height: treeBrandLogoH,
                      width: 'auto',
                      maxWidth: treeBrandLogoMaxW,
                      objectFit: 'contain',
                      objectPosition: 'center left',
                      flexShrink: 0,
                      display: 'block',
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))',
                    }}
                  />
                  <Typography
                    component="div"
                    sx={{
                      fontWeight: 800,
                      fontSize: '1.125rem',
                      color: menuTreeChrome ? '#ffffff' : theme.palette.common.white,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.15,
                      minWidth: 0,
                    }}
                  >
                    MCMES
                  </Typography>
                </Box>
              ) : (
                <Tooltip title="MCMES" placement="right" arrow>
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label="Go to home page"
                    onClick={handleLogoHomeNavigation}
                    onKeyDown={handleLogoKeyDown}
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      mt: treeBrandMt,
                      mb: 0.5,
                      px: 0.5,
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': {
                        backgroundColor: menuTreeChrome ? 'rgba(255,255,255,0.10)' : theme.palette.action.hover,
                      },
                      '&:focus-visible': {
                        outline: `2px solid ${menuTreeChrome ? 'rgba(255,255,255,0.75)' : theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <Box
                      component="img"
                      src={treeSidebarLogoFailed ? logoFallback : gprisLogo}
                      alt=""
                      aria-hidden
                      onError={() => setTreeSidebarLogoFailed(true)}
                      sx={{
                        height: treeSidebarFlushTop ? 36 : 34,
                        width: 'auto',
                        maxWidth: 44,
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))',
                      }}
                    />
                  </Box>
                </Tooltip>
              )}
              <Divider
                sx={{
                  mx: 1,
                  mb: 0.5,
                  borderColor: menuTreeChrome ? TREE_BORDER : 'rgba(255,255,255,0.12)',
                }}
              />
              {!effectiveCollapsed && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mb: 0.5,
                    px: 1,
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: menuTreeChrome ? 'rgba(255,255,255,0.72)' : 'text.secondary',
                  }}
                >
                  Menu
                </Typography>
              )}
              {effectiveCollapsed ? <Box sx={{ mb: 0.25 }} /> : null}
              {showContractorMenu ? (
                <MenuGroup
                  title="Contractor"
                  icon={
                    <PaidIcon
                      sx={{
                        color: menuTreeChrome ? TREE_ICON : undefined,
                        fontSize: menuTreeChrome ? 19 : undefined,
                      }}
                    />
                  }
                  isOpen={openTreeGroups.has('contractor-root')}
                  onToggle={() => toggleTreeGroup('contractor-root')}
                  theme={theme}
                  colors={colors}
                  isCollapsed={effectiveCollapsed}
                  treeChrome={menuTreeChrome}
                  isActiveGroup={location.pathname.startsWith(ROUTES.CONTRACTOR_DASHBOARD)}
                >
                  <SearchableMenu
                    items={contractorItems}
                    selected={selected}
                    setSelected={stableSetSelected}
                    theme={theme}
                    isCollapsed={effectiveCollapsed}
                    nested
                    treeChrome={menuTreeChrome}
                    onAfterNavigate={closeMobileNav}
                  />
                </MenuGroup>
              ) : showEngineerMenu ? (
                <MenuGroup
                  title="Engineer"
                  icon={
                    <EngineeringIcon
                      sx={{
                        color: menuTreeChrome ? TREE_ICON : undefined,
                        fontSize: menuTreeChrome ? 19 : undefined,
                      }}
                    />
                  }
                  isOpen={openTreeGroups.has('engineer-root')}
                  onToggle={() => toggleTreeGroup('engineer-root')}
                  theme={theme}
                  colors={colors}
                  isCollapsed={effectiveCollapsed}
                  treeChrome={menuTreeChrome}
                  isActiveGroup={location.pathname.startsWith(ROUTES.ENGINEER_WORKSPACE)}
                >
                  <SearchableMenu
                    items={engineerItems}
                    selected={selected}
                    setSelected={stableSetSelected}
                    theme={theme}
                    isCollapsed={effectiveCollapsed}
                    nested
                    treeChrome={menuTreeChrome}
                    onAfterNavigate={closeMobileNav}
                  />
                </MenuGroup>
              ) : (
                menuCategories.map((cat) => {
                  const items = filterCategorySubmenusToNavItems(cat, hasPrivilege, user, isAdminLike);
                  if (!items.length) return null;
                  const IconComp = ICON_MAP[cat.icon] || DashboardIcon;
                  return (
                    <MenuGroup
                      key={cat.id}
                      title={cat.labelTree || cat.label}
                      icon={
                        <IconComp
                          sx={{
                            color: menuTreeChrome ? TREE_ICON : undefined,
                            fontSize: menuTreeChrome ? 19 : undefined,
                          }}
                        />
                      }
                      isOpen={openTreeGroups.has(cat.id)}
                      onToggle={() => toggleTreeGroup(cat.id)}
                      theme={theme}
                      colors={colors}
                      isCollapsed={effectiveCollapsed}
                      treeChrome={menuTreeChrome}
                      isActiveGroup={activeCategoryIdForPath === cat.id}
                    >
                      <SearchableMenu
                        items={items}
                        selected={selected}
                        setSelected={stableSetSelected}
                        theme={theme}
                        isCollapsed={effectiveCollapsed}
                        nested
                        treeChrome={menuTreeChrome}
                        onAfterNavigate={closeMobileNav}
                      />
                    </MenuGroup>
                  );
                })
              )}
            </>
          ) : showContractorMenu ? (
            <>
              {!effectiveCollapsed && (
                <Box sx={{
                  px: 1.5,
                  py: 1,
                  mb: 1.5,
                  mt: 4,
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(255,255,255,0.5)',
                  borderRadius: '6px',
                  border: `1px solid ${theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.1)'}`,
                }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: theme.palette.mode === 'dark'
                        ? colors.blueAccent[400]
                        : '#0284c7',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Contractor
                  </Typography>
                </Box>
              )}
              {effectiveCollapsed && <Box sx={{ mt: 4, mb: 1 }} />}
              <SearchableMenu
                items={contractorItems}
                selected={selected}
                setSelected={stableSetSelected}
                theme={theme}
                isCollapsed={effectiveCollapsed}
                onAfterNavigate={closeMobileNav}
              />
            </>
          ) : showEngineerMenu ? (
            <>
              {!effectiveCollapsed && (
                <Box sx={{
                  px: 1.5,
                  py: 1,
                  mb: 1.5,
                  mt: 4,
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(255,255,255,0.5)',
                  borderRadius: '6px',
                  border: `1px solid ${theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.1)'}`,
                }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: theme.palette.mode === 'dark'
                        ? colors.blueAccent[400]
                        : '#0284c7',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Engineer
                  </Typography>
                </Box>
              )}
              {effectiveCollapsed && <Box sx={{ mt: 4, mb: 1 }} />}
              <SearchableMenu
                items={engineerItems}
                selected={selected}
                setSelected={stableSetSelected}
                theme={theme}
                isCollapsed={effectiveCollapsed}
                onAfterNavigate={closeMobileNav}
              />
            </>
          ) : (
            <>
              {selectedCategory && !effectiveCollapsed && (
                <Box sx={{
                  px: 1.5,
                  py: 1,
                  mb: 1.5,
                  mt: 4,
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(255,255,255,0.5)',
                  borderRadius: '6px',
                  border: `1px solid ${theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.1)'}`,
                }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: theme.palette.mode === 'dark'
                        ? colors.blueAccent[400]
                        : '#0284c7',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedCategory.labelTree || selectedCategory.label}
                  </Typography>
                </Box>
              )}

              {selectedCategory && effectiveCollapsed && (
                <Box sx={{ mt: 4, mb: 1 }} />
              )}

              {submenuItems.length > 0 ? (
                <SearchableMenu
                  items={submenuItems}
                  selected={selected}
                  setSelected={stableSetSelected}
                  theme={theme}
                  isCollapsed={effectiveCollapsed}
                  onAfterNavigate={closeMobileNav}
                />
              ) : (
                !effectiveCollapsed && (
                  <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No items available
                    </Typography>
                  </Box>
                )
              )}
            </>
          )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        anchor="left"
        open={!!mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          zIndex: (t) => t.zIndex.modal,
          '& .MuiBackdrop-root': {
            top: '48px',
          },
          '& .MuiDrawer-paper': {
            width: `${expandedSidebarWidth}px`,
            maxWidth: 'min(92vw, 320px)',
            boxSizing: 'border-box',
            top: '48px',
            height: 'calc(100% - 48px)',
            background: panelBackground,
            borderRight: `1px solid ${panelBorderColor}`,
            color: menuTreeChrome ? TREE_TEXT_MAIN : theme.palette.text.primary,
          },
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            py: showFullTreeMenu ? 0.5 : 1.5,
            px: showFullTreeMenu ? 0.35 : 0.5,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {sidebarMenuContent}
        </Box>
      </Drawer>
    );
  }

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.mode === 'dark'
          ? colors.primary[600]
          : treeChromeLight
            ? TREE_PANEL_BG
            : '#f0f9ff',
        borderRight: `none`,
        /* Flush vertical edge (no chamfer); quiet seam vs main content */
        boxShadow: theme.palette.mode === 'dark'
          ? 'inset -1px 0 0 rgba(255,255,255,0.08), 1px 0 0 rgba(0,0,0,0.12)'
          : treeChromeLight
            ? 'inset -1px 0 0 rgba(255,255,255,0.14), 1px 0 0 rgba(0,0,0,0.06)'
            : 'inset -1px 0 0 rgba(255,255,255,0.45), 1px 0 0 rgba(0,0,0,0.07)',
        position: 'fixed',
        top: sidebarTop,
        left: 0,
        height: sidebarHeight,
        width: `${currentWidth}px`,
        zIndex: 999,
        display: 'block',
        visibility: 'visible',
        transition: 'width 0.3s ease-in-out',
        clipPath: 'none',
        '&::before': { content: 'none' },
        '&::after': { content: 'none' },
        "& .pro-sidebar-inner": {
          background: theme.palette.mode === 'dark' 
            ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%) !important` 
            : treeChromeLight
              ? `${TREE_PANEL_GRAD} !important`
              : `linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%) !important`,
          backgroundColor: theme.palette.mode === 'dark' 
            ? `${colors.primary[400]} !important` 
            : treeChromeLight
              ? `${TREE_PANEL_BG} !important`
              : `#e0f2fe !important`,
          borderRight: `1px solid ${theme.palette.mode === 'dark' 
            ? 'rgba(255, 255, 255, 0.1)' 
            : treeChromeLight
              ? TREE_BORDER
              : 'rgba(0, 0, 0, 0.08)'} !important`,
          boxShadow: theme.palette.mode === 'dark'
            ? 'inset -1px 0 0 rgba(255, 255, 255, 0.05) !important'
            : treeChromeLight
              ? 'inset -1px 0 0 rgba(255, 255, 255, 0.1) !important'
              : 'inset -1px 0 0 rgba(0, 0, 0, 0.04) !important',
        },
        "& .pro-icon-wrapper": {
          backgroundColor: "transparent !important",
          marginRight: "6px !important",
          minWidth: "16px !important",
          display: "flex !important",
          alignItems: "center !important",
          justifyContent: "center !important",
        },
        "& .pro-item-content": {
          paddingLeft: "4px !important",
          overflow: "visible !important",
          textOverflow: "unset !important",
          whiteSpace: "nowrap !important",
          flex: "1 !important",
          display: "flex !important",
          alignItems: "center !important",
          minWidth: "0 !important",
        },
        "& .pro-item-content span": {
          overflow: "visible !important",
          textOverflow: "unset !important",
          whiteSpace: "nowrap !important",
          display: "block !important",
        },
        "& .pro-inner-item": {
          padding: "6px 10px 6px 6px !important",
          color: theme.palette.mode === 'dark' 
            ? `${colors.grey[100]} !important` 
            : treeChromeLight
              ? `${TREE_TEXT_MAIN} !important`
              : `#1e3a8a !important`,
          overflow: "visible !important",
          minWidth: "auto !important",
          display: "flex !important",
          alignItems: "center !important",
        },
        "& .pro-menu-item": {
          overflow: "visible !important",
          minWidth: "auto !important",
          display: "block !important",
          padding: "3px 6px 3px 3px !important",
        },
        "& .pro-menu-item.pro-menu-item-header": {
          padding: "6px 8px 6px 4px !important",
        },
        "& .pro-menu-item.pro-menu-item-header .pro-inner-item": {
          padding: "6px 8px 6px 4px !important",
        },
        "& .pro-inner-item:hover": {
          color: theme.palette.mode === 'dark' 
            ? `${colors.blueAccent[400]} !important` 
            : treeChromeLight
              ? `#ffffff !important`
              : `#0284c7 !important`,
          backgroundColor: theme.palette.mode === 'dark' 
            ? `${colors.primary[500]} !important` 
            : treeChromeLight
              ? `${TREE_HOVER} !important`
              : `#e1f5fe !important`,
          borderRadius: '6px !important',
          transform: 'translateX(2px) !important',
          transition: 'all 0.2s ease-in-out !important',
        },
        "& .pro-menu-item.active": {
          color: theme.palette.mode === 'dark' 
            ? `${colors.blueAccent[400]} !important` 
            : `#ffffff !important`,
          backgroundColor: theme.palette.mode === 'dark' 
            ? `${colors.primary[500]} !important` 
            : treeChromeLight
              ? `${TREE_SEL_NESTED} !important`
              : `#0284c7 !important`,
          borderRadius: '6px !important',
          boxShadow: theme.palette.mode === 'dark' 
            ? '0 2px 8px rgba(0, 0, 0, 0.3) !important'
            : treeChromeLight
              ? 'none !important'
              : '0 2px 8px rgba(2, 132, 199, 0.3) !important',
        },
        // Mobile optimizations
        ...(isMobile && {
          "& .pro-sidebar": {
            position: "fixed !important",
            zIndex: 1000,
          },
        }),
        // Ensure collapse button stays above top menu
        "& .pro-sidebar-header": {
          zIndex: 1001,
          position: "relative",
        },
        // Ensure sidebar stays above other content
        "& .pro-sidebar": {
          zIndex: 999,
          position: "fixed !important",
          top: `${typeof sidebarTop === 'number' ? `${sidebarTop}px` : sidebarTop} !important`,
          left: "0 !important",
          height: `${sidebarHeight} !important`,
          width: `${currentWidth}px !important`,
          display: "block !important",
          visibility: "visible !important",
          transition: "width 0.3s ease-in-out !important",
        },
      }}
    >
      <Box
        sx={{
          position: 'fixed',
          top: sidebarTop,
          left: 0,
          height: sidebarHeight,
          width: `${currentWidth}px`,
          zIndex: 999,
          display: 'block',
          visibility: 'visible',
          background: theme.palette.mode === 'dark'
            ? colors.primary[600]
            : treeChromeLight
              ? TREE_PANEL_GRAD
              : '#81d4fa',
          borderRight: `1px solid ${theme.palette.mode === 'dark'
            ? colors.primary[400]
            : treeChromeLight
              ? 'rgba(255,255,255,0.14)'
              : '#4fc3f7'}`,
          transition: 'width 0.3s ease-in-out',
        }}
      >
        <Box sx={{ 
          height: '100%', 
          width: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          py: isTreeLayout ? 0.5 : 1.5,
          px: isTreeLayout ? 0.35 : 0.5,
          position: 'relative',
          ...(isTreeLayout
            ? {
                scrollbarWidth: 'thin',
                scrollbarColor: `${
                  theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.22)'
                    : 'rgba(255,255,255,0.28)'
                } transparent`,
                '&::-webkit-scrollbar': {
                  width: 6,
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor:
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.18)'
                      : 'rgba(255,255,255,0.22)',
                  borderRadius: 100,
                  border: '2px solid transparent',
                  backgroundClip: 'padding-box',
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  backgroundColor:
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.32)'
                      : 'rgba(255,255,255,0.38)',
                },
              }
            : {}),
        }}>
          {sidebarMenuContent}
        </Box>
      </Box>
    </Box>
  );
};

export default Sidebar;