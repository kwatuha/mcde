const { flattenItems, formatAnswerDisplay } = require('./checklistAnswerUtils');

const PROGRESS_LABELS = {
  on_track: 'On track',
  delayed: 'Delayed',
  stalled: 'Stalled',
  completed: 'Completed',
};

function formatProgressStatus(value) {
  const v = String(value ?? '').trim();
  if (!v) return '—';
  return PROGRESS_LABELS[v] || v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildItemMap(structure) {
  const map = {};
  for (const item of flattenItems(structure)) {
    map[item.id] = item;
  }
  return map;
}

function snapshotContent(row) {
  return {
    title: row?.title ?? null,
    progressStatus: row?.progressStatus ?? row?.progress_status ?? null,
    answers: row?.answers && typeof row.answers === 'object' ? row.answers : {},
  };
}

function diffSubmissionContent(before, after, structure) {
  if (!before || !after) return null;
  const itemMap = buildItemMap(structure);
  const changes = {};

  if ((before.title ?? null) !== (after.title ?? null)) {
    changes.title = {
      label: 'Visit title',
      from: before.title ?? null,
      to: after.title ?? null,
    };
  }

  if ((before.progressStatus ?? null) !== (after.progressStatus ?? null)) {
    changes.progressStatus = {
      label: 'Physical progress status',
      from: before.progressStatus ?? null,
      to: after.progressStatus ?? null,
      fromDisplay: formatProgressStatus(before.progressStatus),
      toDisplay: formatProgressStatus(after.progressStatus),
    };
  }

  const checklist = {};
  const ids = new Set([
    ...Object.keys(before.answers || {}),
    ...Object.keys(after.answers || {}),
  ]);
  for (const id of ids) {
    const from = before.answers?.[id];
    const to = after.answers?.[id];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    const item = itemMap[id] || { id, label: id, type: 'text' };
    checklist[id] = {
      label: item.label || id,
      from: from ?? null,
      to: to ?? null,
      fromDisplay: formatAnswerDisplay(item, from),
      toDisplay: formatAnswerDisplay(item, to),
    };
  }
  if (Object.keys(checklist).length) {
    changes.checklist = checklist;
  }

  return Object.keys(changes).length ? changes : null;
}

function wardChangesList(changedFields) {
  if (!changedFields || typeof changedFields !== 'object') return [];
  const out = [];
  if (changedFields.title) {
    out.push({
      field: 'title',
      label: changedFields.title.label || 'Visit title',
      from: changedFields.title.from,
      to: changedFields.title.to,
      fromDisplay: changedFields.title.from ?? '—',
      toDisplay: changedFields.title.to ?? '—',
    });
  }
  if (changedFields.progressStatus) {
    out.push({
      field: 'progressStatus',
      label: changedFields.progressStatus.label || 'Physical progress status',
      from: changedFields.progressStatus.from,
      to: changedFields.progressStatus.to,
      fromDisplay: changedFields.progressStatus.fromDisplay ?? formatProgressStatus(changedFields.progressStatus.from),
      toDisplay: changedFields.progressStatus.toDisplay ?? formatProgressStatus(changedFields.progressStatus.to),
    });
  }
  if (changedFields.checklist) {
    for (const [id, entry] of Object.entries(changedFields.checklist)) {
      out.push({
        field: id,
        label: entry.label || id,
        from: entry.from,
        to: entry.to,
        fromDisplay: entry.fromDisplay ?? '—',
        toDisplay: entry.toDisplay ?? '—',
      });
    }
  }
  return out;
}

function computeWardChangesFromBaseline(baseline, current, structure) {
  if (!baseline) return [];
  const before = snapshotContent(baseline);
  const after = snapshotContent(current);
  const diff = diffSubmissionContent(before, after, structure);
  return wardChangesList(diff);
}

module.exports = {
  buildItemMap,
  snapshotContent,
  diffSubmissionContent,
  wardChangesList,
  computeWardChangesFromBaseline,
  formatProgressStatus,
};
