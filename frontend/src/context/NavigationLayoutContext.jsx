import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  NAV_LAYOUT_MODES,
  NAV_LAYOUT_STORAGE_KEY,
  getDefaultNavigationLayoutMode,
  readStoredNavigationLayoutMode,
} from '../configs/navigationLayoutConfig.js';

const NavigationLayoutContext = createContext(null);

export function NavigationLayoutProvider({ children }) {
  const [layoutMode, setLayoutModeState] = useState(() => {
    return readStoredNavigationLayoutMode() ?? getDefaultNavigationLayoutMode();
  });

  const setLayoutMode = useCallback((mode) => {
    const next =
      mode === NAV_LAYOUT_MODES.TREE || mode === NAV_LAYOUT_MODES.RIBBON ? mode : NAV_LAYOUT_MODES.TREE;
    setLayoutModeState(next);
    try {
      localStorage.setItem(NAV_LAYOUT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLayoutMode = useCallback(() => {
    setLayoutMode(layoutMode === NAV_LAYOUT_MODES.TREE ? NAV_LAYOUT_MODES.RIBBON : NAV_LAYOUT_MODES.TREE);
  }, [layoutMode, setLayoutMode]);

  const value = useMemo(
    () => ({
      layoutMode,
      setLayoutMode,
      toggleLayoutMode,
      isTreeLayout: layoutMode === NAV_LAYOUT_MODES.TREE,
    }),
    [layoutMode, setLayoutMode, toggleLayoutMode]
  );

  return <NavigationLayoutContext.Provider value={value}>{children}</NavigationLayoutContext.Provider>;
}

export function useNavigationLayout() {
  const ctx = useContext(NavigationLayoutContext);
  if (!ctx) {
    throw new Error('useNavigationLayout must be used within NavigationLayoutProvider');
  }
  return ctx;
}
