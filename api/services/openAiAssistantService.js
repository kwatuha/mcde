const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const DEFAULT_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 900);
const DEFAULT_REPORT_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_REPORT_MAX_OUTPUT_TOKENS || 2200);

function isAssistantEnabled() {
    return String(process.env.OPENAI_ASSISTANT_ENABLED || 'true').toLowerCase() !== 'false'
        && Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

function getAssistantStatus() {
    return {
        enabled: isAssistantEnabled(),
        configured: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
        model: DEFAULT_MODEL,
    };
}

function truncate(value, max = 6000) {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sanitizeMessages(messages = []) {
    if (!Array.isArray(messages)) return [];
    return messages
        .filter((message) => message && ['user', 'assistant'].includes(message.role))
        .slice(-10)
        .map((message) => ({
            role: message.role,
            content: truncate(message.content, 3000),
        }))
        .filter((message) => message.content.trim());
}

function buildSystemPrompt({ user, context, dataContext } = {}) {
    const username = user?.username || user?.userName || 'user';
    const role = user?.roleName || user?.role || 'user';
    const path = context?.path || context?.route || 'unknown page';
    const title = context?.title || '';

    const lines = [
        'You are the inbuilt AI assistant for the Machakos County Monitoring and Evaluation System.',
        'Help users understand workflows, project monitoring, CIDP/ADP linkages, budgets, reports, approvals, procurement handoff, and system navigation.',
        'Use concise, practical language. When giving steps, make them actionable.',
        'Do not invent database records, counts, or project details that were not provided in the prompt context.',
        'When live system data is provided below, treat it as the authoritative data available to the logged-in user and base figures, counts, and summaries on it.',
        'If live data is not provided, be transparent that you are giving general guidance rather than querying the database.',
        'If the user asks for restricted or sensitive data, explain that you can only use information available to their logged-in account.',
        'AI content is advisory and should be reviewed by responsible officers before official submission.',
        `Logged-in user: ${username}. Role: ${role}. Current page: ${path}${title ? ` (${title})` : ''}.`,
    ];
    if (dataContext?.text) {
        lines.push('\nLIVE DATA CONTEXT:\n' + dataContext.text);
    }
    return lines.join('\n');
}

async function askOpenAI({ messages, user, context, dataContext }) {
    if (!isAssistantEnabled()) {
        const error = new Error('AI assistance is not configured. Set OPENAI_API_KEY in api/.env.');
        error.statusCode = 503;
        throw error;
    }

    const safeMessages = sanitizeMessages(messages);
    if (safeMessages.length === 0) {
        const error = new Error('Please provide a question for the AI assistant.');
        error.statusCode = 400;
        throw error;
    }

    const response = await fetch(`${DEFAULT_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
            max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
            messages: [
                { role: 'system', content: buildSystemPrompt({ user, context, dataContext }) },
                ...safeMessages,
            ],
        }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data?.error?.message || `OpenAI request failed with status ${response.status}`;
        const error = new Error(message);
        error.statusCode = response.status;
        error.openAiError = data?.error || data;
        throw error;
    }

    const answer = data?.choices?.[0]?.message?.content || '';
    return {
        answer: answer.trim(),
        model: data?.model || DEFAULT_MODEL,
        usage: {
            inputTokens: data?.usage?.prompt_tokens ?? null,
            outputTokens: data?.usage?.completion_tokens ?? null,
            totalTokens: data?.usage?.total_tokens ?? null,
        },
    };
}

function safeJsonParse(text) {
    const raw = String(text || '').trim();
    try {
        return JSON.parse(raw);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('AI did not return valid structured report JSON.');
    }
}

function normalizeReportContent(value = {}) {
    const cleanArray = (items) => Array.isArray(items) ? items.filter((item) => item != null && String(item).trim() !== '').map(String) : [];
    const sections = Array.isArray(value.sections) ? value.sections.map((section) => ({
        heading: String(section?.heading || 'Section').trim(),
        paragraphs: cleanArray(section?.paragraphs),
        bullets: cleanArray(section?.bullets),
    })) : [];
    const tables = Array.isArray(value.tables) ? value.tables.map((table) => ({
        title: String(table?.title || 'Table').trim(),
        headers: cleanArray(table?.headers).slice(0, 8),
        rows: Array.isArray(table?.rows)
            ? table.rows.slice(0, 30).map((row) => Array.isArray(row) ? row.slice(0, 8).map((cell) => String(cell ?? '')) : [])
            : [],
    })).filter((table) => table.headers.length > 0) : [];

    return {
        title: String(value.title || 'AI Generated Report').trim(),
        subtitle: String(value.subtitle || 'Machakos County Monitoring and Evaluation System').trim(),
        executiveSummary: String(value.executiveSummary || '').trim(),
        sections,
        tables,
        recommendations: cleanArray(value.recommendations),
        conclusion: String(value.conclusion || '').trim(),
    };
}

async function askOpenAIReport({ prompt, reportType, user, context, dataContext }) {
    if (!isAssistantEnabled()) {
        const error = new Error('AI assistance is not configured. Set OPENAI_API_KEY in api/.env.');
        error.statusCode = 503;
        throw error;
    }

    const userPrompt = truncate(prompt, 3000);
    if (!userPrompt.trim()) {
        const error = new Error('Please provide report instructions.');
        error.statusCode = 400;
        throw error;
    }

    const systemPrompt = [
        'You create professional government M&E report content as structured JSON only.',
        'Do not use Markdown. Do not include prose outside JSON.',
        'The system will format the final Word/PDF document, so focus on clear content, concise findings, and useful recommendations.',
        'Use only live data included in the context. Do not invent project counts, budgets, paid amounts, or project names.',
        'Return this JSON shape exactly: {"title":"","subtitle":"","executiveSummary":"","sections":[{"heading":"","paragraphs":[""],"bullets":[""]}],"tables":[{"title":"","headers":[""],"rows":[[""]]}],"recommendations":[""],"conclusion":""}.',
        `Report type: ${reportType || 'General M&E report'}.`,
        dataContext?.text ? `LIVE DATA CONTEXT:\n${dataContext.text}` : 'No live data context was retrieved. Produce general guidance and say where data should be reviewed.',
    ].join('\n');

    const response = await fetch(`${DEFAULT_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
            max_tokens: DEFAULT_REPORT_MAX_OUTPUT_TOKENS,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data?.error?.message || `OpenAI report request failed with status ${response.status}`;
        const error = new Error(message);
        error.statusCode = response.status;
        error.openAiError = data?.error || data;
        throw error;
    }

    const raw = data?.choices?.[0]?.message?.content || '';
    const report = normalizeReportContent(safeJsonParse(raw));
    return {
        report,
        model: data?.model || DEFAULT_MODEL,
        usage: {
            inputTokens: data?.usage?.prompt_tokens ?? null,
            outputTokens: data?.usage?.completion_tokens ?? null,
            totalTokens: data?.usage?.total_tokens ?? null,
        },
    };
}

module.exports = {
    askOpenAI,
    askOpenAIReport,
    getAssistantStatus,
    sanitizeMessages,
    truncate,
};
