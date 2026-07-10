/** Standard progress status values for monitoring visits (matches API workflow). */
export const PROGRESS_STATUS_OPTIONS = [
  { value: 'on_track', label: 'On track' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'stalled', label: 'Stalled' },
  { value: 'completed', label: 'Completed' },
] as const;

export type ProgressStatusValue = (typeof PROGRESS_STATUS_OPTIONS)[number]['value'];

export function progressStatusLabel(value: string | null | undefined): string {
  const match = PROGRESS_STATUS_OPTIONS.find((o) => o.value === value);
  return match?.label || String(value || '—').replace(/_/g, ' ');
}

const IMPLEMENTATION_STATUS_TO_PROGRESS: Record<string, ProgressStatusValue> = {
  'on track': 'on_track',
  'minor delay': 'delayed',
  delayed: 'delayed',
  delay: 'delayed',
  stalled: 'stalled',
  completed: 'completed',
  on_track: 'on_track',
};

function mapImplementationStatusToProgress(raw: unknown): ProgressStatusValue | null {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return IMPLEMENTATION_STATUS_TO_PROGRESS[key] ?? null;
}

export function extractProgressStatusFromAnswers(
  structure: { sections?: Array<{ items?: Array<{ id: string; type: string; label?: string }> }> } | null | undefined,
  answers: Record<string, unknown> | null | undefined
): ProgressStatusValue | null {
  const ans = answers && typeof answers === 'object' ? answers : {};
  for (const sec of structure?.sections || []) {
    for (const item of sec.items || []) {
      if (item.type === 'progress_status') {
        const v = String(ans[item.id] || '').trim();
        if (PROGRESS_STATUS_OPTIONS.some((o) => o.value === v)) {
          return v as ProgressStatusValue;
        }
      }
    }
  }
  for (const sec of structure?.sections || []) {
    for (const item of sec.items || []) {
      const isImplementationField = item.id === 'implementation_status'
        || (item.type === 'select' && /implementation status/i.test(String(item.label || '')));
      if (!isImplementationField) continue;
      const mapped = mapImplementationStatusToProgress(ans[item.id]);
      if (mapped) return mapped;
    }
  }
  const direct = String(ans.progress_status || ans.progressStatus || '').trim();
  if (PROGRESS_STATUS_OPTIONS.some((o) => o.value === direct)) {
    return direct as ProgressStatusValue;
  }
  return mapImplementationStatusToProgress(ans.implementation_status);
}
