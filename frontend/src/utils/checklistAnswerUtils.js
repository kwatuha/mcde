/** Normalize multi-select answers from API/mobile into a string array for display and editing. */
export function multiSelectValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'object' && v != null) {
          return v.label ?? v.value ?? v.id;
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
    return Object.values(value)
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
  }
  return [];
}

export function checklistOptionValue(opt) {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object') {
    return String(opt.value ?? opt.label ?? opt.id ?? '').trim();
  }
  return String(opt ?? '').trim();
}

export function checklistOptionLabel(opt) {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object') {
    return String(opt.label ?? opt.value ?? opt.id ?? '').trim();
  }
  return String(opt ?? '').trim();
}

/** Coerce stored answers into the shape the checklist UI expects (esp. multi_select arrays). */
export function normalizeAnswersForDisplay(structure, answers) {
  if (!answers || typeof answers !== 'object') return {};
  const next = { ...answers };
  for (const sec of structure?.sections || []) {
    for (const item of sec.items || []) {
      if (item.type === 'multi_select') {
        next[item.id] = multiSelectValues(next[item.id]);
      }
    }
  }
  return next;
}
