import menuConfig from './menuConfig.json';
import { ROUTES } from './appConfig.js';
import { normalizeRoleName, canAccessProjectBySectorDashboard } from '../utils/privilegeUtils.js';
import { isSuperAdminUser } from '../utils/roleUtils.js';

/** Paths that should highlight the Monitoring tree group when the same route key appears under Projects or elsewhere. */
const MONITORING_PREFERRED_ROUTE_PATHS = [
  ROUTES.PROJECT_DOCUMENTS_BY_PROJECT,
  ROUTES.PROJECT_STATUS,
  ROUTES.PROJECT_EVALUATION,
  ROUTES.PROJECT_FEEDBACK_BY_PROJECT,
  ROUTES.PROJECT_UPDATES,
  ROUTES.DATA_COLLECTION_TOOLS,
].map((r) => String(r).split('?')[0]);

function pathMatchesRoute(basePath, routePath) {
  return basePath === routePath || basePath.startsWith(`${routePath}/`);
}

/** First ribbon / sidebar category whose submenu matches this path (for syncing highlight & auto-expand). */
export function findCategoryIdForPath(pathname, menuCategories) {
  if (!pathname || !Array.isArray(menuCategories)) return null;
  const basePath = String(pathname).split('?')[0];

  const matchingCategoryIds = [];
  for (const cat of menuCategories) {
    if (!cat.submenus?.length) continue;
    for (const sub of cat.submenus) {
      const route = sub.route && ROUTES[sub.route] ? ROUTES[sub.route] : sub.to;
      if (!route) continue;
      const routePath = String(route).split('?')[0];
      if (pathMatchesRoute(basePath, routePath)) {
        matchingCategoryIds.push(cat.id);
        break;
      }
    }
  }

  if (!matchingCategoryIds.length) return null;

  const preferMonitoring =
    MONITORING_PREFERRED_ROUTE_PATHS.some((p) => pathMatchesRoute(basePath, p)) &&
    matchingCategoryIds.includes('monitoring');
  if (preferMonitoring) return 'monitoring';

  return matchingCategoryIds[0];
}

const ADMIN_ROLE_NAMES = new Set([
  'admin',
  'mda_ict_admin',
  'super_admin',
  'super_administrator',
  'superadmin',
  'administrator',
  'ict_admin',
]);
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
  VerifiedUserIcon: () => import('@mui/icons-material/VerifiedUser').then(m => m.default),
  GroupsIcon: () => import('@mui/icons-material/Groups').then(m => m.default),
  EventNoteIcon: () => import('@mui/icons-material/EventNote').then(m => m.default),
  CelebrationIcon: () => import('@mui/icons-material/Celebration').then(m => m.default),
  WorkHistoryIcon: () => import('@mui/icons-material/WorkHistory').then(m => m.default),
  ShowChartIcon: () => import('@mui/icons-material/ShowChart').then(m => m.default),
  StraightenIcon: () => import('@mui/icons-material/Straighten').then(m => m.default),
  TaskAltIcon: () => import('@mui/icons-material/TaskAlt').then(m => m.default),
  ReportProblemIcon: () => import('@mui/icons-material/ReportProblem').then(m => m.default),
  UpdateIcon: () => import('@mui/icons-material/Update').then(m => m.default),
  RepeatIcon: () => import('@mui/icons-material/Repeat').then(m => m.default),
  FactCheckIcon: () => import('@mui/icons-material/FactCheck').then(m => m.default),
  ChecklistIcon: () => import('@mui/icons-material/Checklist').then(m => m.default),
  AssignmentTurnedInIcon: () => import('@mui/icons-material/AssignmentTurnedIn').then(m => m.default),
  SpeedIcon: () => import('@mui/icons-material/Speed').then(m => m.default),
  ArticleIcon: () => import('@mui/icons-material/Article').then(m => m.default),
  HubIcon: () => import('@mui/icons-material/Hub').then(m => m.default),
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

const asVisibilitySet = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const keys = values.map((v) => String(v || '').trim()).filter(Boolean);
  return keys.length > 0 ? new Set(keys) : null;
};

const getProfileMenuVisibilitySet = (user) => {
  const profile = user?.uiProfile || user?.ui_profile || null;
  return asVisibilitySet(profile?.visibleMenuKeys || profile?.visible_menu_keys || user?.visibleMenuKeys);
};

const categoryVisibilityKey = (category) => `category:${category.id}`;

const submenuVisibilityKeys = (category, submenu) => [
  submenu.route ? `route:${submenu.route}` : null,
  `menu:${category.id}:${submenu.route || submenu.title || submenu.to || ''}`,
].filter(Boolean);

const applyUiProfileMenuVisibility = (categories, user) => {
  const visibleKeys = getProfileMenuVisibilitySet(user);
  if (!visibleKeys) return categories;

  return categories
    .map((category) => {
      const categoryAllowed = visibleKeys.has(categoryVisibilityKey(category));
      const submenus = (category.submenus || []).filter((submenu) => {
        if (categoryAllowed) return true;
        return submenuVisibilityKeys(category, submenu).some((key) => visibleKeys.has(key));
      });
      return { ...category, submenus };
    })
    .filter((category) => (category.submenus || []).length > 0);
};

// Filter menu categories based on user permissions and admin status
export const getFilteredMenuCategories = (isAdmin = false, hasPrivilege = null, user = null) => {
  const categories = menuConfig.menuCategories.filter(category => {
    // Scope-down/disabled modules stay configured for reference, but are not shown in navigation.
    if (category.hidden === true || category.scopeDown === true) {
      return false;
    }

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
      if (submenu.superAdminOnly && !isSuperAdminUser(user)) {
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
    return applyUiProfileMenuVisibility(categories.filter((c) => (c.submenus || []).length > 0), user);
  }

  // Executive Viewer: allow dashboards plus Projects tab with Registry only.
  const allowedDashboardRoutes = [
    'SYSTEM_DASHBOARD',
    'PROJECT_BY_STATUS_DASHBOARD',
    'PROJECT_BY_SECTOR_DASHBOARD',
    'FINANCE_DASHBOARD',
    'JOBS_DASHBOARD',
    'DEPARTMENTAL_REPORTING',
  ];
  const allowedSet = new Set(allowedDashboardRoutes);
  const allowedProjectsRoutes = new Set(['PROJECTS']);

  return applyUiProfileMenuVisibility(categories
    .filter((category) => {
      if (category.id === 'dashboard' || category.id === 'reporting') return true;
      if (category.id === 'finance') {
        return hasPrivilege && hasPrivilege('document.read_all');
      }
      // Reports: same permission-filtered submenus as other roles (hub, library, etc.).
      if (category.id === 'reports') return true;
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
            ['FINANCE_PAYMENT_CERTIFICATES', 'FINANCE_PAYMENT_LIST', 'FINANCE_FUNDING_SOURCES_REPORT'].includes(submenu.route) &&
            (!submenu.permission || (hasPrivilege && hasPrivilege(submenu.permission)))
        );
        return { ...category, submenus: filteredSubmenus };
      }

      if (category.id === 'reports') {
        return { ...category, submenus: category.submenus || [] };
      }

      const filteredSubmenus = (category.submenus || [])
        .filter((submenu) => !submenu.hidden && allowedProjectsRoutes.has(submenu.route));
      return { ...category, submenus: filteredSubmenus };
    })
    .filter((category) => (category.submenus || []).length > 0), user);
};

// Get menu configuration
export const getMenuConfig = () => menuConfig;

export default menuConfig;

