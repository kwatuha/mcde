/**
 * Client-specific navigation chrome: ribbon tabs + section sidebar vs full AdminLTE-style tree.
 * Override default with VITE_NAV_LAYOUT_MODE=ribbon|tree or localStorage (see NavigationLayoutContext).
 */
export const NAV_LAYOUT_STORAGE_KEY = 'mcmmes.navigationLayoutMode';

export const NAV_LAYOUT_MODES = {
  /** Current behaviour: top ribbon categories; sidebar shows only that category’s links. */
  RIBBON: 'ribbon',
  /** CIMES-style: all categories in the sidebar as expandable groups; ribbon hidden. */
  TREE: 'tree',
};

export function getDefaultNavigationLayoutMode() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_NAV_LAYOUT_MODE : undefined;
  if (env === NAV_LAYOUT_MODES.TREE || env === NAV_LAYOUT_MODES.RIBBON) return env;
  return NAV_LAYOUT_MODES.RIBBON;
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

/** Sidebar group order when using {@link NAV_LAYOUT_MODES.TREE} (CIMES-style: dashboard → planning → projects → finance → monitoring → evaluation …). */
export const TREE_MENU_CATEGORY_ORDER = [
  'dashboard',
  'management',
  'reporting',
  'finance',
  'monitoring',
  'reports',
  'procurement',
  'data',
  'hr',
  'public',
  'admin',
];
