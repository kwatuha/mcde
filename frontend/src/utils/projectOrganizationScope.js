import { isSuperAdminUser } from './roleUtils';

const key = (value) => String(value ?? '').trim().toLowerCase();
const tokenKey = (value) => key(value).replace(/[^a-z0-9]+/g, ' ').trim();
const STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'of',
  'state',
  'department',
  'ministry',
  'county',
  'government',
  'development',
  'services',
  'service',
  'directorate',
  'planning',
  'management',
  'administration',
]);

const meaningfulTokens = (value) =>
  tokenKey(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

const projectOrgValues = (project) => ({
  ministry: key(project?.departmentName ?? project?.department ?? project?.ministry),
  stateDepartment: key(project?.stateDepartment ?? project?.state_department ?? project?.sectionName),
  implementingAgency: key(project?.implementingAgency ?? project?.implementing_agency ?? project?.directorate),
});

const hasTokenOverlap = (scopeValue, projectValues) => {
  const tokens = meaningfulTokens(scopeValue);
  if (tokens.length === 0) return false;
  const haystack = projectValues.map(tokenKey).join(' ');
  return tokens.some((token) => haystack.includes(token));
};

export function buildProjectOrganizationScopeMeta(user) {
  const projectScopes = Array.isArray(user?.projectScopes) ? user.projectScopes : [];
  const hasExplicitProjectScope = projectScopes.some((scope) => {
    const scopeType = String(scope?.scopeType || scope?.scope_type || '').trim().toUpperCase();
    return ['ALL_DEPARTMENTS', 'SECTOR', 'DEPARTMENT', 'SUBCOUNTY', 'WARD'].includes(scopeType);
  });

  if (hasExplicitProjectScope) {
    return { level: 'all', allowedMinistries: null, allowedPairs: null, allowedProjectDepartments: null };
  }

  const scopes = Array.isArray(user?.organizationScopes) ? user.organizationScopes : [];
  const normalized = scopes
    .map((s) => ({
      scopeType: String(s?.scopeType || s?.scope_type || '').trim().toUpperCase(),
      ministry: key(s?.ministry),
      stateDepartment: key(s?.stateDepartment ?? s?.state_department),
    }))
    .filter((s) => s.scopeType);

  const hasAllDepartmentsScope =
    isSuperAdminUser(user) ||
    normalized.some(
      (s) =>
        s.scopeType === 'ALL_MINISTRIES' ||
        (s.scopeType === 'MINISTRY_ALL' && (s.ministry === '*' || s.ministry === 'all'))
    );

  if (hasAllDepartmentsScope) {
    return { level: 'all', allowedMinistries: null, allowedPairs: null, allowedProjectDepartments: null };
  }

  const ministryScopes = normalized.filter((s) => s.scopeType === 'MINISTRY_ALL' && s.ministry);
  if (ministryScopes.length > 0) {
    return {
      level: 'ministry',
      allowedMinistries: new Set(ministryScopes.map((s) => s.ministry)),
      ministryScopes,
      allowedPairs: null,
      allowedProjectDepartments: null,
    };
  }

  const stateDeptScopes = normalized.filter((s) => s.scopeType === 'STATE_DEPARTMENT_ALL' && s.stateDepartment);
  if (stateDeptScopes.length > 0) {
    return {
      level: 'state_department',
      allowedMinistries: null,
      stateDeptScopes,
      allowedPairs: new Set(stateDeptScopes.map((s) => `${s.ministry}|${s.stateDepartment}`)),
      // County project rows expose the selected department as departmentName/stateDepartment.
      allowedProjectDepartments: new Set(stateDeptScopes.map((s) => s.stateDepartment)),
    };
  }

  const profileMinistry = key(user?.ministry ?? user?.departmentName ?? user?.department);
  const profileStateDepartment = key(
    user?.stateDepartment ?? user?.state_department ?? user?.sectionName ?? user?.directorate
  );
  if (profileStateDepartment) {
    const profileScope = {
      scopeType: 'STATE_DEPARTMENT_ALL',
      ministry: profileMinistry,
      stateDepartment: profileStateDepartment,
    };
    return {
      level: 'state_department',
      allowedMinistries: null,
      stateDeptScopes: [profileScope],
      allowedPairs: new Set([`${profileMinistry}|${profileStateDepartment}`]),
      allowedProjectDepartments: new Set([profileStateDepartment]),
    };
  }

  return { level: 'all', allowedMinistries: null, allowedPairs: null, allowedProjectDepartments: null };
}

export function filterProjectsByOrganizationScope(projects, scopeMeta) {
  const rows = Array.isArray(projects) ? projects : [];
  if (!scopeMeta || scopeMeta.level === 'all') return rows;

  if (scopeMeta.level === 'ministry') {
    const scoped = rows.filter((project) => {
      const values = projectOrgValues(project);
      return (
        scopeMeta.allowedMinistries?.has(values.ministry) ||
        scopeMeta.ministryScopes?.some((scope) =>
          hasTokenOverlap(scope.ministry, [values.ministry, values.stateDepartment, values.implementingAgency])
        )
      );
    });
    return scoped.length > 0 ? scoped : rows;
  }

  if (scopeMeta.level === 'state_department') {
    return rows.filter((project) => {
      const { ministry, stateDepartment, implementingAgency } = projectOrgValues(project);
      return (
        scopeMeta.allowedPairs?.has(`${ministry}|${stateDepartment}`) ||
        scopeMeta.allowedProjectDepartments?.has(ministry) ||
        scopeMeta.allowedProjectDepartments?.has(stateDepartment) ||
        scopeMeta.allowedProjectDepartments?.has(implementingAgency) ||
        scopeMeta.stateDeptScopes?.some(
          (scope) =>
            hasTokenOverlap(scope.stateDepartment, [ministry, stateDepartment, implementingAgency]) ||
            hasTokenOverlap(scope.ministry, [ministry, stateDepartment, implementingAgency])
        )
      );
    });
  }

  return rows;
}
