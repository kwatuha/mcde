BEGIN;

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS adpPlanId BIGINT NULL;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS adpProjectId BIGINT NULL;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS adpSourceSnapshot JSONB NULL;

ALTER TABLE budget_items ALTER COLUMN projectId DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_adp_plan ON budgets (adpPlanId) WHERE COALESCE(voided, false) = false;
CREATE INDEX IF NOT EXISTS idx_budget_items_adp_project ON budget_items (adpProjectId) WHERE COALESCE(voided, false) = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_budget_items_budget_adp_project
  ON budget_items (budgetId, adpProjectId)
  WHERE COALESCE(voided, false) = false AND adpProjectId IS NOT NULL;

COMMIT;
