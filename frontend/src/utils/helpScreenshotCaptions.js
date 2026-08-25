/** Captions for Help & Support /help-screenshots assets (keep in sync with docs/manual-screenshots). */

export const HELP_SCREENSHOT_CAPTIONS = {
  '01-login': 'Login page',
  '02-personal-dashboard': 'Personal Dashboard (full ribbon)',
  '03-village-workspace': 'Village M&E Workspace',
  '03-ward-review-queue': 'Ward M&E — Ward review queue',
  '03-subcounty-workspace': 'Sub-County M&E Workspace',
  '03-chief-approval-queue': 'Department Chief M&E — Chief approval queue',
  '03-sector-me-workspace': 'Sector M&E Champions Workspace',
  '03-resident-engineer-workspace': 'Resident Engineer Workspace',
  '03-chief-engineer-workspace': 'Chief Engineer Workspace',
  '03-co-finance-workspace': 'Co-Finance Workspace',
  '03-contractor-dashboard': 'Contractor Dashboard',
  '03-summary-statistics': 'Summary Statistics (leadership landing)',
  'certificate-step-resident': 'Payment certificate — Resident Engineer approval (step 1)',
  'certificate-step-chief-engineer': 'Payment certificate — Chief Engineer approval (step 2)',
  'certificate-step-co-finance': 'Payment certificate — Co-Finance approval (step 3)',
  'verify-certificate-qr': 'Finance → Verify Certificate (QR / certificate number)',
  'ai-assistant-sparkle': 'AI Assistant (sparkle button)',
  'reports-hub': 'Reports hub',
  'mobile-app-download': 'CIMES Mobile download page',
  'regional-reports': 'Regional Breakdown Dashboard — sub-county / ward distribution',
  'project-gis-map': 'Project GIS Map — locations and coordinate quality',
  'projects-registry': 'Projects Registry',
  'project-details': 'Project details (single project hub)',
  'procurement-budget-items': 'Budget Procurement Intake — budget item to project',
  'project-scope-setup': 'Setup project scope & costs (planned BQ)',
  'quotation-entry': 'Contracted quotation vs planned',
  'rri-programmes': 'RRI Programmes',
  'my-tasks': 'My Tasks — escalations and workflow approvals',
  'project-evaluation': 'Project Evaluation — baseline, achieved, result level, reporting period',
  'cidp-programme-progress': 'CIDP Programme Progress — delivery and impact scorecard',
  'adp-programme-progress': 'ADP Programme Progress — delivery and impact scorecard',
  'planning-indicators': 'Planning Indicators & KPIs — result level (output / outcome / impact)',
  'beneficiary-outcome': 'Beneficiary Registry — outcome status',
  'village-community-impact': 'Village Field Monitoring — community benefit & access questions',
};

export function helpScreenshotSrc(stem) {
  return `/help-screenshots/${stem}.png`;
}

export function helpScreenshotCaption(stem) {
  return HELP_SCREENSHOT_CAPTIONS[stem] || stem.replace(/-/g, ' ');
}
