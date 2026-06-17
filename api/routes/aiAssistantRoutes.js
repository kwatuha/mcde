const express = require('express');
const pool = require('../config/db');
const {
    askOpenAI,
    askOpenAIReport,
    getAssistantStatus,
    sanitizeMessages,
    truncate,
} = require('../services/openAiAssistantService');
const { buildAiDataContext } = require('../services/aiDataContextService');
const {
    renderReportDocx,
    renderReportPdf,
    safeFileName,
} = require('../services/aiReportRendererService');
const { isSuperAdminRequester } = require('../utils/roleUtils');

const router = express.Router();

const MODEL_PRICING_USD_PER_1M = {
    'gpt-4.1-mini': { input: 0.40, output: 1.60 },
    'gpt-4.1': { input: 2.00, output: 8.00 },
    'gpt-4.1-nano': { input: 0.10, output: 0.40 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
};

let schemaEnsured = false;
let schemaPromise = null;

function getUserId(user) {
    const value = user?.id ?? user?.userId ?? user?.userid ?? user?.actualUserId ?? null;
    return value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

async function ensureAiAuditSchema() {
    if (schemaEnsured) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_assistant_interactions (
                id BIGSERIAL PRIMARY KEY,
                occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                user_id BIGINT NULL,
                username TEXT NULL,
                model TEXT NULL,
                route_path TEXT NULL,
                prompt TEXT NULL,
                response TEXT NULL,
                status TEXT NOT NULL DEFAULT 'success',
                error_message TEXT NULL,
                input_tokens INTEGER NULL,
                output_tokens INTEGER NULL,
                total_tokens INTEGER NULL,
                metadata JSONB NULL
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_assistant_interactions_occurred ON ai_assistant_interactions (occurred_at DESC)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_assistant_interactions_user ON ai_assistant_interactions (user_id, occurred_at DESC)');
        schemaEnsured = true;
    })();
    return schemaPromise;
}

function estimateCost(row = {}) {
    const model = String(row.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini');
    const pricing = MODEL_PRICING_USD_PER_1M[model] || MODEL_PRICING_USD_PER_1M['gpt-4.1-mini'];
    const inputTokens = Number(row.input_tokens || row.inputTokens || 0);
    const outputTokens = Number(row.output_tokens || row.outputTokens || 0);
    return (inputTokens / 1000000 * pricing.input) + (outputTokens / 1000000 * pricing.output);
}

function estimatedCostSql() {
    const inputCase = Object.entries(MODEL_PRICING_USD_PER_1M)
        .map(([model, pricing]) => `WHEN '${model}' THEN ${pricing.input}`)
        .join(' ');
    const outputCase = Object.entries(MODEL_PRICING_USD_PER_1M)
        .map(([model, pricing]) => `WHEN '${model}' THEN ${pricing.output}`)
        .join(' ');
    return `
        COALESCE(SUM(
            (COALESCE(input_tokens, 0)::numeric / 1000000) *
                CASE COALESCE(NULLIF(TRIM(model), ''), 'gpt-4.1-mini') ${inputCase} ELSE ${MODEL_PRICING_USD_PER_1M['gpt-4.1-mini'].input} END
            +
            (COALESCE(output_tokens, 0)::numeric / 1000000) *
                CASE COALESCE(NULLIF(TRIM(model), ''), 'gpt-4.1-mini') ${outputCase} ELSE ${MODEL_PRICING_USD_PER_1M['gpt-4.1-mini'].output} END
        ), 0)::numeric AS "estimatedCostUsd"
    `;
}

function addDateFilters(where, params, { startDate, endDate }) {
    if (startDate) {
        params.push(startDate);
        where.push(`occurred_at >= $${params.length}::date`);
    }
    if (endDate) {
        params.push(endDate);
        where.push(`occurred_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
}

async function recordInteraction({ req, messages, result = null, status = 'success', error = null, dataContext = null }) {
    try {
        await ensureAiAuditSchema();
        const safeMessages = sanitizeMessages(messages);
        const latestUserMessage = [...safeMessages].reverse().find((message) => message.role === 'user')?.content || '';
        const context = req.body?.context || {};
        const usage = result?.usage || {};
        await pool.query(
            `
            INSERT INTO ai_assistant_interactions (
                user_id, username, model, route_path, prompt, response, status, error_message,
                input_tokens, output_tokens, total_tokens, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
            `,
            [
                getUserId(req.user),
                req.user?.username || req.user?.userName || null,
                result?.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
                context?.path || context?.route || null,
                truncate(latestUserMessage, 4000),
                truncate(result?.answer || '', 8000),
                status,
                error ? truncate(error.message || String(error), 4000) : null,
                usage.inputTokens ?? null,
                usage.outputTokens ?? null,
                usage.totalTokens ?? null,
                JSON.stringify({
                    pageTitle: context?.title || null,
                    messageCount: safeMessages.length,
                    dataContextUsed: Boolean(dataContext?.used),
                    dataContextSources: dataContext?.sources || [],
                    dataContextError: dataContext?.error || null,
                }),
            ]
        );
    } catch (auditError) {
        console.warn('[ai_assistant] audit log failed:', auditError.message);
    }
}

router.get('/status', (req, res) => {
    res.json(getAssistantStatus());
});

router.post('/chat', async (req, res) => {
    const messages = req.body?.messages || [];
    const context = req.body?.context || {};
    let dataContext = null;
    try {
        dataContext = await buildAiDataContext({
            user: req.user,
            messages,
            context,
        });
        const result = await askOpenAI({
            messages,
            context,
            user: req.user,
            dataContext,
        });
        await recordInteraction({ req, messages, result, status: 'success', dataContext });
        res.json({
            ...result,
            dataContextUsed: Boolean(dataContext?.used),
            dataSources: dataContext?.sources || [],
        });
    } catch (error) {
        await recordInteraction({ req, messages, status: 'error', error, dataContext });
        const statusCode = error.statusCode && Number(error.statusCode) < 500 ? Number(error.statusCode) : (error.statusCode || 500);
        res.status(statusCode).json({
            message: error.message || 'AI assistance failed.',
            configured: getAssistantStatus().configured,
        });
    }
});

router.post('/report', async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    const reportType = String(req.body?.reportType || 'General M&E report').trim();
    const output = String(req.body?.output || 'docx').trim().toLowerCase() === 'pdf' ? 'pdf' : 'docx';
    const context = req.body?.context || {};
    const messages = [{ role: 'user', content: prompt }];
    let dataContext = null;

    try {
        dataContext = await buildAiDataContext({
            user: req.user,
            messages,
            context,
        });
        const result = await askOpenAIReport({
            prompt,
            reportType,
            user: req.user,
            context,
            dataContext,
        });

        const buffer = output === 'pdf'
            ? await renderReportPdf(result.report)
            : await renderReportDocx(result.report);
        const fileName = safeFileName(result.report.title || reportType, output);

        await recordInteraction({
            req,
            messages,
            result: {
                answer: `Generated ${output.toUpperCase()} report: ${result.report.title}`,
                model: result.model,
                usage: result.usage,
            },
            status: 'success',
            dataContext,
        });

        res.setHeader('Content-Type', output === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('X-AI-Data-Context-Used', String(Boolean(dataContext?.used)));
        return res.send(buffer);
    } catch (error) {
        await recordInteraction({ req, messages, status: 'error', error, dataContext });
        const statusCode = error.statusCode && Number(error.statusCode) < 500 ? Number(error.statusCode) : (error.statusCode || 500);
        return res.status(statusCode).json({
            message: error.message || 'AI report generation failed.',
            configured: getAssistantStatus().configured,
        });
    }
});

router.get('/usage', async (req, res) => {
    if (!isSuperAdminRequester(req.user)) {
        return res.status(403).json({ message: 'Only Super Admin can view AI usage statistics.' });
    }

    try {
        await ensureAiAuditSchema();
        const { startDate = '', endDate = '', userId = '', model = '' } = req.query;
        const where = ['1 = 1'];
        const params = [];
        const costSql = estimatedCostSql();
        addDateFilters(where, params, { startDate, endDate });
        if (userId) {
            params.push(Number(userId));
            where.push(`user_id = $${params.length}`);
        }
        if (model) {
            params.push(String(model));
            where.push(`model = $${params.length}`);
        }
        const whereSql = where.join(' AND ');

        const [summaryResult, dailyResult, usersResult, modelsResult, recentResult] = await Promise.all([
            pool.query(
                `
                SELECT
                    COUNT(*)::int AS requests,
                    COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
                    COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
                    COALESCE(SUM(input_tokens), 0)::bigint AS "inputTokens",
                    COALESCE(SUM(output_tokens), 0)::bigint AS "outputTokens",
                    COALESCE(SUM(total_tokens), 0)::bigint AS "totalTokens",
                    ${costSql}
                FROM ai_assistant_interactions
                WHERE ${whereSql}
                `,
                params
            ),
            pool.query(
                `
                SELECT
                    occurred_at::date AS day,
                    COUNT(*)::int AS requests,
                    COALESCE(SUM(input_tokens), 0)::bigint AS "inputTokens",
                    COALESCE(SUM(output_tokens), 0)::bigint AS "outputTokens",
                    COALESCE(SUM(total_tokens), 0)::bigint AS "totalTokens",
                    ${costSql}
                FROM ai_assistant_interactions
                WHERE ${whereSql}
                GROUP BY occurred_at::date
                ORDER BY day DESC
                LIMIT 60
                `,
                params
            ),
            pool.query(
                `
                SELECT
                    user_id AS "userId",
                    COALESCE(NULLIF(TRIM(username), ''), 'Unknown') AS username,
                    COUNT(*)::int AS requests,
                    COALESCE(SUM(input_tokens), 0)::bigint AS "inputTokens",
                    COALESCE(SUM(output_tokens), 0)::bigint AS "outputTokens",
                    COALESCE(SUM(total_tokens), 0)::bigint AS "totalTokens",
                    ${costSql}
                FROM ai_assistant_interactions
                WHERE ${whereSql}
                GROUP BY user_id, username
                ORDER BY requests DESC, "totalTokens" DESC
                LIMIT 100
                `,
                params
            ),
            pool.query(
                `
                SELECT
                    COALESCE(NULLIF(TRIM(model), ''), 'unknown') AS model,
                    COUNT(*)::int AS requests,
                    COALESCE(SUM(input_tokens), 0)::bigint AS "inputTokens",
                    COALESCE(SUM(output_tokens), 0)::bigint AS "outputTokens",
                    COALESCE(SUM(total_tokens), 0)::bigint AS "totalTokens",
                    ${costSql}
                FROM ai_assistant_interactions
                WHERE ${whereSql}
                GROUP BY model
                ORDER BY requests DESC
                `,
                params
            ),
            pool.query(
                `
                SELECT
                    id,
                    occurred_at AS "occurredAt",
                    user_id AS "userId",
                    username,
                    model,
                    route_path AS "routePath",
                    status,
                    error_message AS "errorMessage",
                    input_tokens AS "inputTokens",
                    output_tokens AS "outputTokens",
                    total_tokens AS "totalTokens"
                FROM ai_assistant_interactions
                WHERE ${whereSql}
                ORDER BY occurred_at DESC
                LIMIT 100
                `,
                params
            ),
        ]);

        const summary = summaryResult.rows?.[0] || {};
        const models = modelsResult.rows || [];
        const users = usersResult.rows || [];
        const daily = dailyResult.rows || [];
        const recent = (recentResult.rows || []).map((row) => ({
            ...row,
            estimatedCostUsd: estimateCost(row),
        }));

        return res.json({
            summary: {
                ...summary,
                estimatedCostUsd: Number(summary.estimatedCostUsd || 0),
            },
            daily,
            users,
            models,
            recent,
            pricing: MODEL_PRICING_USD_PER_1M,
            note: 'Estimated cost is calculated from recorded tokens and configured model pricing. Use the OpenAI dashboard for official billing balance.',
        });
    } catch (error) {
        console.error('Error fetching AI usage statistics:', error);
        return res.status(500).json({ message: 'Error fetching AI usage statistics', error: error.message });
    }
});

module.exports = router;
