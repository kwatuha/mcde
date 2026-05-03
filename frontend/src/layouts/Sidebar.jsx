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
  LinearProgress
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
// ✨ Removed old theme system - using modern theme directly!
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TableChartIcon from '@mui/icons-material/TableChart';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AssessmentIcon from '@mui/icons-material/Assessment';
import MapIcon from '@mui/icons-material/Map';
import GroupIcon from '@mui/icons-material/Group';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import PaidIcon from '@mui/icons-material/Paid';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
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

import { useAuth } from '../context/AuthContext.jsx';
import { useMenuCategory } from '../context/MenuCategoryContext.jsx';
import { useSidebar } from '../context/SidebarContext.jsx';
import { ROUTES } from '../configs/appConfig.js';
import { getFilteredMenuCategories, hasConfiguredRole } from '../configs/menuConfigUtils.js';
import { isAdmin, normalizeRoleName } from '../utils/privilegeUtils.js';
import logo from '../assets/logo.png';
import userProfilePicture from '../assets/user.png';

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
};

const Item = memo(({ title, to, icon, selected, setSelected, privilegeCheck, theme, isCollapsed }) => {
  const navigate = useNavigate();
  
  if (privilegeCheck && !privilegeCheck()) {
    return null;
  }

  const handleClick = useCallback(() => {
    setSelected(to);
    navigate(to);
  }, [to, setSelected, navigate]);

  return (
    <Tooltip title={isCollapsed ? title : ''} placement="right" arrow>
      <Box
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          padding: isCollapsed ? '8px' : '6px 10px',
          margin: '2px 6px',
          borderRadius: '6px',
          cursor: 'pointer',
          backgroundColor: selected === to ? theme.palette.action.selected : 'transparent',
          color: selected === to ? theme.palette.primary.main : theme.palette.text.primary,
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            transform: isCollapsed ? 'scale(1.1)' : 'translateX(2px)',
            transition: 'all 0.2s ease-in-out',
          },
        }}
      >
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginRight: isCollapsed ? 0 : '10px',
        minWidth: isCollapsed ? 'auto' : '20px',
        justifyContent: 'center',
        '& svg': {
          fontSize: isCollapsed ? '20px' : '18px',
        },
      }}>
        {icon}
      </Box>
        {!isCollapsed && (
          <Typography 
            variant="body2" 
            sx={{ 
              fontSize: '0.8rem', 
              fontWeight: selected === to ? '600' : '500',
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

const MenuGroup = ({ title, icon, children, isOpen, onToggle, theme, colors, isCollapsed }) => {

  return (
    <Box>
      <Tooltip title={isCollapsed ? title : ''} placement="right" arrow>
        <Box
          onClick={onToggle}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            padding: isCollapsed ? '10px' : '10px 12px',
            margin: '4px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary,
            '&:hover': {
              backgroundColor: theme.palette.action.selected,
              transition: 'all 0.2s ease-in-out',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', marginRight: isCollapsed ? 0 : '12px' }}>
              {icon}
            </Box>
            {!isCollapsed && (
              <>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontSize: '0.9rem', 
                    fontWeight: '600', 
                    overflow: 'visible', 
                    whiteSpace: 'nowrap', 
                    textOverflow: 'unset',
                    flex: 1,
                  }}
                >
                  {title}
                </Typography>
                {isOpen ? <ExpandLessIcon sx={{ fontSize: '18px' }} /> : <ExpandMoreIcon sx={{ fontSize: '18px' }} />}
              </>
            )}
          </Box>
        </Box>
      </Tooltip>
      {!isCollapsed && (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <Box sx={{ pl: 0.5 }}>
            {children}
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

const SearchableMenu = ({ items, selected, setSelected, theme, isCollapsed }) => {
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
              />
            </Box>
          </Zoom>
        ))}
      </Box>
    </Fade>
  );
};

const Sidebar = ({ isPinnedOpen = false, onTogglePinned }) => {
  const theme = useTheme();
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
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const fullPath = `${location.pathname}${location.search || ''}`;
  const [selected, setSelected] = useState(fullPath);
  const previousFullPathRef = useRef(fullPath);
  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  const isAdminLike = isAdmin(user);
  
  // Memoize setSelected to prevent Item components from re-rendering unnecessarily
  const stableSetSelected = useCallback((value) => {
    setSelected(value);
  }, []);
  
  // Get sidebar collapse state from context
  const { isCollapsed, toggleSidebar } = useSidebar();
  
  // Get filtered menu categories
  const menuCategories = useMemo(() => {
    return getFilteredMenuCategories(isAdminLike, hasPrivilege, user);
  }, [hasPrivilege, user, isAdminLike]);
  
  // Get the selected category and its submenus
  const selectedCategory = useMemo(() => {
    return menuCategories.find(cat => cat.id === selectedCategoryId) || menuCategories[0];
  }, [selectedCategoryId, menuCategories]);
  
  // Get submenu items for the selected category
  const submenuItems = useMemo(() => {
    if (!selectedCategory || !selectedCategory.submenus) return [];
    
    return selectedCategory.submenus
      .filter(submenu => {
        // Filter based on permissions and visibility
        if (submenu.hidden) return false;
        
        // If both permission and roles are specified, user needs EITHER permission OR role (OR logic)
        if (submenu.permission && submenu.roles) {
          const hasPermission = hasPrivilege && hasPrivilege(submenu.permission);
          const hasRole = hasConfiguredRole(user, submenu.roles);
          // Show if user has permission OR role
          return hasPermission || hasRole;
        }

        // Optional: any of these privileges (menu JSON `permissionsAny`); admin-like users bypass
        if (Array.isArray(submenu.permissionsAny) && submenu.permissionsAny.length > 0) {
          const any = hasPrivilege && submenu.permissionsAny.some((p) => hasPrivilege(p));
          if (!any && !isAdminLike) return false;
        } else if (submenu.permission && hasPrivilege && !hasPrivilege(submenu.permission)) {
          return false;
        }
        
        // Check role-based visibility (if only roles are specified)
        if (submenu.roles && user && !hasConfiguredRole(user, submenu.roles)) {
          return false;
        }
        
        return true;
      })
      .map(submenu => {
        const route = submenu.route && ROUTES[submenu.route] ? ROUTES[submenu.route] : submenu.to;
        const IconComponent = ICON_MAP[submenu.icon] || DashboardIcon;
        return {
          title: submenu.title,
          to: route,
          icon: <IconComponent />,
        };
      });
  }, [selectedCategory, hasPrivilege, user, isAdminLike]);
  
  // Update selected state when route changes (pathname + query for e.g. planning indicators section)
  useEffect(() => {
    const currentFull = `${location.pathname}${location.search || ''}`;
    if (currentFull !== previousFullPathRef.current) {
      previousFullPathRef.current = currentFull;
      setSelected((prev) => (prev !== currentFull ? currentFull : prev));
    }
  }, [location.pathname, location.search]);

  // Organized menu groups
  const dashboardItems = [
    { title: "Dashboard", to: ROUTES.DASHBOARD, icon: <DashboardIcon /> },
    { title: "Raw Data", to: ROUTES.RAW_DATA, icon: <TableChartIcon /> },
    { title: "Projects", to: ROUTES.PROJECTS, icon: <FolderOpenIcon /> },
    { title: "Personal Dashboard", to: ROUTES.CONTRACTOR_DASHBOARD, icon: <PaidIcon /> },
  ];

  const reportingItems = [
    { title: "Reports", to: ROUTES.REPORTS, icon: <AssessmentIcon /> },
    // { title: "Project Dashboards", to: ROUTES.REPORTING_OVERVIEW, icon: <AssessmentIcon /> }, // Hidden
    { title: "Regional Rpts", to: ROUTES.REGIONAL_DASHBOARD, icon: <AssessmentIcon /> },
    { title: "Regional Dashboards", to: ROUTES.REGIONAL_REPORTING, icon: <AssessmentIcon /> },
    { title: "Quarterly Implementation Report", to: ROUTES.QUARTERLY_IMPLEMENTATION_REPORT, icon: <AssessmentIcon /> },
  ];

  const managementItems = [
    { title: "Central Data Import", to: "/data-import", icon: <CloudUploadIcon /> },
    // HR Module - Hidden
    // { title: "HR Module", to: ROUTES.HR, icon: <PeopleIcon />, privilege: () => hasPrivilege('hr.access') },
  ];

  /* SCOPE_DOWN: hide workflow, approval-levels (admin); feedback-management, county-proposed-projects, project-announcements (public). Re-enable when restoring. */
  const adminItems = [
    { title: "Admin Dashboard", to: ROUTES.ADMIN, icon: <SettingsIcon /> },
    { title: "User Management", to: ROUTES.USER_MANAGEMENT, icon: <GroupIcon /> },
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
  ];

  // Get all items for search
  const allItems = useMemo(() => {
    if (normalizedRole === 'contractor') {
      return contractorItems;
    }
    if (isAdminLike) {
      return [...dashboardItems, ...reportingItems, ...managementItems, ...adminItems];
    }
    return [...dashboardItems, ...reportingItems, ...managementItems];
  }, [normalizedRole, isAdminLike]);

  // Sidebar width based on collapsed state
  const expandedWidth = 200; // Width with labels
  const collapsedWidth = 64; // Width with icons only
  const currentWidth = isCollapsed ? collapsedWidth : expandedWidth;

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.mode === 'dark' 
          ? colors.primary[600] 
          : '#f0f9ff',
        borderRight: `none`,
        boxShadow: theme.palette.mode === 'dark' 
          ? '6px 0 20px rgba(0, 0, 0, 0.5), inset -3px 0 6px rgba(255, 255, 255, 0.1)'
          : '6px 0 20px rgba(0, 0, 0, 0.2), inset -3px 0 6px rgba(0, 0, 0, 0.08)',
        position: 'fixed',
        top: '64px',
        left: 0,
        height: 'calc(100vh - 64px)',
        width: `${currentWidth}px`,
        zIndex: 999,
        display: 'block',
        visibility: 'visible',
        transition: 'width 0.3s ease-in-out',
        clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          right: 0,
          width: '12px',
          height: '12px',
          background: theme.palette.mode === 'dark' 
            ? colors.primary[600] 
            : colors.primary[100],
          clipPath: 'polygon(100% 0, 0 0, 0 100%)',
          zIndex: 2,
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '12px',
          height: '12px',
          background: theme.palette.mode === 'dark' 
            ? colors.primary[600] 
            : colors.primary[100],
          clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
          zIndex: 2,
        },
        "& .pro-sidebar-inner": {
          background: theme.palette.mode === 'dark' 
            ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%) !important` 
            : `linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%) !important`,
          backgroundColor: theme.palette.mode === 'dark' 
            ? `${colors.primary[400]} !important` 
            : `#e0f2fe !important`,
          borderRight: `1px solid ${theme.palette.mode === 'dark' 
            ? 'rgba(255, 255, 255, 0.1)' 
            : 'rgba(0, 0, 0, 0.08)'} !important`,
          boxShadow: theme.palette.mode === 'dark' 
            ? 'inset -1px 0 0 rgba(255, 255, 255, 0.05) !important'
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
            : `#0284c7 !important`,
          backgroundColor: theme.palette.mode === 'dark' 
            ? `${colors.primary[500]} !important` 
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
            : `#0284c7 !important`,
          borderRadius: '6px !important',
          boxShadow: theme.palette.mode === 'dark' 
            ? '0 2px 8px rgba(0, 0, 0, 0.3) !important'
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
          top: "64px !important", // Start below the AppBar
          left: "0 !important",
          height: "calc(100vh - 64px) !important", // Adjust height to account for AppBar
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
          top: '64px',
          left: 0,
          height: 'calc(100vh - 64px)',
          width: `${currentWidth}px`,
          zIndex: 999,
          display: 'block',
          visibility: 'visible',
          backgroundColor: theme.palette.mode === 'dark'
            ? colors.primary[600]
            : '#81d4fa',
          borderRight: `1px solid ${theme.palette.mode === 'dark'
            ? colors.primary[400]
            : '#4fc3f7'}`,
          transition: 'width 0.3s ease-in-out',
        }}
      >
        <Box sx={{ 
          height: '100%', 
          width: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          py: 1.5,
          px: 0.5,
          position: 'relative',
        }}>
          {/* Toggle Button */}
          <Box sx={{
            position: 'absolute',
            top: 8,
            right: isCollapsed ? 4 : 8,
            zIndex: 1000,
            transition: 'right 0.3s ease-in-out',
          }}>
            <Tooltip title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'} placement="right" arrow>
              <IconButton
                onClick={toggleSidebar}
                size="small"
                sx={{
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(255,255,255,0.1)' 
                    : 'rgba(255,255,255,0.8)',
                  color: theme.palette.mode === 'dark' 
                    ? colors.blueAccent[400] 
                    : '#0284c7',
                  border: `1px solid ${theme.palette.mode === 'dark' 
                    ? 'rgba(255,255,255,0.2)' 
                    : 'rgba(0,0,0,0.1)'}`,
                  '&:hover': {
                    backgroundColor: theme.palette.mode === 'dark' 
                      ? 'rgba(255,255,255,0.2)' 
                      : 'rgba(255,255,255,1)',
                    transform: 'scale(1.1)',
                  },
                  transition: 'all 0.2s ease-in-out',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  width: 28,
                  height: 28,
                }}
              >
                {isCollapsed ? <ChevronRightIcon sx={{ fontSize: 16 }} /> : <ChevronLeftIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </Box>

          {/* Category Title */}
          {selectedCategory && !isCollapsed && (
            <Box sx={{ 
              px: 1.5, 
              py: 1, 
              mb: 1.5,
              mt: 4, // Add top margin to account for toggle button
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
                {selectedCategory.label}
              </Typography>
            </Box>
          )}
          
          {selectedCategory && isCollapsed && (
            <Box sx={{ mt: 4, mb: 1 }} /> // Spacer when collapsed
          )}
          
          {/* Submenu Items */}
          {submenuItems.length > 0 ? (
            <SearchableMenu 
              items={submenuItems}
              selected={selected}
              setSelected={stableSetSelected}
              theme={theme}
              isCollapsed={isCollapsed}
            />
          ) : (
            !isCollapsed && (
              <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No items available
                </Typography>
              </Box>
            )
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Sidebar;