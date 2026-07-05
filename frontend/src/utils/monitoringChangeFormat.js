const PROGRESS_LABELS = {
  on_track: 'On track',
  delayed: 'Delayed',
  stalled: 'Stalled',
  completed: 'Completed',
};

export function formatProgressStatus(value) {
  const v = String(value ?? '').trim();
  if (!v) return '—';
  return PROGRESS_LABELS[v] || v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayValue(entry) {
  if (!entry || typeof entry !== 'object') return '—';
  if (entry.toDisplay != null && entry.toDisplay !== '') return String(entry.toDisplay);
  if (entry.fromDisplay != null && entry.fromDisplay !== '') return String(entry.fromDisplay);
  const raw = entry.to ?? entry.from;
  if (raw == null || raw === '') return '—';
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

/** Flatten structured changedFields from API into readable lines. */
export function flattenMonitoringChanges(changedFields) {
  if (!changedFields || typeof changedFields !== 'object') return [];

  const lines = [];

  if (changedFields.title) {
    lines.push({
      label: changedFields.title.label || 'Visit title',
      from: changedFields.title.fromDisplay ?? changedFields.title.from ?? '—',
      to: changedFields.title.toDisplay ?? changedFields.title.to ?? '—',
    });
  }

  if (changedFields.progressStatus) {
    lines.push({
      label: changedFields.progressStatus.label || 'Physical progress status',
      from: changedFields.progressStatus.fromDisplay ?? formatProgressStatus(changedFields.progressStatus.from),
      to: changedFields.progressStatus.toDisplay ?? formatProgressStatus(changedFields.progressStatus.to),
    });
  }

  if (changedFields.checklist && typeof changedFields.checklist === 'object') {
    for (const entry of Object.values(changedFields.checklist)) {
      if (!entry || typeof entry !== 'object') continue;
      lines.push({
        label: entry.label || 'Checklist item',
        from: entry.fromDisplay ?? displayValue({ from: entry.from }),
        to: entry.toDisplay ?? displayValue({ to: entry.to }),
      });
    }
  }

  // Legacy coarse diff (whole answers blob)
  if (changedFields.answers && !changedFields.checklist) {
    lines.push({
      label: 'Checklist answers',
      from: '(previous version)',
      to: '(updated)',
    });
  }

  return lines;
}

export function flattenWardChangesFromVillage(wardChangesFromVillage) {
  if (!Array.isArray(wardChangesFromVillage)) return [];
  return wardChangesFromVillage.map((entry) => ({
    label: entry.label || entry.field || 'Field',
    from: entry.fromDisplay ?? entry.from ?? '—',
    to: entry.toDisplay ?? entry.to ?? '—',
  }));
}

export function formatMonitoringChangesText(changedFields) {
  return flattenMonitoringChanges(changedFields)
    .map((line) => `${line.label}: ${line.from} → ${line.to}`)
    .join('\n');
}
