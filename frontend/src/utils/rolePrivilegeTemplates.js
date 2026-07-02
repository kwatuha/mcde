/**
 * Curated privilege bundles for common county / contractor roles.
 * Maps human-friendly templates to real privilege names in the database.
 */

export const ROLE_PRIVILEGE_TEMPLATES = [
  {
    id: 'contractor',
    label: 'Contractor (portal)',
    description: 'Submit payment requests, upload project files, and use the contractor dashboard on assigned projects only.',
    suggestedRoleName: 'Contractor',
    suggestedDescription: 'External contractor — portal access for payments, photos, and compliance files',
    privilegeNames: [
      'contractor.portal',
      'payment_request.create',
      'payment_request.read_own',
      'project.read',
      'document.create',
    ],
    suggestedLandingPath: '/contractor-dashboard',
    setupNotes: [
      'Name the role "Contractor" (or similar) so the contractor sidebar is shown automatically.',
      'Create a UI profile with landing page /contractor-dashboard, then assign it as this role\'s default UI profile.',
      'In Contractor Management, link the user account to the contractor record and assign projects.',
    ],
  },
  {
    id: 'resident_engineer',
    label: 'Resident Engineer',
    description: 'Engineer workspace: project registry, file compliance, BQ, payment certificates, and contractor payment review.',
    suggestedRoleName: 'Resident Engineer',
    suggestedDescription: 'Site engineer — scoped projects, compliance, and payment workflows',
    privilegeNames: [
      'project.read',
      'project.update',
      'project.file_checklist.read',
      'project.file_checklist.update',
      'payment_request.read_all',
      'payment_request.update',
      'document.read_all',
      'document.create',
      'approval_levels.read',
    ],
    suggestedUiProfileName: 'Projects Review',
    suggestedLandingPath: '/engineer-workspace',
    setupNotes: [
      'Create a UI profile with landing page /engineer-workspace and menus for projects + finance.',
      'Assign project scope (department / ward / explicit projects) so the engineer only sees their sites.',
    ],
  },
  {
    id: 'county_viewer',
    label: 'County viewer (read-only)',
    description: 'Dashboards and reports across the county without edit access.',
    suggestedRoleName: 'County Viewer',
    suggestedDescription: 'Read-only county-wide visibility',
    privilegeNames: [
      'project.read_all',
      'dashboard.view',
      'reports.view_all',
      'document.read_all',
    ],
    suggestedUiProfileName: 'County View Global',
  },
  {
    id: 'finance_reviewer',
    label: 'Finance reviewer',
    description: 'Review budgets, payment certificates, and finance dashboards.',
    suggestedRoleName: 'Finance Reviewer',
    suggestedDescription: 'Budget and payment certificate review',
    privilegeNames: [
      'budget.read',
      'project.read_all',
      'payment_request.read_all',
      'dashboard.view',
      'reports.view_all',
      'approval_levels.read',
    ],
    suggestedUiProfileName: 'Finance Review',
  },
  {
    id: 'workflow_approver',
    label: 'Workflow approver',
    description: 'Process pending approval steps (workflows, payment requests) without full admin access.',
    suggestedRoleName: 'Workflow Approver',
    suggestedDescription: 'Approves assigned workflow steps',
    privilegeNames: [
      'approval_levels.read',
      'payment_request.read_all',
      'payment_request.update',
      'project.read',
      'document.read_all',
    ],
    suggestedLandingPath: '/workflow-approvals',
    setupNotes: [
      'Add the user to the relevant approval level(s) under Approval Levels configuration.',
      'Optional UI profile landing page: /workflow-approvals',
    ],
  },
  {
    id: 'department_operator',
    label: 'Department operator',
    description: 'Day-to-day project entry and monitoring within a department scope.',
    suggestedRoleName: 'Department Operator',
    suggestedDescription: 'Department planning / procurement operations',
    privilegeNames: [
      'project.read',
      'project.update',
      'project.create',
      'document.create',
      'document.read_all',
      'dashboard.view',
    ],
    suggestedUiProfileName: 'Department Operations',
  },
];

const normalizePrivilegeName = (name) => String(name || '').trim().toLowerCase();

export function resolvePrivilegeIdsByName(privilegeNames, privileges = []) {
  const byName = new Map();
  for (const p of privileges) {
    const key = normalizePrivilegeName(p.privilegeName);
    if (key) byName.set(key, String(p.privilegeId));
  }

  const privilegeIds = [];
  const missingPrivileges = [];

  for (const name of privilegeNames) {
    const id = byName.get(normalizePrivilegeName(name));
    if (id) {
      privilegeIds.push(id);
    } else {
      missingPrivileges.push(name);
    }
  }

  return {
    privilegeIds: [...new Set(privilegeIds)],
    missingPrivileges,
  };
}

export function findUiProfileIdByName(uiProfiles = [], profileName) {
  if (!profileName) return '';
  const target = String(profileName).trim().toLowerCase();
  const match = uiProfiles.find(
    (p) => String(p.name || '').trim().toLowerCase() === target
  );
  return match ? String(match.id) : '';
}

/**
 * Apply a template to role form fields.
 * @param {object} template - entry from ROLE_PRIVILEGE_TEMPLATES
 * @param {object[]} privileges - loaded privilege rows
 * @param {object[]} uiProfiles - loaded UI profiles
 * @param {{ fillSuggestedFields?: boolean }} options
 */
export function applyRolePrivilegeTemplate(template, privileges = [], uiProfiles = [], options = {}) {
  const { fillSuggestedFields = true } = options;
  const { privilegeIds, missingPrivileges } = resolvePrivilegeIdsByName(
    template.privilegeNames || [],
    privileges
  );

  const uiProfileId = findUiProfileIdByName(uiProfiles, template.suggestedUiProfileName);

  return {
    privilegeIds,
    missingPrivileges,
    setupNotes: template.setupNotes || [],
    ...(fillSuggestedFields
      ? {
          roleName: template.suggestedRoleName || '',
          description: template.suggestedDescription || '',
          uiProfileId,
          suggestedLandingPath: template.suggestedLandingPath || '',
        }
      : {}),
  };
}

export function getRolePrivilegeTemplate(templateId) {
  return ROLE_PRIVILEGE_TEMPLATES.find((t) => t.id === templateId) || null;
}
