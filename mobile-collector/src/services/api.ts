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
} from '../types/dataCollection';

export interface AuthUser {
  id: number;
  username?: string;
  email?: string;
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
      roleName: user?.roleName ?? user?.role,
    };
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
      id: Number(p.id),
      projectName: p.projectName || p.name || `Project #${p.id}`,
      status: p.status,
      departmentName: p.departmentName,
    }));
  }

  async listSubmissions(opts: { projectId?: number } = {}): Promise<DataCollectionSubmission[]> {
    const params: Record<string, number> = {};
    if (opts.projectId != null) params.projectId = opts.projectId;
    const response = await this.client.get('/api/data-collection/submissions', { params });
    return Array.isArray(response.data) ? response.data : [];
  }

  async createSubmission(body: {
    templateId: number;
    projectId: number;
    visitDate?: string;
    title?: string;
    answers: Record<string, unknown>;
  }): Promise<DataCollectionSubmission> {
    const response = await this.client.post('/api/data-collection/submissions', body);
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
