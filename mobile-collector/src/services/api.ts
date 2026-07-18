import axios, { AxiosError, AxiosInstance } from 'axios';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, STORAGE_KEYS, APP_VERSION, CLIENT_APP_ID } from '../config/api';
import { isNewerVersion } from '../utils/versionUtils';
import { mapJwtUserToAuthUser, parseJwtUser } from '../utils/jwtUtils';
import {
  normalizeUploadUri,
  parseJsonResponse,
  toNetworkError,
  toUploadHttpError,
} from '../utils/uploadUtils';
import {
  DataCollectionSubmission,
  DataCollectionTemplate,
  LoginOtpChallenge,
  ProjectLite,
  RriProgrammeLite,
  VisitSubjectType,
} from '../types/dataCollection';

export interface AuthUser {
  id: number;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roleName?: string;
}

type LoginResult =
  | { kind: 'token'; token: string; forcePasswordChange?: boolean; user?: AuthUser }
  | { kind: 'otp'; challenge: LoginOtpChallenge };

class ApiService {
  private client: AxiosInstance;
  private onUnauthorized: (() => void) | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 45000,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-App': CLIENT_APP_ID,
      },
    });

    this.client.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          await AsyncStorage.multiRemove([
            STORAGE_KEYS.AUTH_TOKEN,
            STORAGE_KEYS.USER_DATA,
          ]);
          this.onUnauthorized?.();
        }
        return Promise.reject(error);
      }
    );
  }

  private async setMustChangePassword(required: boolean): Promise<void> {
    if (required) {
      await AsyncStorage.setItem(STORAGE_KEYS.MUST_CHANGE_PASSWORD, 'true');
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.MUST_CHANGE_PASSWORD);
    }
  }

  async getMustChangePassword(): Promise<boolean> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.MUST_CHANGE_PASSWORD);
    return value === 'true';
  }

  private mapMeUser(user: Record<string, unknown> | null | undefined): AuthUser {
    const id = Number(user?.id ?? user?.userId ?? user?.actualUserId);
    return {
      id: Number.isFinite(id) && id > 0 ? id : 0,
      username: typeof user?.username === 'string' ? user.username : undefined,
      email: typeof user?.email === 'string' ? user.email : undefined,
      firstName: typeof user?.firstName === 'string'
        ? user.firstName
        : typeof user?.firstname === 'string'
          ? user.firstname
          : undefined,
      lastName: typeof user?.lastName === 'string'
        ? user.lastName
        : typeof user?.lastname === 'string'
          ? user.lastname
          : undefined,
      roleName: typeof user?.roleName === 'string'
        ? user.roleName
        : typeof user?.role === 'string'
          ? user.role
          : undefined,
    };
  }

  private async persistSession(
    token: string,
    options: { forcePasswordChange?: boolean } = {}
  ): Promise<AuthUser> {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);

    let meUser: AuthUser | null = null;
    let mustChangePassword = options.forcePasswordChange === true;

    try {
      const response = await this.client.get('/api/auth/me');
      const user = response.data?.user || response.data;
      meUser = this.mapMeUser(user);
      if (response.data?.mustChangePassword === true) {
        mustChangePassword = true;
      } else if (response.data?.mustChangePassword === false) {
        mustChangePassword = false;
      }
    } catch (refreshErr) {
      const jwtUser = mapJwtUserToAuthUser(parseJwtUser(token));
      if (jwtUser) {
        meUser = jwtUser;
      } else {
        const sessionMsg =
          (refreshErr as AxiosError)?.response?.data &&
          typeof (refreshErr as AxiosError).response?.data === 'object'
            ? ((refreshErr as AxiosError).response?.data as { error?: string; message?: string }).error
              || ((refreshErr as AxiosError).response?.data as { message?: string }).message
            : null;
        throw new Error(sessionMsg || 'Signed in but could not load your profile. Try again.');
      }
    }

    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(meUser));
    await this.setMustChangePassword(mustChangePassword);
    return meUser;
  }

  /** Validate stored token on app launch (mirrors web session refresh). */
  async resumeSession(): Promise<{ authenticated: boolean; mustChangePassword: boolean }> {
    await this.migrateLegacyStorageKeys();
    const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) {
      await this.logout();
      return { authenticated: false, mustChangePassword: false };
    }

    try {
      await this.persistSession(token);
      return {
        authenticated: true,
        mustChangePassword: await this.getMustChangePassword(),
      };
    } catch {
      await this.logout();
      return { authenticated: false, mustChangePassword: false };
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const response = await this.client.post('/api/auth/login', {
      username: username.trim(),
      password: password.trim(),
      clientApp: CLIENT_APP_ID,
    });
    const data = response.data || {};

    if (data.otpRequired && data.otpChallengeId) {
      return {
        kind: 'otp',
        challenge: {
          otpRequired: true,
          otpChallengeId: data.otpChallengeId,
          otpChannel: data.otpChannel,
          maskedPhone: data.maskedPhone,
          message: data.message,
        },
      };
    }

    if (!data.token) {
      throw new Error(data.error || data.message || 'Login did not return a token.');
    }

    const me = await this.persistSession(data.token, {
      forcePasswordChange: data.forcePasswordChange === true,
    });
    await this.reportAppUsage('app_login');
    return {
      kind: 'token',
      token: data.token,
      forcePasswordChange: await this.getMustChangePassword(),
      user: me,
    };
  }

  async verifyOtp(challengeId: string, code: string): Promise<{ token: string; forcePasswordChange: boolean }> {
    const response = await this.client.post('/api/auth/login/verify-otp', {
      challengeId,
      code: String(code).trim(),
    });
    const data = response.data || {};
    if (!data.token) {
      throw new Error(data.error || 'Verification did not return a token.');
    }
    if (!data.token) {
      throw new Error(data.error || 'Verification did not return a token.');
    }
    await this.persistSession(data.token, {
      forcePasswordChange: data.forcePasswordChange === true,
    });
    await this.reportAppUsage('app_login');
    return {
      token: data.token,
      forcePasswordChange: await this.getMustChangePassword(),
    };
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await this.client.post('/api/auth/change-password', {
      currentPassword: currentPassword.trim(),
      newPassword: newPassword.trim(),
    });
    const data = response.data || {};
    if (data.token) {
      await this.persistSession(data.token, { forcePasswordChange: false });
    } else {
      await this.setMustChangePassword(false);
    }
  }

  async fetchMe(): Promise<AuthUser> {
    const response = await this.client.get('/api/auth/me');
    const user = response.data?.user || response.data;
    const me = this.mapMeUser(user);
    if (response.data?.mustChangePassword === true) {
      await this.setMustChangePassword(true);
    } else if (response.data?.mustChangePassword === false) {
      await this.setMustChangePassword(false);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(me));
    return me;
  }

  private async geographyNames(path: string, params: Record<string, string> = {}): Promise<string[]> {
    const response = await this.client.get(path, { params });
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data.filter(Boolean) : [];
  }

  async getGeographySubcounties(): Promise<string[]> {
    return this.geographyNames('/api/geography/subcounties');
  }

  async getGeographyWards(subcounty: string): Promise<string[]> {
    return this.geographyNames('/api/geography/wards', { subcounty });
  }

  async getGeographySublocations(subcounty: string, ward: string): Promise<string[]> {
    return this.geographyNames('/api/geography/sublocations', { subcounty, ward });
  }

  async getGeographyVillages(
    subcounty: string,
    ward: string,
    sublocation: string
  ): Promise<string[]> {
    return this.geographyNames('/api/geography/villages', { subcounty, ward, sublocation });
  }

  async logout(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.USER_DATA,
      STORAGE_KEYS.MUST_CHANGE_PASSWORD,
    ]);
  }

  /** Called when the API returns 401 (expired/invalid session). */
  setUnauthorizedHandler(handler: (() => void) | null): void {
    this.onUnauthorized = handler;
  }

  async getAuthToken(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  async getUserData(): Promise<AuthUser | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
    return raw ? JSON.parse(raw) : null;
  }

  async listTemplates(opts: { category?: string } = {}): Promise<DataCollectionTemplate[]> {
    const params: Record<string, string> = {};
    if (opts.category) params.category = opts.category;
    const response = await this.client.get('/api/data-collection/templates', { params });
    return Array.isArray(response.data) ? response.data : [];
  }

  async getTemplate(id: number): Promise<DataCollectionTemplate> {
    const response = await this.client.get(`/api/data-collection/templates/${id}`);
    return response.data;
  }

  async listProjects(opts: { limit?: number; projectName?: string } = {}): Promise<ProjectLite[]> {
    const params: Record<string, string | number> = { limit: opts.limit ?? 500 };
    if (opts.projectName) params.projectName = opts.projectName;
    const response = await this.client.get('/api/projects', { params });
    const rows = Array.isArray(response.data) ? response.data : response.data?.data ?? [];
    return rows.map((p: any) => ({
      id: Number(p.id ?? p.projectId ?? p.project_id),
      projectName: p.projectName || p.name || `Project #${p.id ?? p.projectId}`,
      status: p.status,
      departmentName: p.departmentName,
    }));
  }

  async listRriProgrammes(): Promise<RriProgrammeLite[]> {
    const response = await this.client.get('/api/rri');
    const rows = Array.isArray(response.data) ? response.data : [];
    return rows.map((p: any) => ({
      programmeId: Number(p.programmeId ?? p.id),
      name: p.name || p.programmeName || `Programme #${p.programmeId ?? p.id}`,
      status: p.status,
      sector: p.sector,
    }));
  }

  async getProjectFieldOptions(
    projectId: number,
    source: 'project_milestones' | 'project_bq_items' | 'indicator',
    opts: { subjectType?: VisitSubjectType; rriProgrammeId?: number } = {}
  ): Promise<{ options: Array<{ id: number; label: string }> }> {
    const params: Record<string, string | number> = { projectId, source };
    if (opts.subjectType) params.subjectType = opts.subjectType;
    if (opts.rriProgrammeId != null) params.rriProgrammeId = opts.rriProgrammeId;
    const response = await this.client.get('/api/data-collection/project-field-options', { params });
    return response.data;
  }

  async getFieldOptions(opts: {
    source: 'project_milestones' | 'project_bq_items' | 'indicator';
    subjectType?: VisitSubjectType;
    projectId?: number;
    rriProgrammeId?: number;
  }): Promise<{ options: Array<{ id: number; label: string }> }> {
    const params: Record<string, string | number> = { source: opts.source };
    if (opts.subjectType) params.subjectType = opts.subjectType;
    if (opts.projectId != null) params.projectId = opts.projectId;
    if (opts.rriProgrammeId != null) params.rriProgrammeId = opts.rriProgrammeId;
    const response = await this.client.get('/api/data-collection/field-options', { params });
    return response.data;
  }

  async listSubmissions(opts: {
    projectId?: number;
    rriProgrammeId?: number;
    subjectType?: VisitSubjectType;
  } = {}): Promise<DataCollectionSubmission[]> {
    const params: Record<string, number | string> = {};
    if (opts.projectId != null) params.projectId = opts.projectId;
    if (opts.rriProgrammeId != null) params.rriProgrammeId = opts.rriProgrammeId;
    if (opts.subjectType) params.subjectType = opts.subjectType;
    const response = await this.client.get('/api/data-collection/submissions', { params });
    return Array.isArray(response.data) ? response.data : [];
  }

  async createSubmission(body: {
    templateId: number;
    subjectType?: VisitSubjectType;
    projectId?: number;
    rriProgrammeId?: number;
    visitDate?: string;
    title?: string;
    answers: Record<string, unknown>;
    progressStatus?: string;
    inspectionId?: number;
  }): Promise<DataCollectionSubmission> {
    const response = await this.client.post('/api/data-collection/submissions', body, {
      timeout: 120000,
    });
    return response.data;
  }

  async submitMonitoringToWard(submissionId: number): Promise<DataCollectionSubmission> {
    const response = await this.client.post(
      `/api/village-monitoring/reports/${submissionId}/submit`
    );
    return response.data;
  }

  async submitAllMonitoringDrafts(): Promise<{
    submitted: DataCollectionSubmission[];
    failed: Array<{ submissionId: number; title?: string; message: string }>;
    total: number;
  }> {
    const response = await this.client.post('/api/village-monitoring/reports/submit-drafts');
    return response.data;
  }

  async uploadAttachment(
    localUri: string,
    meta: {
      itemId?: string;
      fileName?: string;
      mimeType?: string;
      lat?: number | null;
      lng?: number | null;
      accuracy?: number | null;
      capturedAt?: string;
    } = {}
  ): Promise<{
    fileId: number;
    url: string;
    fileName: string;
    lat?: number | null;
    lng?: number | null;
    accuracy?: number | null;
    capturedAt?: string;
  }> {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) {
      throw toUploadHttpError(401, { message: 'Session expired. Sign in again.' }, 'Unauthorized');
    }

    const form = new FormData();
    const uploadUri = normalizeUploadUri(localUri);
    form.append('file', {
      uri: uploadUri,
      type: meta.mimeType || 'image/jpeg',
      name: meta.fileName || 'photo.jpg',
    } as unknown as Blob);
    if (meta.itemId) form.append('itemId', meta.itemId);
    if (meta.lat != null) form.append('lat', String(meta.lat));
    if (meta.lng != null) form.append('lng', String(meta.lng));
    if (meta.accuracy != null) form.append('accuracy', String(meta.accuracy));
    if (meta.capturedAt) form.append('capturedAt', meta.capturedAt);

    // fetch handles multipart boundaries reliably on Android (axios often fails with Network Error).
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/data-collection/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-Client-App': CLIENT_APP_ID,
        },
        body: form,
      });
    } catch {
      throw toNetworkError();
    }

    const data = await parseJsonResponse(response);
    if (response.status === 401) {
      await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER_DATA]);
      this.onUnauthorized?.();
      throw toUploadHttpError(401, data, 'Session expired. Sign in again.');
    }
    if (!response.ok) {
      const message =
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        `Photo upload failed (${response.status}).`;
      throw toUploadHttpError(response.status, data, message);
    }

    return data as {
      fileId: number;
      url: string;
      fileName: string;
      lat?: number | null;
      lng?: number | null;
      accuracy?: number | null;
      capturedAt?: string;
    };
  }

  async reportAppUsage(eventType: 'app_login' | 'app_sync' = 'app_login'): Promise<void> {
    try {
      await this.client.post('/api/mobile-app/usage/report', {
        appVersion: APP_VERSION,
        eventType,
      });
    } catch {
      // Non-blocking telemetry
    }
  }

  /** Server-published APK version (null if none or request fails). */
  async getPublishedAppVersion(): Promise<string | null> {
    try {
      const response = await this.client.get('/api/mobile-app/release');
      const version = response.data?.release?.version;
      return version != null ? String(version).trim() : null;
    } catch {
      return null;
    }
  }

  openStaffDownloadPage(): void {
    Linking.openURL(`${API_BASE_URL}/mobile-app`).catch(() => {});
  }

  private async migrateLegacyStorageKeys(): Promise<void> {
    const current = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (current) return;
    const legacyToken = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_AUTH_TOKEN);
    if (!legacyToken) return;
    const legacyUser = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_USER_DATA);
    const pairs: [string, string][] = [[STORAGE_KEYS.AUTH_TOKEN, legacyToken]];
    if (legacyUser) pairs.push([STORAGE_KEYS.USER_DATA, legacyUser]);
    await AsyncStorage.multiSet(pairs);
  }

  async getSummaryKpis(filters: Record<string, string> = {}): Promise<{
    totalProjects: number;
    totalBudget: number;
    totalPaid: number;
  }> {
    const response = await this.client.get('/api/reports/summary-kpis', { params: filters });
    const row = response.data || {};
    return {
      totalProjects: Number(row.totalProjects ?? row.total_projects ?? 0) || 0,
      totalBudget: Number(row.totalBudget ?? row.total_budget ?? 0) || 0,
      totalPaid: Number(row.totalPaid ?? row.total_paid ?? row.totalDisbursed ?? 0) || 0,
    };
  }

  async getOrganizationProjects(limit = 3000): Promise<any[]> {
    const response = await this.client.get('/api/projects/organization-projects', {
      params: { limit },
      timeout: 90000,
    });
    return Array.isArray(response.data) ? response.data : response.data?.data ?? [];
  }

  async getProjectStatusCounts(filters: Record<string, string> = {}): Promise<any> {
    const response = await this.client.get('/api/projects/status-counts', { params: filters });
    return response.data;
  }

  async getProjectFundingOverview(): Promise<any> {
    const response = await this.client.get('/api/projects/funding-overview');
    return response.data;
  }

  async getMyTasks(opts: { limit?: number } = {}): Promise<{
    tasks: any[];
    counts?: Record<string, number>;
  }> {
    const response = await this.client.get('/api/my-tasks', {
      params: { limit: opts.limit ?? 50 },
    });
    const data = response.data || {};
    const tasks = Array.isArray(data.tasks)
      ? data.tasks
      : Array.isArray(data)
        ? data
        : [];
    return { tasks, counts: data.counts };
  }

  async getEscalationSignals(opts: {
    status?: string;
    severity?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    const response = await this.client.get('/api/project-escalations/signals', {
      params: {
        status: opts.status || 'open',
        severity: opts.severity,
      },
    });
    const rows = Array.isArray(response.data) ? response.data : response.data?.signals ?? [];
    return rows;
  }

  async getEscalationSummary(): Promise<any> {
    const response = await this.client.get('/api/project-escalations/summary');
    return response.data;
  }

  async getDepartmentSummary(filters: Record<string, string> = {}): Promise<any> {
    const response = await this.client.get('/api/reports/department-summary', { params: filters });
    return response.data;
  }

  async getSubcountySummary(filters: Record<string, string> = {}): Promise<any> {
    const response = await this.client.get('/api/reports/subcounty-summary', { params: filters });
    return response.data;
  }

  async getProjectById(projectId: number): Promise<any> {
    const response = await this.client.get(`/api/projects/${projectId}`);
    return response.data?.data ?? response.data;
  }

  async searchProjects(opts: { projectName?: string; limit?: number } = {}): Promise<ProjectLite[]> {
    return this.listProjects({
      limit: opts.limit ?? 100,
      projectName: opts.projectName,
    });
  }

  /** Prompt once per published version when the installed app is older. */
  async promptForAppUpdateIfNeeded(): Promise<void> {
    const latest = await this.getPublishedAppVersion();
    if (!latest) return;
    if (!isNewerVersion(latest, APP_VERSION)) return;

    const dismissKey = `@cimes_mobile_update_dismissed_${latest}`;
    const dismissed = await AsyncStorage.getItem(dismissKey);
    if (dismissed === '1') return;

    Alert.alert(
      'App update available',
      `Version ${latest} is published. Open the staff portal to download and install the new APK.`,
      [
        { text: 'Later', style: 'cancel', onPress: () => AsyncStorage.setItem(dismissKey, '1') },
        { text: 'Open download page', onPress: () => this.openStaffDownloadPage() },
      ]
    );
  }
}

export default new ApiService();
