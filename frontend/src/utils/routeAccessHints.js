/**
 * Client-side privilege hints for deep links (e.g. dashboard workflow rows).
 * Used before navigation so users see what to add to their role instead of
 * being bounced by layout logic or landing on a useless page.
 *
 * If no rule matches, navigation is allowed (unknown routes are not blocked here).
 */

/**
 * @param {(priv: string) => boolean} hasPrivilege
 * @returns {{ ok: boolean, missing: string[], title: string, detail: string }}
 */
export function getAccessCheckForAppPath(fullPath, hasPrivilege) {
  if (typeof fullPath !== 'string' || !fullPath.trim()) {
    return { ok: true, missing: [], title: '', detail: '' };
  }
  const pathOnly = fullPath.split('?')[0].split('#')[0] || '';

  const rules = [
    {
      test: (p) => p.startsWith('/finance/payment-certificates'),
      required: ['document.read_all'],
      title: 'Payment certificates',
      detail:
        'The finance payment certificates list and its API require document.read_all. Add this privilege to your role (role_privileges), then refresh or log in again.',
    },
    {
      test: (p) => p === '/strategic-planning' || p.startsWith('/strategic-planning/'),
      required: ['strategic_plan.read_all'],
      title: 'Strategic planning (CIDP)',
      detail:
        'The strategic planning screens load plans only when your role has strategic_plan.read_all. Add it to your role if you should open this link.',
    },
    {
      test: (p) => p === '/planning/indicators',
      required: ['strategic_plan.read_all'],
      title: 'Planning KPIs, indicators & measurement types',
      detail:
        'Measurement types, KPIs, and indicators require strategic_plan.read_all (same as CIDP). Add it to your role if you should open this link.',
    },
  ];

  for (const rule of rules) {
    if (!rule.test(pathOnly)) continue;
    const missing = rule.required.filter((priv) => !hasPrivilege(priv));
    return {
      ok: missing.length === 0,
      missing,
      title: rule.title,
      detail: rule.detail,
      path: pathOnly,
    };
  }

  return { ok: true, missing: [], title: '', detail: '', path: pathOnly };
}
