import apiService from './api';
import {
  getPendingSubmissions,
  removePendingSubmission,
  savePendingSubmission,
  setCachedProjects,
  setCachedTemplates,
} from './offlineStore';
import { PendingSubmission } from '../types/dataCollection';

export async function refreshCatalog(): Promise<{ templates: number; projects: number }> {
  const [templates, projects] = await Promise.all([
    apiService.listTemplates({ category: undefined }),
    apiService.listProjects({ limit: 3000 }),
  ]);
  await setCachedTemplates(templates);
  await setCachedProjects(projects);
  await apiService.reportAppUsage('app_sync');
  return { templates: templates.length, projects: projects.length };
}

export async function syncPendingSubmissions(): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const pending = await getPendingSubmissions();
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of pending) {
    if (item.status !== 'pending' && item.status !== 'failed') continue;
    try {
      await apiService.createSubmission({
        templateId: item.templateId,
        projectId: item.projectId,
        visitDate: item.visitDate,
        title: item.title,
        answers: item.answers,
      });
      await removePendingSubmission(item.localId);
      synced += 1;
    } catch (err: any) {
      failed += 1;
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Upload failed';
      errors.push(`${item.title || item.localId}: ${message}`);
      const updated: PendingSubmission = { ...item, status: 'failed', lastError: message };
      await savePendingSubmission(updated);
    }
  }

  return { synced, failed, errors };
}

export function makeLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
