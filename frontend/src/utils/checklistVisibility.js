/** Client-side mirror of api/services/checklistAnswerUtils visibility helpers. */

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function normalizeCompare(value) {
  if (value === true || value === 'true') return 'yes';
  if (value === false || value === 'false') return 'no';
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

export function evaluateShowIfRule(rule, answers) {
  if (!rule?.itemId) return true;
  const op = rule.op || 'eq';
  const raw = answers?.[rule.itemId];

  if (op === 'empty') return isEmptyValue(raw);
  if (op === 'not_empty') return !isEmptyValue(raw);

  if (op === 'contains' || op === 'not_contains') {
    const needle = normalizeCompare(rule.value);
    const hay = Array.isArray(raw) ? raw.map(normalizeCompare) : [];
    const hit = hay.includes(needle);
    return op === 'contains' ? hit : !hit;
  }

  const left = normalizeCompare(raw);
  const list = Array.isArray(rule.values)
    ? rule.values.map(normalizeCompare)
    : rule.value !== undefined
      ? [normalizeCompare(rule.value)]
      : [];

  if (op === 'in') return list.length ? list.includes(left) : false;
  if (op === 'not_in') return list.length ? !list.includes(left) : true;
  if (op === 'neq') return list.length ? left !== list[0] : left !== '';
  return list.length ? left === list[0] : left !== '';
}

export function evaluateShowIfCondition(condition, answers) {
  if (!condition || typeof condition !== 'object') return true;
  if (Array.isArray(condition.all) && condition.all.length) {
    return condition.all.every((rule) => evaluateShowIfRule(rule, answers));
  }
  if (Array.isArray(condition.any) && condition.any.length) {
    return condition.any.some((rule) => evaluateShowIfRule(rule, answers));
  }
  return evaluateShowIfRule(condition, answers);
}

export function isItemVisible(item, answers) {
  if (!item?.showIf) return true;
  return evaluateShowIfCondition(item.showIf, answers);
}

export function flattenItems(structure) {
  const rows = [];
  for (const sec of structure?.sections || []) {
    for (const item of sec.items || []) {
      rows.push(item);
    }
  }
  return rows;
}

export function stripHiddenAnswers(structure, answers) {
  if (!answers || typeof answers !== 'object') return {};
  const next = { ...answers };
  for (const item of flattenItems(structure)) {
    if (!isItemVisible(item, next)) {
      delete next[item.id];
    }
  }
  return next;
}

export const SHOW_IF_OPS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'in', label: 'is one of' },
  { value: 'not_in', label: 'is not one of' },
  { value: 'contains', label: 'includes (multi-select)' },
  { value: 'not_contains', label: 'does not include (multi-select)' },
  { value: 'empty', label: 'is empty' },
  { value: 'not_empty', label: 'is not empty' },
];

export const SHOW_IF_MODES = [
  { value: 'single', label: 'Single condition' },
  { value: 'all', label: 'All match (AND)' },
  { value: 'any', label: 'Any match (OR)' },
];

export function hasShowIf(showIf) {
  if (!showIf || typeof showIf !== 'object') return false;
  if (showIf.itemId) return true;
  if (Array.isArray(showIf.all) && showIf.all.length) return true;
  if (Array.isArray(showIf.any) && showIf.any.length) return true;
  return false;
}

export function getShowIfMode(showIf) {
  if (!hasShowIf(showIf)) return 'single';
  if (Array.isArray(showIf.all) && showIf.all.length) return 'all';
  if (Array.isArray(showIf.any) && showIf.any.length) return 'any';
  return 'single';
}

export function defaultShowIfRule(priorItem) {
  if (!priorItem) return { itemId: '', op: 'eq', value: '' };
  return {
    itemId: priorItem.id,
    op: priorItem.type === 'yes_no' ? 'eq' : 'not_empty',
    value: priorItem.type === 'yes_no' ? 'no' : undefined,
  };
}

