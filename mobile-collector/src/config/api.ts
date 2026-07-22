/**
 * CIMES Mobile — county platform API.
 *
 * Production (default): https://cimes.machakos.go.ke
 * Local emulator API:   http://10.0.2.2:3002
 *
 * Do not point production builds at monitoring.icskenya.co.ke or the raw :8084 IP
 * unless you are deliberately testing that host.
 */
export const API_BASE_URL = 'https://cimes.machakos.go.ke';

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@cimes_mobile_auth_token',
  USER_DATA: '@cimes_mobile_user_data',
  MUST_CHANGE_PASSWORD: '@cimes_mobile_must_change_password',
  TEMPLATES_CACHE: '@cimes_mobile_templates',
  PROJECTS_CACHE: '@cimes_mobile_projects',
  PENDING_SUBMISSIONS: '@cimes_mobile_pending_submissions',
  VISIT_DRAFT: '@cimes_mobile_visit_draft',
  CACHE_TIMESTAMP: '@cimes_mobile_cache_ts',
  /** Migrate from Machakos Collector keys once after upgrade. */
  LEGACY_AUTH_TOKEN: '@machakos_collector_auth_token',
  LEGACY_USER_DATA: '@machakos_collector_user_data',
};

/** Bump when publishing an APK that must hit cimes.machakos.go.ke. */
export const APP_VERSION = '1.1.3';
export const CLIENT_APP_ID = 'cimes-mobile';

export const THEME = {
  primary: '#005A9A',
  primaryDark: '#003559',
  accent: '#2E7D32',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#666666',
  border: '#E0E0E0',
  danger: '#C62828',
  warning: '#F57C00',
};
