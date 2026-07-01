import { TemplateStructure } from '../types/dataCollection';
import { ChecklistPhotoEntry } from '../types/dataCollection';
import { isItemVisible } from './checklistVisibility';
import { hasLocationCoords } from './locationAnswerUtils';

export function photoList(value: unknown): ChecklistPhotoEntry[] {
  if (!value || typeof value !== 'object') return [];
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.photos)) return v.photos as ChecklistPhotoEntry[];
  if (Array.isArray(value)) return value as ChecklistPhotoEntry[];
  return [];
}

export function isEmptyAnswer(
  item: { type: string; requireGps?: boolean; allowMultiple?: boolean },
  value: unknown
): boolean {
  if (value === undefined || value === null) return true;
  if (item.type === 'project_milestones' || item.type === 'project_bq_items' || item.type === 'indicator') {
    if (item.allowMultiple) return !Array.isArray(value) || value.length === 0;
    if (typeof value === 'object' && value != null && !Array.isArray(value)) {
      return (value as { id?: number }).id == null;
    }
    return value === '' || value == null;
  }
  if (item.type === 'multi_select') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (item.type === 'yes_no') {
    return value !== 'yes' && value !== 'no';
  }
  if (item.type === 'progress_status') {
    const v = String(value || '').trim();
    return !['on_track', 'delayed', 'stalled', 'completed'].includes(v);
  }
  if (item.type === 'photo') {
    return photoList(value).length === 0;
  }
  if (item.type === 'location') {
    return !hasLocationCoords(value);
  }
  if (item.type === 'area_location') {
    if (!value || typeof value !== 'object') return true;
    const v = value as Record<string, unknown>;
    return (
      !String(v.subcounty || '').trim() ||
      !String(v.ward || '').trim() ||
      !String(v.sublocation || '').trim() ||
      !String(v.village || '').trim()
    );
  }
  if (item.type === 'user') {
    if (value == null || value === '') return true;
    if (typeof value === 'object') {
      const v = value as { displayName?: string; userId?: number };
      return !String(v.displayName || '').trim() && v.userId == null;
    }
    return String(value).trim() === '';
  }
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

export function validateChecklistAnswers(
  structure: TemplateStructure,
  answers: Record<string, unknown> | undefined | null
): string[] {
  if (!answers || typeof answers !== 'object') {
    return ['Answers must be provided.'];
  }
  const missing: string[] = [];
  for (const sec of structure.sections || []) {
    for (const item of sec.items || []) {
      if (!item.required) continue;
      if (!isItemVisible(item, answers)) continue;
      if (isEmptyAnswer(item, answers[item.id])) {
        missing.push(item.label || item.id);
      }
    }
  }
  return missing;
}