function serializeSingleRule(rule, valuesText = '') {
  if (!rule?.itemId) return null;
  const out = {
    itemId: rule.itemId,
    op: rule.op || 'eq',
  };
  const op = out.op;
  if (op === 'in' || op === 'not_in') {
    const values = Array.isArray(rule.values)
      ? rule.values
      : String(valuesText || rule.valuesText || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
    if (values.length) out.values = values;
  } else if (op !== 'empty' && op !== 'not_empty' && rule.value !== undefined && rule.value !== '') {
    out.value = rule.value;
  }
  return out;
}

export function serializeShowIf(showIf, showIfValuesText = '') {
  if (!hasShowIf(showIf)) return undefined;
  const mode = getShowIfMode(showIf);
  if (mode === 'all') {
    const all = (showIf.all || [])
      .map((rule, idx) =>
        serializeSingleRule(rule, rule.valuesText ?? showIf._allValuesText?.[idx] ?? '')
      )
      .filter(Boolean);
    return all.length ? { all } : undefined;
  }
  if (mode === 'any') {
    const any = (showIf.any || [])
      .map((rule, idx) =>
        serializeSingleRule(rule, rule.valuesText ?? showIf._anyValuesText?.[idx] ?? '')
      )
      .filter(Boolean);
    return any.length ? { any } : undefined;
  }
  return serializeSingleRule(showIf, showIfValuesText);
}

export function normalizeShowIfForEditor(showIf) {
  if (!showIf || typeof showIf !== 'object') return undefined;
  const mode = getShowIfMode(showIf);
  if (mode === 'all') {
    return {
      all: (showIf.all || []).map((rule) => ({
        ...rule,
        valuesText: Array.isArray(rule.values) ? rule.values.join(', ') : rule.valuesText || '',
      })),
    };
  }
  if (mode === 'any') {
    return {
      any: (showIf.any || []).map((rule) => ({
        ...rule,
        valuesText: Array.isArray(rule.values) ? rule.values.join(', ') : rule.valuesText || '',
      })),
    };
  }
  if (showIf.itemId) {
    return {
      ...showIf,
      valuesText: Array.isArray(showIf.values) ? showIf.values.join(', ') : '',
    };
  }
  return undefined;
}

export function priorItemsForIndex(sections, sectionIdx, itemIdx) {
  const prior = [];
  for (let si = 0; si < sections.length; si += 1) {
    const items = sections[si]?.items || [];
    const limit = si === sectionIdx ? itemIdx : items.length;
    for (let ii = 0; ii < limit; ii += 1) {
      const it = items[ii];
      if (it?.id && String(it.label || '').trim()) {
        prior.push(it);
      }
    }
  }
  return prior;
}

export function formSectionsToStructure(sections) {
  return {
    sections: (Array.isArray(sections) ? sections : []).map((sec) => ({
      id: sec.id,
      title: sec.title,
      items: (sec.items || []).map(({ optionsText, showIfValuesText, ...it }) => {
        const item = {
          id: it.id,
          label: it.label,
          type: it.type,
          required: !!it.required,
          ...(it.options?.length
            ? { options: it.options }
            : optionsText
              ? {
                  options: String(optionsText)
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                }
              : {}),
          ...(it.type === 'photo'
            ? {
                maxPhotos: it.maxPhotos ?? 1,
                requireGps: !!it.requireGps,
              }
            : {}),
          ...(it.type === 'project_milestones' || it.type === 'project_bq_items'
            ? { allowMultiple: !!it.allowMultiple }
            : {}),
        };
        const showIf = serializeShowIf(it.showIf, showIfValuesText);
        if (showIf) item.showIf = showIf;
        return item;
      }),
    })),
  };
}

/** Add required progress status field to monitoring checklist templates when missing. */
export function ensureMonitoringProgressField(sections, category) {
  if (category !== 'monitoring_checklist') return sections;
  const list = Array.isArray(sections) ? sections : [];
  const hasProgress = list.some((s) =>
    (s.items || []).some((it) => it.type === 'progress_status')
  );
  if (hasProgress) return list;

  const progressItem = {
    id: `progress_status_${Date.now()}`,
    label: 'Physical progress status',
    type: 'progress_status',
    required: true,
  };
  if (!list.length) {
    return [{ id: `sec-${Date.now()}`, title: 'Visit details', items: [progressItem] }];
  }
  return list.map((sec, idx) =>
    idx === 0
      ? { ...sec, items: [progressItem, ...(sec.items || [])] }
      : sec
  );
}

export function valueOptionsForShowIf(priorItem, op) {
  if (!priorItem) return [];
  if (op === 'empty' || op === 'not_empty') return [];
  if (priorItem.type === 'yes_no') return ['yes', 'no'];
  if (priorItem.type === 'progress_status') {
    return ['on_track', 'delayed', 'stalled', 'completed'];
  }
  if (priorItem.type === 'select' || priorItem.type === 'multi_select') {
    return Array.isArray(priorItem.options) ? priorItem.options : [];
  }
  return [];
}

export function opNeedsValue(op) {
  return op !== 'empty' && op !== 'not_empty';
}
