/**
 * Unified post-login navigation for all roles (workspace + default).
 * Always full-page redirect after JWT is in localStorage — avoids React state
 * races that affected default users (navigate '/') and workspace users (assign).
 */

/** Home dashboard for roles without a UI profile / portal workspace landing. */
export const DEFAULT_POST_LOGIN_LANDING = '/';

const POST_LOGIN_LANDING_KEY = 'machakos.postLoginLanding';

export function normalizePostLoginPath(value) {
  if (value == null || value === '') return DEFAULT_POST_LOGIN_LANDING;
  let path = String(value).trim();
  if (!path) return DEFAULT_POST_LOGIN_LANDING;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return DEFAULT_POST_LOGIN_LANDING;
    }
  }
  if (!path.startsWith('/')) path = `/${path}`;
  const base = path.split('?')[0].split('#')[0];
  return base || DEFAULT_POST_LOGIN_LANDING;
}

export function persistPostLoginLanding(path) {
  const normalized = normalizePostLoginPath(path);
  try {
    sessionStorage.setItem(POST_LOGIN_LANDING_KEY, normalized);
  } catch (_) {
    // sessionStorage may be unavailable in strict privacy mode
  }
  return normalized;
}

export function takePersistedPostLoginLanding() {
  try {
    const value = sessionStorage.getItem(POST_LOGIN_LANDING_KEY);
    if (value) sessionStorage.removeItem(POST_LOGIN_LANDING_KEY);
    return value ? normalizePostLoginPath(value) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Navigate to the resolved landing path after login (same code path for every role).
 * @param {string} landingPath
 */
export function goToPostLoginLanding(landingPath) {
  const target = persistPostLoginLanding(landingPath);
  window.location.replace(target);
}
