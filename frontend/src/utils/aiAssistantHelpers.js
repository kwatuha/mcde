const DEFAULT_STARTERS = [
  'Summarize projects I can access by status.',
  'Which projects are stalled or need attention?',
  'Summarize CIDP and ADP linkage for my accessible projects.',
];

export function getAIStarterMessages(context = {}) {
  const path = String(context.path || '').split('?')[0];
  const pageType = context.pageType || '';

  if (pageType === 'project-details' || /\/projects\/\d+/.test(path)) {
    const name = context.projectName ? ` for ${context.projectName}` : '';
    return [
      `Summarize this project${name}: status, budget, and progress.`,
      'What are the CIDP and ADP linkages for this project?',
      'What monitoring risks or implementation gaps should I address?',
    ];
  }

  if (pageType === 'budget-management' || path.includes('/budget-management')) {
    if (context.budgetId) {
      return [
        `Summarize this budget (${context.budgetName || 'current container'}).`,
        'Which ADP wishlist items are not yet in this budget?',
        'Compare budget total to linked ADP planned costs.',
      ];
    }
    return [
      'How do I create a budget from the ADP wishlist?',
      'Summarize ADP projects that are not yet budgeted.',
      'Which budgets are linked to ADP plans?',
    ];
  }

  if (pageType === 'adp-implementation' || path.includes('/planning/adp-implementation')) {
    const plan = context.adpPlanName || context.adpFinancialYear || 'the current ADP plan';
    return [
      `Summarize ADP implementation for ${plan}.`,
      'Which ADP projects are not yet budgeted or linked to registry projects?',
      'Show sectors with the largest ADP implementation gaps.',
    ];
  }

  if (path.includes('/finance/payment-list') || path.includes('/finance-dashboard')) {
    return [
      'Summarize payment absorption for projects I can access.',
      'Create a well formatted finance report from this dashboard.',
      'Which projects have low paid-to-budget ratios?',
    ];
  }

  if (pageType === 'project-finance-overview' || path.includes('/project-finance-overview')) {
    return [
      'Summarize finance health for the projects shown on this screen.',
      'Which projects have the largest pending bills or low absorption?',
      'Compare budget, paid, certified, and partner funding totals.',
    ];
  }

  if (pageType === 'pending-bills-report' || path.includes('/pending-bills-report')) {
    return [
      'Summarize pending bills for the filtered projects.',
      'Which departments have the highest outstanding pending amounts?',
      'Which projects should be prioritized for payment follow-up?',
    ];
  }

  if (pageType === 'status-report' || path.includes('/status-report')) {
    return [
      'Summarize this status report by project status and location.',
      'Which filtered projects are stalled or under-performing?',
      'Highlight wards or departments with the most budget at risk.',
    ];
  }

  if (pageType === 'project-monitoring' || path.includes('/monitoring/project-monitoring')) {
    return [
      'Summarize monitoring records and warning levels on this screen.',
      'Which projects have high-risk monitoring observations?',
      'What follow-up actions are suggested from recent monitoring data?',
    ];
  }

  if (pageType === 'project-registry' || (path.includes('/projects') && !/\/projects\/\d+/.test(path))) {
    return [
      'Summarize my accessible projects by status and location.',
      'Which wards have the most stalled projects?',
      'List top budget projects that need monitoring attention.',
    ];
  }

  return DEFAULT_STARTERS;
}

const REPORT_INTENT_PATTERN = /\b(well[- ]formatted|formatted|professional|official|downloadable|printable)\s+(report|document)\b|\b(generate|create|prepare|write|draft|produce|export|download|make|build)\b[\s\S]{0,48}\b(report|document)\b|\b(report|document)\b[\s\S]{0,40}\b(word|pdf|docx|download|formatted)\b|\b(word|pdf|docx)\b[\s\S]{0,24}\b(report|document)\b/i;

