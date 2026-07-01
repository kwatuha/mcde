import apiService from './api';
import {
  getCachedTemplates,
  getPendingSubmissions,
  removePendingSubmission,
  savePendingSubmission,
  setCachedProjects,
  setCachedTemplates,
} from './offlineStore';
import { PendingSubmission } from '../types/dataCollection';
import { uploadPendingPhotosInAnswers } from '../utils/attachmentUpload';
import { extractApiError, shouldQueueOffline } from '../utils/apiErrorUtils';
import { extractProgressStatusFromAnswers } from '../utils/progressStatus';

export type CatalogRefreshResult = {
  templates: number;
  projects: number;
  /** Checklists saved but project list could not be refreshed. */
  partial?: boolean;
};

/** Download checklists (required) and projects (best-effort) for offline use. */
export async function refreshCatalog(): Promise<CatalogRefreshResult> {
  const templates = await apiService.listTemplates({});
  await setCachedTemplates(templates);

  let projects = 0;
  let partial = false;
  try {
    const rows = await apiService.listProjects({ limit: 500 });
    await setCachedProjects(rows);
    projects = rows.length;
  } catch {
    partial = true;
  }

  apiService.reportAppUsage('app_sync').catch(() => {});
  return { templates: templates.length, projects, partial };
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

  const templates = await getCachedTemplates();

  for (const item of pending) {
    if (item.status !== 'pending' && item.status !== 'failed') continue;
    try {
      const answers = await uploadPendingPhotosInAnswers(item.answers);
      const tpl = templates.find((t) => t.templateId === item.templateId);
      const progressStatus = extractProgressStatusFromAnswers(tpl?.structure, answers);
      await apiService.createSubmission({
        templateId: item.templateId,
        subjectType: item.subjectType || 'project',
        projectId: item.projectId,
        rriProgrammeId: item.rriProgrammeId,
        visitDate: item.visitDate,
        title: item.title,
        answers,
        ...(progressStatus ? { progressStatus } : {}),
      });
      await removePendingSubmission(item.localId);
      synced += 1;
    } catch (err: unknown) {
      failed += 1;
      const message = extractApiError(err);
      errors.push(`${item.title || item.localId}: ${message}`);
      const updated: PendingSubmission = {
        ...item,
        status: shouldQueueOffline(err) ? 'pending' : 'failed',
        lastError: message,
      };
      await savePendingSubmission(updated);
    }
  }

  return { synced, failed, errors };
}

export function makeLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
