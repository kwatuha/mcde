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
    suggestedUiProfileName: 'Resident Engineer Review',
    suggestedLandingPath: '/resident-engineer-workspace',
    setupNotes: [
      'Assign a UI profile with landing page /resident-engineer-workspace as this role\'s default.',
      'Resident Engineer is step 1 of the certificate chain (before Chief Engineer and Co-Finance).',
      'Assign project scope (department / ward / explicit projects) so the engineer only sees their sites.',
    ],
  },
  {
    id: 'chief_engineer',
    label: 'Chief Engineer',
    description: 'Chief engineer workspace: second-step payment certificate approval after Resident Engineer, plus project registry and payment review.',
    suggestedRoleName: 'Chief Engineer',
    suggestedDescription: 'Chief engineer — certificate sign-off after resident engineer',
    privilegeNames: [
      'project.read',
      'project.read_all',
      'project.update',
      'project.file_checklist.read',
      'payment_request.read_all',
      'payment_request.update',
      'document.read_all',
      'document.create',
      'approval_levels.read',
    ],
    suggestedUiProfileName: 'Chief Engineer Review',
    suggestedLandingPath: '/chief-engineer-workspace',
    setupNotes: [
      'Assign a UI profile with landing page /chief-engineer-workspace as this role\'s default.',
      'In Approvals & workflows, step 2 for project_certificate must use the Chief Engineer role id.',
      'Resident Engineer → Chief Engineer → Co-Finance is the standard 3-step certificate chain.',
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
    id: 'village_administrator',
    label: 'Village Administrator (M&E)',
    description: 'Sublocation monitoring & evaluation: village monitoring reports, field visits, progress photos, and project documents for scoped projects.',
    suggestedRoleName: 'Village Administrator',
    suggestedDescription: 'Village-level M&E — evidence upload and ward submission workflow',
    privilegeNames: [
      'monitoring_report.read',
      'monitoring_report.create',
      'monitoring_report.submit',
      'project.read',
      'document.create',
      'project_monitoring.read',
      'project_monitoring.create',
      'project_monitoring.update',
    ],
    suggestedUiProfileName: 'Village M&E',
    suggestedLandingPath: '/village-workspace',
    setupNotes: [
      'Assign the Village M&E UI profile as this role\'s default UI profile (landing /village-workspace).',
      'Set organization / project scope to the village or sublocation so only local projects appear.',
      'Village admins submit monitoring reports to Ward Administrators for review and upward approval.',
      'Use checklist template "Village Field Monitoring Visit" (seed migration 20260711) — a short field form, not the full county reference checklist.',
      'Upload progress photos and documents from Project Registry → project Sites tab, or Project Documents.',
      'RRI Programmes (Monitoring menu or workspace quick action) lists programmes covering their ward or linked local projects — read-only.',
    ],
  },
  {
    id: 'ward_administrator',
    label: 'Ward Administrator (M&E)',
    description: 'Ward-level monitoring review: revise village monitoring reports, track progress, and forward to sub-county.',
    suggestedRoleName: 'Ward Administrator',
    suggestedDescription: 'Ward M&E — village monitoring review and upward workflow',
    privilegeNames: [
      'monitoring_report.read',
      'monitoring_report.ward_review',
      'project.read_all',
      'project_monitoring.read',
      'document.read_all',
    ],
    suggestedUiProfileName: 'Ward M&E',
    suggestedLandingPath: '/ward-workspace',
    setupNotes: [
      'Assign the Ward M&E UI profile as this role\'s default UI profile (landing /ward-workspace).',
      'Set organization scope to the ward so village submissions in that ward appear in the ward review queue.',
      'Use Monitoring reports → Ward review queue to revise checklists and forward to sub-county.',
      'Apply migration 20260712_ward_administrator_profile.sql if the Ward M&E profile is not yet seeded.',
      'RRI Programmes (Monitoring menu or workspace quick action) lists programmes in your ward — read-only.',
    ],
  },
  {
    id: 'sub_county_administrator',
    label: 'Sub-County Administrator (M&E)',
    description: 'Sub-county monitoring review: read ward-forwarded reports, return to ward with comments, or forward to chief officer.',
    suggestedRoleName: 'Sub-County Administrator',
    suggestedDescription: 'Sub-county M&E — monitoring review without editing checklist answers',
    privilegeNames: [
      'monitoring_report.read',
      'monitoring_report.subcounty_review',
      'project.read_all',
      'project_monitoring.read',
      'document.read_all',
    ],
    suggestedUiProfileName: 'Sub-County M&E',
    suggestedLandingPath: '/subcounty-workspace',
    setupNotes: [
      'Assign the Sub-County M&E UI profile as this role\'s default UI profile (landing /subcounty-workspace).',
      'Set organization scope to the sub-county so ward-forwarded reports in that sub-county appear in the review queue.',
      'Sub-county admins do not edit checklist answers — return to ward with comments or forward to chief when satisfied.',
      'Apply migration 20260714_subcounty_administrator_profile.sql if the Sub-County M&E profile is not yet seeded.',
      'RRI Programmes (Monitoring menu or workspace quick action) lists programmes in your sub-county — read-only.',
    ],
  },
  {
    id: 'department_chief_officer',
    label: 'Department Chief Officer (M&E)',
    description: 'Department chief monitoring approval: read sub-county-forwarded reports and approve to publish projects to the citizen dashboard.',
    suggestedRoleName: 'Department Chief Officer',
    suggestedDescription: 'Department chief M&E — final approval without editing checklist answers',
    privilegeNames: [
      'monitoring_report.read',
      'monitoring_report.chief_approve',
      'project.read_all',
      'project_monitoring.read',
      'document.read_all',
    ],
    suggestedUiProfileName: 'Department Chief M&E',
    suggestedLandingPath: '/chief-workspace',
    setupNotes: [
      'Assign the Department Chief M&E UI profile as this role\'s default UI profile (landing /chief-workspace).',
      'Set organization scope to the department so sub-county-forwarded reports in that department appear in the chief approval queue.',
      'Chief officers do not edit checklist answers — review evidence and approve to publish the linked project.',
      'Apply migration 20260715_department_chief_administrator_profile.sql if the Department Chief M&E profile is not yet seeded.',
    ],
  },
  {
    id: 'sector_me_champion',
    label: 'Sector M&E Champion',
    description: 'Sector-level monitoring oversight: view reports for all departments mapped to the assigned sector via project access scope.',
    suggestedRoleName: 'Sector M&E Champion',
    suggestedDescription: 'Sector M&E champion — read-only monitoring reports across sector departments',
    privilegeNames: [
      'monitoring_report.read',
      'project.read',
      'project_monitoring.read',
      'document.read_all',
      'reports.view_all',
    ],
    suggestedUiProfileName: 'Sector M&E Champion',
    suggestedLandingPath: '/sector-me-workspace',
    setupNotes: [
      'Assign the Sector M&E Champion UI profile (landing /sector-me-workspace).',
      'In User Management → Project access, set scope type Sector (e.g. Public Administration) — not individual departments.',
      'Ensure department-to-sector mappings are configured under Sectors so projects roll up correctly.',
      'Apply migration 20260716_sector_me_champion_profile.sql if the UI profile is not yet seeded.',
    ],
  },
  {
    id: 'co_finance_officer',
    label: 'Co-Finance Officer',
    description: 'County co-finance workspace: final payment certificate approval after Chief Engineer, plus payment requests, projects, and finance tools.',
    suggestedRoleName: 'Co-Finance Officer',
    suggestedDescription: 'County finance — certificate sign-off after engineer chain',
    privilegeNames: [
      'budget.read',
      'project.read_all',
      'payment_request.read_all',
      'payment_request.update',
      'document.read_all',
      'approval_levels.read',
      'dashboard.view',
      'reports.view_all',
    ],
    suggestedUiProfileName: 'Finance Review',
    suggestedLandingPath: '/co-finance-workspace',
    setupNotes: [
      'Create a UI profile with landing page /co-finance-workspace and assign it as this role\'s default UI profile.',
      'Configure a 3-step certificate workflow: Resident Engineer → Chief Engineer → Co-Finance (project_certificate entity type).',
      'Use Clone & deactivate previous on Approvals & workflows when updating step order on an in-use definition.',
    ],
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
