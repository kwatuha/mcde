import axios, { AxiosError, AxiosInstance } from 'axios';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, STORAGE_KEYS, APP_VERSION } from '../config/api';
import { isNewerVersion } from '../utils/versionUtils';
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
  | { kind: 'token'; token: string; forcePasswordChange?: boolean }
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
        'X-Client-App': 'machakos-collector',
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

  private async persistSession(token: string): Promise<AuthUser> {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    const me = await this.fetchMe();
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(me));
    return me;
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const response = await this.client.post('/api/auth/login', {
      username: username.trim(),
      password: password.trim(),
      clientApp: 'machakos-collector',
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

    try {
      await this.persistSession(data.token);
      await this.reportAppUsage('app_login');
    } catch (sessionErr: any) {
      const sessionMsg =
        sessionErr?.response?.data?.error ||
        sessionErr?.response?.data?.message ||
        sessionErr?.message;
      throw new Error(sessionMsg || 'Signed in but could not load your profile. Try again.');
    }
    return { kind: 'token', token: data.token, forcePasswordChange: data.forcePasswordChange };
  }

  async verifyOtp(challengeId: string, code: string): Promise<{ token: string }> {
    const response = await this.client.post('/api/auth/login/verify-otp', {
      challengeId,
      code: String(code).trim(),
    });
    const data = response.data || {};
    if (!data.token) {
      throw new Error(data.error || 'Verification did not return a token.');
    }
    await this.persistSession(data.token);
    await this.reportAppUsage('app_login');
    return { token: data.token };
  }

  async fetchMe(): Promise<AuthUser> {
    const response = await this.client.get('/api/auth/me');
    const user = response.data?.user || response.data;
    return {
      id: user?.id ?? user?.userId ?? user?.actualUserId,
      username: user?.username,
      email: user?.email,
      firstName: user?.firstName ?? user?.firstname,
      lastName: user?.lastName ?? user?.lastname,
      roleName: user?.roleName ?? user?.role,
    };
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
    const response = await this.client.post('/api/data-collection/submissions', body);
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
    const form = new FormData();
    form.append('file', {
      uri: localUri,
      type: meta.mimeType || 'image/jpeg',
      name: meta.fileName || 'photo.jpg',
    } as unknown as Blob);
    if (meta.itemId) form.append('itemId', meta.itemId);
    if (meta.lat != null) form.append('lat', String(meta.lat));
    if (meta.lng != null) form.append('lng', String(meta.lng));
    if (meta.accuracy != null) form.append('accuracy', String(meta.accuracy));
    if (meta.capturedAt) form.append('capturedAt', meta.capturedAt);

    // Do not set Content-Type manually — RN/axios must add the multipart boundary.
    const response = await this.client.post('/api/data-collection/attachments', form, {
      timeout: 120000,
      headers: { Accept: 'application/json' },
      transformRequest: (data, headers) => {
        if (headers) {
          delete (headers as Record<string, unknown>)['Content-Type'];
        }
        return data;
      },
    });
    return response.data;
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

  /** Prompt once per published version when the installed app is older. */
  async promptForAppUpdateIfNeeded(): Promise<void> {
    const latest = await this.getPublishedAppVersion();
    if (!latest) return;
    if (!isNewerVersion(latest, APP_VERSION)) return;

    const dismissKey = `@machakos_collector_update_dismissed_${latest}`;
    const dismissed = await AsyncStorage.getItem(dismissKey);
    if (dismissed === '1') return;

    Alert.alert(
      'App update available',
      `Version ${latest} is published. Open the staff portal to download and install the new APK (you stay signed in on the web).`,
      [
        { text: 'Later', style: 'cancel', onPress: () => AsyncStorage.setItem(dismissKey, '1') },
        { text: 'Open download page', onPress: () => this.openStaffDownloadPage() },
      ]
    );
  }
}

export default new ApiService();
