import menuConfig from './menuConfig.json';
import { normalizeRoleName, canAccessProjectBySectorDashboard } from '../utils/privilegeUtils.js';

const ADMIN_ROLE_NAMES = new Set(['admin', 'mda_ict_admin', 'super_admin', 'administrator', 'ict_admin']);
const EXECUTIVE_VIEWER_ROLE_NAMES = new Set(['executive_viewer', 'project_lead']);

export const hasConfiguredRole = (user, roles) => {
  if (!user || !Array.isArray(roles) || roles.length === 0) return false;
  const userRole = normalizeRoleName(user.roleName || user.role);
  const required = roles.map((r) => normalizeRoleName(r));
  if (required.includes(userRole)) return true;
  // Treat admin aliases as equivalent when a menu entry asks for any admin-like role.
  if (ADMIN_ROLE_NAMES.has(userRole) && required.some((r) => ADMIN_ROLE_NAMES.has(r))) return true;
  return false;
};

// Icon mapping for Material-UI icons
export const ICON_MAP = {
  DashboardIcon: () => import('@mui/icons-material/Dashboard').then(m => m.default),
  GridViewIcon: () => import('@mui/icons-material/GridView').then(m => m.default),
  AssessmentIcon: () => import('@mui/icons-material/Assessment').then(m => m.default),
  SettingsIcon: () => import('@mui/icons-material/Settings').then(m => m.default),
  GroupIcon: () => import('@mui/icons-material/Group').then(m => m.default),
  CloudUploadIcon: () => import('@mui/icons-material/CloudUpload').then(m => m.default),
  MapIcon: () => import('@mui/icons-material/Map').then(m => m.default),
  PaidIcon: () => import('@mui/icons-material/Paid').then(m => m.default),
  AdminPanelSettingsIcon: () => import('@mui/icons-material/AdminPanelSettings').then(m => m.default),
  PeopleIcon: () => import('@mui/icons-material/People').then(m => m.default),
  AccountTreeIcon: () => import('@mui/icons-material/AccountTree').then(m => m.default),
  ApprovalIcon: () => import('@mui/icons-material/Approval').then(m => m.default),
  FeedbackIcon: () => import('@mui/icons-material/Feedback').then(m => m.default),
  StorageIcon: () => import('@mui/icons-material/Storage').then(m => m.default),
  BusinessIcon: () => import('@mui/icons-material/Business').then(m => m.default),
  AssignmentIcon: () => import('@mui/icons-material/Assignment').then(m => m.default),
  AnnouncementIcon: () => import('@mui/icons-material/Announcement').then(m => m.default),
  PublicIcon: () => import('@mui/icons-material/Public').then(m => m.default),
  AnalyticsIcon: () => import('@mui/icons-material/Analytics').then(m => m.default),
  AttachMoneyIcon: () => import('@mui/icons-material/AttachMoney').then(m => m.default),
  ApartmentIcon: () => import('@mui/icons-material/Apartment').then(m => m.default),
  CategoryIcon: () => import('@mui/icons-material/Category').then(m => m.default),
  MenuBookIcon: () => import('@mui/icons-material/MenuBook').then(m => m.default),
  LocationOnIcon: () => import('@mui/icons-material/LocationOn').then(m => m.default),
  WorkIcon: () => import('@mui/icons-material/Work').then(m => m.default),
  DescriptionIcon: () => import('@mui/icons-material/Description').then(m => m.default),
  GavelIcon: () => import('@mui/icons-material/Gavel').then(m => m.default),
};

// Get icon component by name
export const getIconComponent = (iconName) => {
  const IconComponent = ICON_MAP[iconName];
  if (!IconComponent) {
    console.warn(`Icon ${iconName} not found in icon map`);
    return ICON_MAP.DashboardIcon; // fallback icon
  }
  return IconComponent;
};

// Filter menu categories based on user permissions and admin status
export const getFilteredMenuCategories = (isAdmin = false, hasPrivilege = null, user = null) => {
  const categories = menuConfig.menuCategories.filter(category => {
    // Filter out admin-only categories if user is not admin
    if (category.adminOnly && !isAdmin) {
      return false;
    }
    return true;
  }).map(category => ({
    ...category,
    submenus: category.submenus.filter(submenu => {
      // Check if item is hidden
      if (submenu.hidden === true) {
        return false;
      }
      if (submenu.route === 'PROJECT_BY_SECTOR_DASHBOARD' && !canAccessProjectBySectorDashboard(user)) {
        return false;
      }
      
      // If both permission and roles are specified, user needs EITHER permission OR role (OR logic)
      if (submenu.permission && submenu.roles) {
        const hasPermission = hasPrivilege && hasPrivilege(submenu.permission);
        const hasRole = hasConfiguredRole(user, submenu.roles);
        // Show if user has permission OR role
        return hasPermission || hasRole;
      }
      
      if (Array.isArray(submenu.permissionsAny) && submenu.permissionsAny.length > 0) {
        const passPriv = hasPrivilege && submenu.permissionsAny.some((p) => hasPrivilege(p));
        if (!passPriv && !isAdmin) return false;
      } else if (submenu.permission && hasPrivilege && !hasPrivilege(submenu.permission)) {
        return false;
      }
      
      // Check role-based visibility (if only roles are specified)
      if (submenu.roles && user && !hasConfiguredRole(user, submenu.roles)) {
        return false;
      }
      
      return true;
    })
  }));

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  const isExecutiveViewer = EXECUTIVE_VIEWER_ROLE_NAMES.has(normalizedRole);
  if (!isExecutiveViewer) {
    return categories;
  }

  // Executive Viewer: allow dashboards plus Projects tab with Registry only.
  const allowedDashboardRoutes = [
    'SYSTEM_DASHBOARD',
    'PROJECT_BY_STATUS_DASHBOARD',
    'PROJECT_BY_SECTOR_DASHBOARD',
    'FINANCE_DASHBOARD',
    'JOBS_DASHBOARD',
  ];
  const allowedSet = new Set(allowedDashboardRoutes);
  const allowedProjectsRoutes = new Set(['PROJECTS']);

  return categories
    .filter((category) => {
      if (category.id === 'dashboard' || category.id === 'reporting') return true;
      if (category.id === 'finance') {
        return hasPrivilege && hasPrivilege('document.read_all');
      }
      return false;
    })
    .map((category) => {
      if (category.id === 'dashboard') {
        const filteredSubmenus = (category.submenus || [])
          .filter((submenu) => !submenu.hidden && allowedSet.has(submenu.route))
          .sort(
            (a, b) =>
              allowedDashboardRoutes.indexOf(a.route) - allowedDashboardRoutes.indexOf(b.route)
          );
        return { ...category, submenus: filteredSubmenus };
      }

      if (category.id === 'finance') {
        const filteredSubmenus = (category.submenus || []).filter(
          (submenu) =>
            !submenu.hidden &&
            submenu.route === 'FINANCE_PAYMENT_CERTIFICATES' &&
            (!submenu.permission || (hasPrivilege && hasPrivilege(submenu.permission)))
        );
        return { ...category, submenus: filteredSubmenus };
      }

      const filteredSubmenus = (category.submenus || [])
        .filter((submenu) => !submenu.hidden && allowedProjectsRoutes.has(submenu.route));
      return { ...category, submenus: filteredSubmenus };
    })
    .filter((category) => (category.submenus || []).length > 0);
};

// Get menu configuration
export const getMenuConfig = () => menuConfig;

export default menuConfig;

