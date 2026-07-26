import { useEffect, useState } from 'react';

/**
 * Remembers the project the user last worked on (opened its details page),
 * so standalone project pages (Teams, Documents, Evaluation, ...) can preselect it
 * instead of forcing the user to search for the project again.
 *
 * Persisted in localStorage and broadcast via a window event so the Topbar chip
 * and any open pages stay in sync within the tab.
 */

const STORAGE_KEY = 'cimes-active-project';
const CHANGE_EVENT = 'cimes-active-project-changed';

export function getActiveProject() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const projectId = Number(parsed?.projectId);
    if (!Number.isFinite(projectId)) return null;
    return {
      projectId,
      projectName: String(parsed?.projectName || '').trim(),
    };
  } catch {
    return null;
  }
}

export function setActiveProject({ projectId, projectName = '' } = {}) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const id = Number(projectId);
  if (!Number.isFinite(id)) return;
  const current = getActiveProject();
  const next = { projectId: id, projectName: String(projectName || '').trim() };
  if (current && current.projectId === next.projectId && current.projectName === next.projectName) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  } catch {
    /* storage full/blocked: chip simply won't persist */
  }
}

export function clearActiveProject() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: null }));
  } catch {
    /* ignore */
  }
}

/** Live view of the active project for React components (updates on change in this tab). */
export function useActiveProject() {
  const [active, setActive] = useState(() => getActiveProject());
  useEffect(() => {
    const onChange = () => setActive(getActiveProject());
    window.addEventListener(CHANGE_EVENT, onChange);
    // Cross-tab sync (storage events only fire in other tabs).
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return active;
}
