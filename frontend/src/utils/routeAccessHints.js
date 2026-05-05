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
    {
      test: (p) => p === '/planning/project-activities',
      required: ['strategic_plan.read_all'],
      title: 'Planning project activities',
      detail:
        'Project activities require strategic_plan.read_all (same as indicators). Add it to your role if you should open this link.',
    },
    {
      test: (p) => p === '/planning/project-risks',
      required: ['strategic_plan.read_all'],
      title: 'Planning project risks',
      detail:
        'Project risks require strategic_plan.read_all (same as indicators). Add it to your role if you should open this link.',
    },
    {
      test: (p) => p === '/projects/status',
      requiredAny: ['project.read_all', 'project.update'],
      title: 'Project status',
      detail:
        'Project status listing and editing requires project.read_all or project.update. Add one of these privileges to your role if you should open this link.',
    },
    {
      test: (p) => p === '/projects/planning-activity-links' || p === '/projects/planning-risk-links',
      requiredAny: ['project.read_all', 'strategic_plan.read_all'],
      title: 'Project ↔ Planning catalog links',
      detail:
        'Linking catalog activities or risks to projects requires project.read_all or strategic_plan.read_all. Add one of these to your role if you should open this link.',
    },
  ];

  for (const rule of rules) {
    if (!rule.test(pathOnly)) continue;
    if (Array.isArray(rule.requiredAny) && rule.requiredAny.length > 0) {
      const ok = rule.requiredAny.some((priv) => hasPrivilege(priv));
      return {
        ok,
        missing: ok ? [] : rule.requiredAny,
        title: rule.title,
        detail: rule.detail,
        path: pathOnly,
      };
    }
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
