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
        `Summarize this budget (${context.budgetName || 'current department budget'}).`,
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

  if (path.includes('/operations-dashboard')) {
    return [
      'Summarize operational delivery metrics on this dashboard.',
      'Which departments or projects need operational attention?',
      'Create a well formatted operations report from this dashboard.',
    ];
  }

  if (path.includes('/project-by-status-dashboard')) {
    return [
      'Summarize projects by status on this dashboard.',
      'Which statuses have the most budget at risk?',
      'Create a well formatted project status report from this dashboard.',
    ];
  }

  if (path.includes('/jobs-dashboard')) {
    return [
      'Summarize jobs and impact indicators on this dashboard.',
      'Which projects contribute most to employment impact?',
      'Create a well formatted impact report from this dashboard.',
    ];
  }

  if (path.includes('/regional-reports') || path.includes('/regional-breakdown')) {
    return [
      'Summarize regional distribution of projects and budgets.',
      'Which wards have the most stalled projects?',
      'Create a well formatted regional report from this dashboard.',
    ];
  }

  if (path.includes('/summary-statistics')) {
    return [
      'Summarize county-wide statistics shown on this dashboard.',
      'What are the main trends and attention areas?',
      'Create a well formatted M&E summary report from this dashboard.',
    ];
  }

  if (path.includes('/reports-hub')) {
    return [
      'Which built-in report should I use for my question?',
      'How do built-in reports differ from AI professional reports?',
      'Summarize reports available for my role.',
    ];
  }

  if (path.includes('/verify-certificate')) {
    return [
      'How do I verify a payment certificate?',
      'What does the QR code on a certificate PDF do?',
      'Where do staff create payment certificates?',
    ];
  }

  if (path.includes('/data-collection-tools') || path.includes('/mobile-app')) {
    return [
      'How do I use checklists and the mobile field collector?',
      'How do field staff sync checklists offline?',
      'Where do I download the Android collector app?',
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
    /\boperations|operational delivery|operations dashboard\b/.test(text)
    || /operations-dashboard/.test(context.path || '')
  ) {
    return 'General M&E Report';
  }

  if (
    /\bregional|ward breakdown|subcounty|regional breakdown\b/.test(text)
    || /regional-reports|regional-breakdown/.test(context.path || '')
  ) {
    return 'General M&E Report';
  }

  if (
    /\bjobs|impact|employment|beneficiar\b/.test(text)
    || /jobs-dashboard/.test(context.path || '')
  ) {
    return 'General M&E Report';
  }

  if (
    /\bsummary statistics|county-wide|executive summary\b/.test(text)
    || /summary-statistics/.test(context.path || '')
  ) {
    return 'General M&E Report';
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
  helpManual: 'Help manual',
};

export function formatDataSourceLabel(sourceKey) {
  return DATA_SOURCE_LABELS[sourceKey] || String(sourceKey || '').replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export function formatAssistantSections(content = '') {
  const text = String(content || '').trim();
  if (!text) return [{ type: 'paragraph', blocks: parseAssistantBlocks('') }];

  const parts = text.split(/\n(?=##\s+)/);
  if (parts.length === 1) {
    return [{ type: 'paragraph', blocks: parseAssistantBlocks(text) }];
  }

  return parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^##\s+(.+?)\n([\s\S]*)$/);
    if (!match) return { type: 'paragraph', blocks: parseAssistantBlocks(trimmed) };
    return {
      type: 'section',
      title: match[1].trim(),
      blocks: parseAssistantBlocks(match[2].trim()),
    };
  }).filter(Boolean);
}

/** Split section body into paragraphs and bullet/numbered lists. */
export function parseAssistantBlocks(text = '') {
  const lines = String(text).split('\n');
  const blocks = [];
  let listItems = [];
  let listOrdered = false;
  let paragraphLines = [];

  const flushParagraph = () => {
    const joined = paragraphLines.join('\n').trim();
    if (joined) blocks.push({ type: 'paragraph', text: joined });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length) {
      blocks.push({
        type: listOrdered ? 'ordered-list' : 'bullet-list',
        items: [...listItems],
      });
      listItems = [];
      listOrdered = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.+)/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)/);

    if (bullet) {
      flushParagraph();
      if (listOrdered && listItems.length) flushList();
      listItems.push(bullet[1]);
    } else if (numbered) {
      flushParagraph();
      if (!listOrdered && listItems.length) flushList();
      listOrdered = true;
      listItems.push(numbered[1]);
    } else if (!trimmed) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: 'paragraph', text: '' }];
}

/** Parse **bold**, *italic*, and `code` within a line of assistant text. */
export function parseInlineMarkdown(text = '') {
  const input = String(text);
  if (!input) return [{ type: 'text', value: '' }];

  const segments = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: input.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**')) {
      segments.push({ type: 'bold', value: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      segments.push({ type: 'code', value: token.slice(1, -1) });
    } else {
      segments.push({ type: 'italic', value: token.slice(1, -1) });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < input.length) {
    segments.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: 'text', value: input }];
}
