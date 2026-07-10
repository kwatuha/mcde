/** Resolve checklist option value/label whether stored as string or { value, label }. */
export function checklistOptionValue(opt: unknown): string {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object') {
    const o = opt as { value?: string; label?: string; id?: unknown };
    return String(o.value ?? o.label ?? o.id ?? '').trim();
  }
  return String(opt ?? '').trim();
}

export function checklistOptionLabel(opt: unknown): string {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object') {
    const o = opt as { label?: string; value?: string; id?: unknown };
    return String(o.label ?? o.value ?? o.id ?? '').trim();
  }
  return String(opt ?? '').trim();
}
