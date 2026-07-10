/**
 * Machakos County data collection API.
 *
 * Production (county staff): https://monitoring.icskenya.co.ke
 * MCmes legacy host: http://84.247.128.58:8084
 * Android emulator + local API: http://10.0.2.2:3002
 */
export const API_BASE_URL = 'https://monitoring.icskenya.co.ke';

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@machakos_collector_auth_token',
  USER_DATA: '@machakos_collector_user_data',
  MUST_CHANGE_PASSWORD: '@machakos_collector_must_change_password',
  TEMPLATES_CACHE: '@machakos_collector_templates',
  PROJECTS_CACHE: '@machakos_collector_projects',
  PENDING_SUBMISSIONS: '@machakos_collector_pending_submissions',
  VISIT_DRAFT: '@machakos_collector_visit_draft',
  CACHE_TIMESTAMP: '@machakos_collector_cache_ts',
};

export const APP_VERSION = '1.0.18';

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
