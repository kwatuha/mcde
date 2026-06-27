import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/api';
import {
  DataCollectionTemplate,
  PendingSubmission,
  ProjectLite,
  VisitDraft,
} from '../types/dataCollection';

export async function getCachedTemplates(): Promise<DataCollectionTemplate[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.TEMPLATES_CACHE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setCachedTemplates(templates: DataCollectionTemplate[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.TEMPLATES_CACHE, JSON.stringify(templates));
  await AsyncStorage.setItem(STORAGE_KEYS.CACHE_TIMESTAMP, new Date().toISOString());
}

export async function getCachedProjects(): Promise<ProjectLite[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PROJECTS_CACHE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setCachedProjects(projects: ProjectLite[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.PROJECTS_CACHE, JSON.stringify(projects));
}

export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SUBMISSIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePendingSubmission(entry: PendingSubmission): Promise<void> {
  const list = await getPendingSubmissions();
  const idx = list.findIndex((x) => x.localId === entry.localId);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SUBMISSIONS, JSON.stringify(list));
}

export async function removePendingSubmission(localId: string): Promise<void> {
  const list = await getPendingSubmissions();
  await AsyncStorage.setItem(
    STORAGE_KEYS.PENDING_SUBMISSIONS,
    JSON.stringify(list.filter((x) => x.localId !== localId))
  );
}

export async function getVisitDraft(): Promise<VisitDraft | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.VISIT_DRAFT);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setVisitDraft(draft: VisitDraft | null): Promise<void> {
  if (!draft) {
    await AsyncStorage.removeItem(STORAGE_KEYS.VISIT_DRAFT);
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.VISIT_DRAFT,
    JSON.stringify({ ...draft, savedAt: new Date().toISOString() })
  );
}

export async function getCacheTimestamp(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.CACHE_TIMESTAMP);
}