export const REPORT_TYPE_OPTIONS = [
  'Project Status Report',
  'Finance Summary Report',
  'CIDP Linkage Report',
  'Monitoring Summary Report',
  'General M&E Report',
];

/** True when the user is asking for a downloadable formatted report, not just a chat answer. */
export function detectReportIntent(message = '') {
  return REPORT_INTENT_PATTERN.test(String(message || '').trim());
}

export function inferReportType(message = '', context = {}) {
  const text = `${message} ${context.pageType || ''} ${context.path || ''} ${context.title || ''}`.toLowerCase();

  if (
    /\bfinance|financial|payment|absorption|disbursed|paid|pending bill|funding|budget dashboard\b/.test(text)
    || ['finance-dashboard', 'payment-list', 'project-finance-overview', 'pending-bills-report'].includes(context.pageType)
    || /finance-dashboard|payment-list|project-finance-overview|pending-bills/.test(context.path || '')
  ) {
    return 'Finance Summary Report';
  }

  if (
    /\bmonitor|monitoring|warning level|observation|indicator|evidence\b/.test(text)
    || context.pageType === 'project-monitoring'
    || /monitoring/.test(context.path || '')
  ) {
    return 'Monitoring Summary Report';
  }

  if (
    /\bcidp|adp|linkage|programme|wishlist|annual development\b/.test(text)
    || ['adp-implementation', 'budget-management'].includes(context.pageType)
    || /adp-implementation|budget-management/.test(context.path || '')
  ) {
    return 'CIDP Linkage Report';
  }

  if (
    /\bproject status|stalled|ongoing|completed|registry|status report\b/.test(text)
    || ['project-details', 'status-report', 'project-registry'].includes(context.pageType)
    || /\/projects\/\d+|status-report/.test(context.path || '')
  ) {
    return 'Project Status Report';
  }

  return 'General M&E Report';
}

export function detectReportOutputFormat(message = '') {
  const text = String(message || '').toLowerCase();
  if (/\bpdf\b/.test(text) && !/\bword\b|\bdocx\b/.test(text)) return 'pdf';
  if (/\bword\b|\bdocx\b/.test(text) && !/\bpdf\b/.test(text)) return 'docx';
  return 'docx';
}

export function buildReportPromptFromChat(userMessage = '', pageContext = {}) {
  const pageLabel = pageContext.title
    || pageContext.pageType?.replace(/-/g, ' ')
    || pageContext.path
    || 'the current screen';
  return [
    String(userMessage || '').trim(),
    `Use live data for ${pageLabel}.`,
    'Include executive summary, key findings, tables where useful, risks or gaps, and actionable recommendations.',
  ].filter(Boolean).join(' ');
}

export const DATA_SOURCE_LABELS = {
  pageContextText: 'Current screen',
  projectSummary: 'Project totals',
  statusBreakdown: 'Status breakdown',
  matchingProjects: 'Matching projects',
  stalledProjects: 'Stalled projects',
  locationBreakdown: 'Location breakdown',
  projectDetail: 'Project detail',
  cidpSummary: 'CIDP linkage',
  adpSummary: 'ADP summary',
  adpGaps: 'ADP gaps',
  budgetDetail: 'Budget detail',
  monitoringHighlights: 'Monitoring highlights',
};

export function formatDataSourceLabel(sourceKey) {
  return DATA_SOURCE_LABELS[sourceKey] || String(sourceKey || '').replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export function formatAssistantSections(content = '') {
  const text = String(content || '').trim();
  if (!text) return [{ type: 'paragraph', text: '' }];

  const parts = text.split(/\n(?=##\s+)/);
  if (parts.length === 1) {
    return text.split(/\n{2,}/).filter(Boolean).map((block) => ({ type: 'paragraph', text: block.trim() }));
  }

  return parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^##\s+(.+?)\n([\s\S]*)$/);
    if (!match) return { type: 'paragraph', text: trimmed };
    return {
      type: 'section',
      title: match[1].trim(),
      text: match[2].trim(),
    };
  }).filter(Boolean);
}
