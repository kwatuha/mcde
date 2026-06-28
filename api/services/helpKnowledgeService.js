const path = require('path');
const fs = require('fs');

let cached = null;

/** Keep in sync with frontend/src/data/help-knowledge-base.json (frontend Docker build uses that copy). */
function loadKnowledgeBase() {
    if (cached) return cached;
    const candidates = [
        path.join(__dirname, '..', 'data', 'help-knowledge-base.json'),
        path.join(__dirname, '..', '..', 'frontend', 'src', 'data', 'help-knowledge-base.json'),
    ];
    const filePath = candidates.find((p) => fs.existsSync(p));
    if (!filePath) {
        throw new Error('help-knowledge-base.json not found in api/data or frontend/src/data');
    }
    cached = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return cached;
}

function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function scoreTopic(topic, question, context = {}) {
    const q = normalizeText(question);
    const pathText = normalizeText(context.path || context.route || '');
    const title = normalizeText(context.title || '');
    const pageType = normalizeText(context.pageType || (context.page && context.page.pageType) || '');
    let score = 0;

    for (const keyword of topic.keywords || []) {
        const kw = normalizeText(keyword);
        if (!kw) continue;
        if (q.includes(kw)) score += kw.length >= 8 ? 4 : 2;
    }

    if (topic.id && pageType.includes(topic.id.replace(/-/g, ''))) score += 6;
    if (topic.route && pathText.includes(normalizeText(topic.route))) score += 8;
    if (topic.menuPath && title && normalizeText(topic.menuPath).split('→').some((part) => title.includes(part.trim()))) {
        score += 3;
    }

    return score;
}

function formatTopic(topic) {
    const lines = [
        `### ${topic.title}`,
        `Menu: ${topic.menuPath || '—'}`,
        `Route: ${topic.route || '—'}`,
    ];
    if (topic.summary) lines.push(topic.summary);
    if (Array.isArray(topic.steps) && topic.steps.length) {
        lines.push('Steps:');
        topic.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    }
    if (Array.isArray(topic.tips) && topic.tips.length) {
        lines.push('Notes:');
        topic.tips.forEach((tip) => lines.push(`- ${tip}`));
    }
    return lines.join('\n');
}

function getHelpContextForQuestion({ question = '', context = {} } = {}) {
    const kb = loadKnowledgeBase();
    const q = normalizeText(question);
    const isNavigationQuestion = /\b(how do i|how to|where do i|where can i|where is|navigate|menu|go to|find the|open the|verify|certificate|qr|scan|download|mobile app|checklist|professional report|help page|help-support)\b/.test(q);

    if (!isNavigationQuestion && !q.includes('certificate') && !q.includes('report') && !q.includes('dashboard')) {
        return '';
    }

    const ranked = (kb.navigationTopics || [])
        .map((topic) => ({ topic, score: scoreTopic(topic, question, context) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

    const pathText = normalizeText(context.path || '');
    const dashboardMatch = (kb.dashboardGuides || []).find((guide) => (
        guide.route && pathText.includes(normalizeText(guide.route))
    ));

    const chunks = [];
    if (ranked.length) {
        chunks.push('Relevant help topics:');
        ranked.forEach(({ topic }) => chunks.push(formatTopic(topic)));
    }
    if (dashboardMatch && /\breport|dashboard|summarize|professional\b/.test(q)) {
        chunks.push(formatTopic({
            title: dashboardMatch.title,
            menuPath: dashboardMatch.menuPath,
            route: dashboardMatch.route,
            summary: dashboardMatch.purpose,
            steps: dashboardMatch.steps || [],
            tips: dashboardMatch.aiReportHint ? [dashboardMatch.aiReportHint] : [],
        }));
    }
    if (kb.aiAssistantGuide && /\bai assistant|professional report|generate report|word report|pdf report\b/.test(q)) {
        const g = kb.aiAssistantGuide;
        chunks.push([
            `### ${g.title}`,
            g.summary,
            ...(g.steps || []).map((step, i) => `${i + 1}. ${step}`),
            ...(g.tips || []).map((tip) => `- ${tip}`),
        ].join('\n'));
    }

    const text = chunks.join('\n\n').trim();
    const max = Number(process.env.OPENAI_HELP_CONTEXT_MAX_CHARS || 4500);
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function getModuleGuides() {
    return loadKnowledgeBase().moduleGuides || [];
}

function getQuickTasks() {
    return loadKnowledgeBase().quickTasks || [];
}

function getTroubleshootingRows() {
    return loadKnowledgeBase().troubleshootingRows || [];
}

function getRoleGuidance() {
    return loadKnowledgeBase().roleGuidance || [];
}

function getGoodPracticeItems() {
    return loadKnowledgeBase().goodPracticeItems || [];
}

function getSupportChecklist() {
    return loadKnowledgeBase().supportChecklist || [];
}

module.exports = {
    getHelpContextForQuestion,
    getModuleGuides,
    getQuickTasks,
    getTroubleshootingRows,
    getRoleGuidance,
    getGoodPracticeItems,
    getSupportChecklist,
};
