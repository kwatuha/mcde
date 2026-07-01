import { ChecklistItem, TemplateStructure } from '../types/dataCollection';

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

function normalizeCompare(value: unknown): string {
  if (value === true || value === 'true') return 'yes';
  if (value === false || value === 'false') return 'no';
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

export function evaluateShowIfRule(
  rule: { itemId: string; op?: string; value?: unknown; values?: string[] },
  answers: Record<string, unknown>
): boolean {
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

export function evaluateShowIfCondition(
  condition: ChecklistItem['showIf'],
  answers: Record<string, unknown>
): boolean {
  if (!condition || typeof condition !== 'object') return true;
  if (Array.isArray(condition.all) && condition.all.length) {
    return condition.all.every((rule) => evaluateShowIfRule(rule, answers));
  }
  if (Array.isArray(condition.any) && condition.any.length) {
    return condition.any.some((rule) => evaluateShowIfRule(rule, answers));
  }
  return evaluateShowIfRule(condition as { itemId: string; op?: string; value?: unknown; values?: string[] }, answers);
}

export function isItemVisible(item: ChecklistItem, answers: Record<string, unknown>): boolean {
  if (!item?.showIf) return true;
  return evaluateShowIfCondition(item.showIf, answers);
}

export function flattenItems(structure: TemplateStructure): ChecklistItem[] {
  const rows: ChecklistItem[] = [];
  for (const sec of structure?.sections || []) {
    for (const item of sec.items || []) {
      rows.push(item);
    }
  }
  return rows;
}

export function stripHiddenAnswers(
  structure: TemplateStructure,
  answers: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...answers };
  for (const item of flattenItems(structure)) {
    if (!isItemVisible(item, next)) {
      delete next[item.id];
    }
  }
  return next;
}
