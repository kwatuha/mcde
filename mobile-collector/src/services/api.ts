import axios, { AxiosError, AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, STORAGE_KEYS, APP_VERSION } from '../config/api';
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
      username,
      password,
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

    await this.persistSession(data.token);
    await this.reportAppUsage('app_login');
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
    const params: Record<string, string | number> = { limit: opts.limit ?? 3000 };
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
}

export default new ApiService();
