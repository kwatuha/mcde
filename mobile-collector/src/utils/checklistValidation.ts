import { TemplateStructure } from '../types/dataCollection';
import { ChecklistPhotoEntry } from '../types/dataCollection';
import { isItemVisible, stripHiddenAnswers } from './checklistVisibility';
import { hasLocationCoords } from './locationAnswerUtils';
import { isUserFieldEmpty } from './userFieldUtils';

export function multiSelectValues(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'object' && v != null) {
          const o = v as { label?: string; value?: string; id?: unknown };
          return o.label ?? o.value ?? o.id;
        }
        return v;
      })
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        return multiSelectValues(JSON.parse(trimmed));
      } catch {
        // fall through
      }
    }
    return trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeAnswersForSubmit(
  structure: TemplateStructure,
  answers: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!answers || typeof answers !== 'object') return {};
  const next = { ...answers };
  for (const sec of structure.sections || []) {
    for (const item of sec.items || []) {
      if (item.type === 'multi_select') {
        next[item.id] = multiSelectValues(next[item.id]);
      }
    }
  }
  return stripHiddenAnswers(structure, next);
}

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
    return multiSelectValues(value).length === 0;
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
    return isUserFieldEmpty(value);
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
