const ALLOWED_TYPES = new Set([
  'yes_no',
  'text',
  'textarea',
  'number',
  'select',
  'multi_select',
  'photo',
  'location',
  'area_location',
  'user',
  'progress_status',
  'project_milestones',
  'project_bq_items',
  'indicator',
]);

const PROGRESS_STATUS_VALUES = ['on_track', 'delayed', 'stalled', 'completed'];

const PROJECT_LINKED_TYPES = new Set(['project_milestones', 'project_bq_items', 'indicator']);

const SHOW_IF_OPS = new Set([
  'eq',
  'neq',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'empty',
  'not_empty',
]);

function normalizeItemOptions(type, it) {
  if (type !== 'select' && type !== 'multi_select') return undefined;
  if (!Array.isArray(it?.options)) return undefined;
  const options = it.options.map((o) => String(o).trim()).filter(Boolean);
  return options.length ? options : undefined;
}

function normalizeSingleShowIfRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const itemId = String(raw.itemId || raw.field || '').trim();
  if (!itemId) return null;
  const opRaw = String(raw.op || raw.operator || 'eq').trim().toLowerCase();
  const op = SHOW_IF_OPS.has(opRaw) ? opRaw : 'eq';
  const out = { itemId, op };
  if (raw.value !== undefined && raw.value !== null && raw.value !== '') {
    out.value = raw.value;
  }
  if (Array.isArray(raw.values) && raw.values.length) {
    out.values = raw.values.map((v) => String(v));
  }
  return out;
}

function normalizeShowIf(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  if (Array.isArray(raw.all) && raw.all.length) {
    const all = raw.all.map(normalizeSingleShowIfRule).filter(Boolean);
    return all.length ? { all } : undefined;
  }
  if (Array.isArray(raw.any) && raw.any.length) {
    const any = raw.any.map(normalizeSingleShowIfRule).filter(Boolean);
    return any.length ? { any } : undefined;
  }
  return normalizeSingleShowIfRule(raw) || undefined;
}

function normalizeStructure(raw) {
  const sections = Array.isArray(raw?.sections) ? raw.sections : [];
  return {
    sections: sections
      .map((s, si) => {
        const sid = String(s?.id || `sec-${si}`).replace(/\s+/g, '_');
        const items = (Array.isArray(s?.items) ? s.items : [])
          .map((it, ii) => {
            const id = String(it?.id || `item-${si}-${ii}`).replace(/\s+/g, '_');
            const label = String(it?.label || '').trim();
            const type = ALLOWED_TYPES.has(it?.type) ? it.type : 'text';
            const required = !!it?.required;
            const options = normalizeItemOptions(type, it);
            const out = { id, label, type, required, ...(options?.length ? { options } : {}) };
            if (type === 'photo') {
              const maxPhotos = parseInt(String(it?.maxPhotos ?? 1), 10);
              out.maxPhotos = Number.isFinite(maxPhotos) && maxPhotos > 0 ? Math.min(maxPhotos, 10) : 1;
              out.requireGps = !!it?.requireGps;
            }
            if (PROJECT_LINKED_TYPES.has(type)) {
              out.allowMultiple = !!it?.allowMultiple;
            }
            const showIf = normalizeShowIf(it?.showIf);
            if (showIf) out.showIf = showIf;
            return out;
          })
          .filter((it) => it.label);
        return {
          id: sid,
          title: String(s?.title || '').trim() || `Section ${si + 1}`,
          items,
        };
      })
      .filter((s) => s.items.length),
  };
}

function readLatLng(value) {
  if (!value || typeof value !== 'object') return { lat: NaN, lng: NaN };
  const lat = Number(value.lat ?? value.latitude);
  const lng = Number(value.lng ?? value.longitude ?? value.lon ?? value.long);
  return { lat, lng };
}

function photoList(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.photos)) return value.photos;
  if (Array.isArray(value)) return value;
  return [];
}

function projectLinkedAnswerList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value.id != null) return [value];
  if (typeof value === 'number' || typeof value === 'string') {
    const id = Number(value);
    return Number.isFinite(id) ? [{ id }] : [];
  }
  return [];
}

