import menuConfig from '../configs/menuConfig.json';
import { ROUTES } from '../configs/appConfig.js';
import { isSuperAdminUser } from './roleUtils.js';

export function asVisibilitySet(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const keys = values.map((v) => String(v || '').trim()).filter(Boolean);
  return keys.length > 0 ? new Set(keys) : null;
}

export function getUserUiProfile(user) {
  return user?.uiProfile || user?.ui_profile || null;
}

export function getProfileMenuVisibilitySet(user) {
  const profile = getUserUiProfile(user);
  return asVisibilitySet(profile?.visibleMenuKeys || profile?.visible_menu_keys);
}

export function getProfileTabVisibilitySet(user) {
  const profile = getUserUiProfile(user);
  const raw = profile?.visibleTabKeys || profile?.visible_tab_keys || [];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const keys = raw
    .map((key) => String(key || '').trim())
    .filter((key) => key.startsWith('projectDetails:'))
    .map((key) => key.replace(/^projectDetails:/, ''));
  return keys.length ? new Set(keys) : null;
}

export function hasRestrictiveMenuProfile(user) {
  return Boolean(getProfileMenuVisibilitySet(user));
}

export function hasRestrictiveTabProfile(user) {
  return Boolean(getProfileTabVisibilitySet(user));
}

/** Only super admins bypass UI profile navigation restrictions. */
export function isUiProfileBypassUser(user) {
  return isSuperAdminUser(user);
}

const categoryVisibilityKey = (category) => `category:${category.id}`;

const submenuVisibilityKeys = (category, submenu) => [
  submenu.route ? `route:${submenu.route}` : null,
  `menu:${category.id}:${submenu.route || submenu.title || submenu.to || ''}`,
].filter(Boolean);

export function applyUiProfileToMenuCategories(categories, user) {
  if (isUiProfileBypassUser(user)) return categories;

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
}

function normalizePath(pathname) {
  return String(pathname || '').split('?')[0].split('#')[0];
}

export function submenuPath(submenu) {
  const route = submenu?.route && ROUTES[submenu.route] ? ROUTES[submenu.route] : submenu?.to;
  if (!route) return '';
  return normalizePath(route);
}

export function isPathAllowedByVisibleMenu(pathname, visibleCategories) {
  const base = normalizePath(pathname);
  if (!base) return true;
  for (const category of visibleCategories || []) {
    for (const submenu of category.submenus || []) {
      const subPath = submenuPath(submenu);
      if (!subPath) continue;
      if (base === subPath || base.startsWith(`${subPath}/`)) return true;
    }
  }
  return false;
}

const ALWAYS_ALLOWED_PATH_PREFIXES = [
  ROUTES.LOGIN,
  ROUTES.FORCE_PASSWORD_CHANGE,
  ROUTES.HOME,
  ROUTES.MOBILE_APP_DOWNLOAD,
  ROUTES.HELP_SUPPORT,
  '/help',
  '/profile',
].map(normalizePath).filter(Boolean);

export function isAlwaysAllowedUiProfilePath(pathname) {
  const base = normalizePath(pathname);
  return ALWAYS_ALLOWED_PATH_PREFIXES.some(
    (prefix) => base === prefix || base.startsWith(`${prefix}/`)
  );
}

export function getFirstVisibleMenuPath(visibleCategories) {
  for (const category of visibleCategories || []) {
    for (const submenu of category.submenus || []) {
      const path = submenuPath(submenu);
      if (path) return path;
    }
  }
  return ROUTES.HOME;
}

export function canAccessRouteKeyByUiProfile(user, routeKey) {
  if (!routeKey || isUiProfileBypassUser(user)) return true;
  const visibleKeys = getProfileMenuVisibilitySet(user);
  if (!visibleKeys) return true;
  if (visibleKeys.has(`route:${routeKey}`)) return true;
  for (const category of menuConfig.menuCategories || []) {
    if (!visibleKeys.has(categoryVisibilityKey(category))) continue;
    if ((category.submenus || []).some((submenu) => submenu.route === routeKey)) return true;
  }
  return false;
}

export function buildMenuRouteKeyIndex() {
  const map = new Map();
  for (const category of menuConfig.menuCategories || []) {
    for (const submenu of category.submenus || []) {
      const path = submenuPath(submenu);
      if (submenu.route && path) map.set(path, submenu.route);
    }
  }
  return map;
}
