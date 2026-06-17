BEGIN;

CREATE TABLE IF NOT EXISTS adp_plans (
  id BIGSERIAL PRIMARY KEY,
  adp_code TEXT NOT NULL UNIQUE,
  adp_name TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  cidp_code TEXT NULL,
  source_document TEXT NULL,
  source_pdf_path TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adp_plans_financial_year ON adp_plans (financial_year) WHERE voided = false;
CREATE INDEX IF NOT EXISTS idx_adp_plans_cidp_code ON adp_plans (cidp_code) WHERE voided = false;

CREATE TABLE IF NOT EXISTS adp_programmes (
  id BIGSERIAL PRIMARY KEY,
  adp_plan_id BIGINT NOT NULL REFERENCES adp_plans(id) ON DELETE CASCADE,
  sector_name TEXT NULL,
  department_name TEXT NULL,
  programme_code TEXT NULL,
  programme_name TEXT NOT NULL,
  subprogramme_code TEXT NULL,
  subprogramme_name TEXT NULL,
  cidp_program_id BIGINT NULL REFERENCES programs("programId") ON DELETE SET NULL,
  cidp_subprogram_id BIGINT NULL REFERENCES subprograms("subProgramId") ON DELETE SET NULL,
  objective TEXT NULL,
  outcome TEXT NULL,
  source_pdf_page INTEGER NULL,
  raw_text TEXT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adp_programmes_plan ON adp_programmes (adp_plan_id) WHERE voided = false;
CREATE INDEX IF NOT EXISTS idx_adp_programmes_sector ON adp_programmes (lower(trim(sector_name))) WHERE voided = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_adp_programmes_natural_key
  ON adp_programmes (
    adp_plan_id,
    lower(trim(COALESCE(sector_name, ''))),
    lower(trim(COALESCE(programme_code, ''))),
    lower(trim(programme_name)),
    lower(trim(COALESCE(subprogramme_code, ''))),
    lower(trim(COALESCE(subprogramme_name, '')))
  )
  WHERE voided = false;

CREATE TABLE IF NOT EXISTS adp_projects (
  id BIGSERIAL PRIMARY KEY,
  adp_plan_id BIGINT NOT NULL REFERENCES adp_plans(id) ON DELETE CASCADE,
  adp_programme_id BIGINT NULL REFERENCES adp_programmes(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL,
  location_text TEXT NULL,
  subcounty TEXT NULL,
  ward TEXT NULL,
  sublocation TEXT NULL,
  village TEXT NULL,
  activity_description TEXT NULL,
  estimated_cost NUMERIC(18,2) NULL,
  funding_source TEXT NULL,
  timeframe TEXT NULL,
  performance_indicator TEXT NULL,
  target TEXT NULL,
  plan_status TEXT NULL,
  implementing_agency TEXT NULL,
  cross_cutting_issues TEXT NULL,
  cidp_program_id BIGINT NULL REFERENCES programs("programId") ON DELETE SET NULL,
  cidp_subprogram_id BIGINT NULL REFERENCES subprograms("subProgramId") ON DELETE SET NULL,
  source_pdf_page INTEGER NULL,
  raw_text TEXT NULL,
  normalized_key TEXT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adp_projects_plan ON adp_projects (adp_plan_id) WHERE voided = false;
CREATE INDEX IF NOT EXISTS idx_adp_projects_programme ON adp_projects (adp_programme_id) WHERE voided = false;
CREATE INDEX IF NOT EXISTS idx_adp_projects_location ON adp_projects (
  lower(trim(COALESCE(ward, ''))),
  lower(trim(COALESCE(sublocation, ''))),
  lower(trim(COALESCE(village, '')))
) WHERE voided = false;
CREATE INDEX IF NOT EXISTS idx_adp_projects_status ON adp_projects (lower(trim(COALESCE(plan_status, '')))) WHERE voided = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_adp_projects_normalized_key
  ON adp_projects (adp_plan_id, normalized_key)
  WHERE voided = false AND normalized_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS adp_indicators (
  id BIGSERIAL PRIMARY KEY,
  adp_plan_id BIGINT NOT NULL REFERENCES adp_plans(id) ON DELETE CASCADE,
  adp_programme_id BIGINT NULL REFERENCES adp_programmes(id) ON DELETE SET NULL,
  sector_name TEXT NULL,
  subprogramme_name TEXT NULL,
  key_output TEXT NULL,
  indicator_name TEXT NOT NULL,
  baseline TEXT NULL,
  planned_target TEXT NULL,
  unit_of_measure TEXT NULL,
  source_pdf_page INTEGER NULL,
  raw_text TEXT NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adp_indicators_plan ON adp_indicators (adp_plan_id) WHERE voided = false;
CREATE INDEX IF NOT EXISTS idx_adp_indicators_programme ON adp_indicators (adp_programme_id) WHERE voided = false;

CREATE TABLE IF NOT EXISTS adp_project_links (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  adp_project_id BIGINT NOT NULL REFERENCES adp_projects(id) ON DELETE CASCADE,
  link_status TEXT NOT NULL DEFAULT 'accepted' CHECK (link_status IN ('accepted', 'manual', 'system', 'voided')),
  notes TEXT NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_adp_project_links_project ON adp_project_links (project_id) WHERE voided = false;
CREATE INDEX IF NOT EXISTS idx_adp_project_links_adp_project ON adp_project_links (adp_project_id) WHERE voided = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_adp_project_links_project_adp
  ON adp_project_links (project_id, adp_project_id)
  WHERE voided = false;

CREATE TABLE IF NOT EXISTS adp_project_link_suggestions (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  adp_project_id BIGINT NOT NULL REFERENCES adp_projects(id) ON DELETE CASCADE,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  match_reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'review_pending' CHECK (status IN ('review_pending', 'accepted', 'rejected')),
  reviewed_by BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adp_project_link_suggestions_project ON adp_project_link_suggestions (project_id);
CREATE INDEX IF NOT EXISTS idx_adp_project_link_suggestions_adp_project ON adp_project_link_suggestions (adp_project_id);
CREATE INDEX IF NOT EXISTS idx_adp_project_link_suggestions_status ON adp_project_link_suggestions (status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_adp_project_link_suggestions_unique
  ON adp_project_link_suggestions (project_id, adp_project_id);

INSERT INTO adp_plans (
  adp_code,
  adp_name,
  financial_year,
  cidp_code,
  source_document,
  source_pdf_path,
  start_date,
  end_date,
  active,
  voided,
  updated_at
)
VALUES (
  'MACHAKOS-CADP-2025-2026',
  'Machakos County Annual Development Plan 2025/2026',
  '2025/2026',
  'MACHAKOS-CIDP-2023-2027',
  'Machakos County Annual Development Plan 2025/2026',
  'docs/otherRpts/Machakos-County-Annual-Development-Plan-2025-2026.pdf',
  DATE '2025-07-01',
  DATE '2026-06-30',
  TRUE,
  FALSE,
  CURRENT_TIMESTAMP
)
ON CONFLICT (adp_code) DO UPDATE
SET adp_name = EXCLUDED.adp_name,
    financial_year = EXCLUDED.financial_year,
    cidp_code = EXCLUDED.cidp_code,
    source_document = EXCLUDED.source_document,
    source_pdf_path = EXCLUDED.source_pdf_path,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    active = TRUE,
    voided = FALSE,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
