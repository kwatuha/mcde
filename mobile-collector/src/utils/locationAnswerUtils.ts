import { ChecklistLocationAnswer } from '../types/dataCollection';

/** Normalize location answers from mobile, web, or legacy shapes. */
export function normalizeLocationAnswer(value: unknown): ChecklistLocationAnswer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const lat = Number(v.lat ?? v.latitude);
  const lng = Number(v.lng ?? v.longitude ?? v.lon ?? v.long);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const accuracyRaw = v.accuracy;
  const accuracy =
    accuracyRaw != null && accuracyRaw !== '' ? Number(accuracyRaw) : undefined;
  const capturedAt =
    typeof v.capturedAt === 'string' && v.capturedAt.trim()
      ? v.capturedAt
      : new Date().toISOString();
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
    capturedAt,
  };
}

export function hasLocationCoords(value: unknown): boolean {
  return normalizeLocationAnswer(value) != null;
}