function isEmptyAnswer(item, value) {
  if (value === undefined || value === null) return true;
  if (PROJECT_LINKED_TYPES.has(item.type)) {
    const entries = projectLinkedAnswerList(value);
    return entries.length === 0;
  }
  if (item.type === 'multi_select') return !Array.isArray(value) || value.length === 0;
  if (item.type === 'yes_no') return value !== 'yes' && value !== 'no';
  if (item.type === 'progress_status') {
    return !PROGRESS_STATUS_VALUES.includes(String(value || '').trim());
  }
  if (item.type === 'photo') {
    const photos = photoList(value);
    return photos.length === 0;
  }
  if (item.type === 'location') {
    const { lat, lng } = readLatLng(value);
    return !Number.isFinite(lat) || !Number.isFinite(lng);
  }
  if (item.type === 'area_location') {
    if (!value || typeof value !== 'object') return true;
    const v = value;
    return (
      !String(v.subcounty || '').trim()
      || !String(v.ward || '').trim()
      || !String(v.sublocation || '').trim()
      || !String(v.village || '').trim()
    );
  }
  if (item.type === 'user') {
    if (value == null || value === '') return true;
    if (typeof value === 'object') {
      return !String(value.displayName || value.username || '').trim() && value.userId == null;
    }
    return String(value).trim() === '';
  }
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

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

function evaluateShowIfRule(rule, answers) {
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

function evaluateShowIfCondition(condition, answers) {
  if (!condition || typeof condition !== 'object') return true;
  if (Array.isArray(condition.all) && condition.all.length) {
    return condition.all.every((rule) => evaluateShowIfRule(rule, answers));
  }
  if (Array.isArray(condition.any) && condition.any.length) {
    return condition.any.some((rule) => evaluateShowIfRule(rule, answers));
  }
  return evaluateShowIfRule(condition, answers);
}

function isItemVisible(item, answers) {
  if (!item?.showIf) return true;
  return evaluateShowIfCondition(item.showIf, answers);
}

function flattenItems(structure) {
  const rows = [];
  for (const sec of structure?.sections || []) {
    for (const item of sec.items || []) {
      rows.push(item);
    }
  }
  return rows;
}

function stripHiddenAnswers(structure, answers) {
  if (!answers || typeof answers !== 'object') return {};
  const next = { ...answers };
  for (const item of flattenItems(structure)) {
    if (!isItemVisible(item, next)) {
      delete next[item.id];
    }
  }
  return next;
}

function validateAnswers(structure, answers) {
  if (!answers || typeof answers !== 'object') return ['Answers must be an object.'];
  const missing = [];
  for (const sec of structure?.sections || []) {
    for (const it of sec.items || []) {
      if (!it.required) continue;
      if (!isItemVisible(it, answers)) continue;
      if (isEmptyAnswer(it, answers[it.id])) missing.push(it.label || it.id);
    }
  }
  return missing;
}

function formatAnswerDisplay(item, raw) {
  if (raw === undefined || raw === null || raw === '') return '—';
  if (item?.type === 'multi_select') {
    if (!Array.isArray(raw) || !raw.length) return '—';
    return raw.join(', ');
  }
  if (item?.type === 'yes_no') {
    if (raw === 'yes' || raw === true) return 'Yes';
    if (raw === 'no' || raw === false) return 'No';
    return String(raw);
  }
  if (item?.type === 'progress_status') {
    const v = String(raw || '').trim();
    if (!v) return '—';
    return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (item?.type === 'photo') {
    const photos = photoList(raw);
    if (!photos.length) return '—';
    return photos
      .map((p) => {
        const name = p.fileName || p.url || 'Photo';
        const geo =
          p.lat != null && p.lng != null
            ? ` (${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)})`
            : '';
        return `${name}${geo}`;
      })
      .join('; ');
  }
  if (item?.type === 'location') {
    const { lat, lng } = readLatLng(raw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
    const acc = raw?.accuracy != null ? ` ±${Math.round(Number(raw.accuracy))}m` : '';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}${acc}`;
  }
  if (item?.type === 'area_location') {
    if (!raw || typeof raw !== 'object') return '—';
    const parts = [raw.subcounty, raw.ward, raw.sublocation, raw.village].filter(Boolean);
    return parts.length ? parts.join(' → ') : '—';
  }
  if (item?.type === 'user') {
    if (raw == null || raw === '') return '—';
    if (typeof raw === 'object') {
      return raw.displayName || raw.username || raw.email || (raw.userId != null ? `User #${raw.userId}` : '—');
    }
    return String(raw);
  }
  if (PROJECT_LINKED_TYPES.has(item?.type)) {
    const entries = projectLinkedAnswerList(raw);
    if (!entries.length) return '—';
    return entries
      .map((e) => e.label || (e.id != null ? `#${e.id}` : ''))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

function extractProgressStatus(structure, answers) {
  const ans = answers && typeof answers === 'object' ? answers : {};
  for (const sec of structure?.sections || []) {
    for (const item of sec.items || []) {
      if (item.type === 'progress_status') {
        const v = String(ans[item.id] || '').trim();
        if (PROGRESS_STATUS_VALUES.includes(v)) return v;
      }
    }
  }
  const direct = String(ans.progress_status || ans.progressStatus || '').trim();
  return PROGRESS_STATUS_VALUES.includes(direct) ? direct : null;
}

module.exports = {
  ALLOWED_TYPES,
  PROJECT_LINKED_TYPES,
  SHOW_IF_OPS,
  PROGRESS_STATUS_VALUES,
  normalizeStructure,
  normalizeShowIf,
  isEmptyAnswer,
  isItemVisible,
  evaluateShowIfRule,
  evaluateShowIfCondition,
  stripHiddenAnswers,
  flattenItems,
  validateAnswers,
  formatAnswerDisplay,
  extractProgressStatus,
  photoList,
};
