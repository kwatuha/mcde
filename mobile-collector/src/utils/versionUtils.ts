/** Compare dotted version labels (e.g. 1.0.2 vs 1.0.1). */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) =>
    String(v || '')
      .trim()
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
