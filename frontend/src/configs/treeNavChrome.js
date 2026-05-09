/**
 * Light-mode tree navigation chrome: sidebar + inset AppBar share one hue family (#0f4c75).
 * Keep in sync when adjusting tree sidebar appearance.
 */
export const TREE_NAV_PANEL_BG = '#0f4c75';
export const TREE_NAV_PANEL_GRAD =
  'linear-gradient(180deg, #115a8a 0%, #0f4c75 45%, #0c4063 100%)';

/** Slightly lighter / brighter step than the panel — reads as one system with the sidebar. */
export const TREE_NAV_APPBAR_GRAD =
  'linear-gradient(90deg, #1c6d9a 0%, #1a78ae 40%, #176896 100%)';
export const TREE_NAV_APPBAR_FALLBACK = '#176896';

/** Right edge: sidebar vs content (≈ white / 10). */
export const TREE_NAV_BORDER = 'rgba(255,255,255,0.1)';
