/**
 * Client-specific navigation chrome: ribbon tabs + section sidebar vs full AdminLTE-style tree.
 * Default layout is tree; override with VITE_NAV_LAYOUT_MODE=ribbon|tree or localStorage (see NavigationLayoutContext).
 */
export const NAV_LAYOUT_STORAGE_KEY = 'mcmmes.navigationLayoutMode';

export const NAV_LAYOUT_MODES = {
  /** Top ribbon categories; sidebar shows only that category’s links (opt-in via env or user toggle). */
  RIBBON: 'ribbon',
  /** CIMES-style: all categories in the sidebar as expandable groups; ribbon hidden. */
  TREE: 'tree',
};

export function getDefaultNavigationLayoutMode() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_NAV_LAYOUT_MODE : undefined;
  if (env === NAV_LAYOUT_MODES.TREE || env === NAV_LAYOUT_MODES.RIBBON) return env;
  return NAV_LAYOUT_MODES.TREE;
}

export function readStoredNavigationLayoutMode() {
  try {
    const v = localStorage.getItem(NAV_LAYOUT_STORAGE_KEY);
    if (v === NAV_LAYOUT_MODES.TREE || v === NAV_LAYOUT_MODES.RIBBON) return v;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Sidebar / ribbon tab order. Reports sits near the end (before Admin): it is a hub of links to
 * existing screens, not a primary daily workflow lane—same placement logic executives see when
 * their menu is subset-filtered.
 */
export const TREE_MENU_CATEGORY_ORDER = [
  'dashboard',
  'management',
  'reporting',
  'finance',
  'monitoring',
  'procurement',
  'data',
  'hr',
  'public',
  'reports',
  'admin',
];

/** Same category order for ribbon tabs and tree sidebar (unknown ids sort last). */
export function sortMenuCategoriesForNav(categories) {
  if (!Array.isArray(categories)) return [];
  const orderIndex = (id) => {
    const i = TREE_MENU_CATEGORY_ORDER.indexOf(id);
    return i === -1 ? 999 : i;
  };
  return [...categories].sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
}

/** Ribbon / sidebar header: match tree group titles when `labelTree` is set. */
export function categoryNavLabel(category) {
  if (!category) return '';
  return category.labelTree || category.label || '';
}
