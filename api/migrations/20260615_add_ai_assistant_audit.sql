BEGIN;

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
);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_interactions_occurred
    ON ai_assistant_interactions (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_interactions_user
    ON ai_assistant_interactions (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_interactions_status
    ON ai_assistant_interactions (status);

COMMIT;
