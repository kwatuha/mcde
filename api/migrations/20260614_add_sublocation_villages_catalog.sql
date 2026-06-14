BEGIN;

CREATE TABLE IF NOT EXISTS machakos_sublocation_villages (
    id BIGSERIAL PRIMARY KEY,
    county TEXT NOT NULL DEFAULT 'Machakos',
    subcounty TEXT NOT NULL,
    ward TEXT NOT NULL,
    sublocation TEXT NOT NULL,
    village TEXT NOT NULL,
    source_row_no INTEGER NULL,
    normalized_key TEXT NOT NULL,
    voided BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_machakos_sublocation_villages_key
    ON machakos_sublocation_villages (normalized_key)
    WHERE voided = false;

CREATE INDEX IF NOT EXISTS idx_machakos_sublocation_villages_subcounty
    ON machakos_sublocation_villages (lower(trim(subcounty)))
    WHERE voided = false;

CREATE INDEX IF NOT EXISTS idx_machakos_sublocation_villages_ward
    ON machakos_sublocation_villages (lower(trim(ward)))
    WHERE voided = false;

CREATE INDEX IF NOT EXISTS idx_machakos_sublocation_villages_sublocation
    ON machakos_sublocation_villages (lower(trim(sublocation)))
    WHERE voided = false;

CREATE INDEX IF NOT EXISTS idx_machakos_sublocation_villages_village
    ON machakos_sublocation_villages (lower(trim(village)))
    WHERE voided = false;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS location_sublocation TEXT
    GENERATED ALWAYS AS (NULLIF(TRIM(location->>'sublocation'), '')) STORED;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS location_village TEXT
    GENERATED ALWAYS AS (NULLIF(TRIM(location->>'village'), '')) STORED;

CREATE INDEX IF NOT EXISTS idx_projects_location_sublocation_norm
    ON projects (regexp_replace(lower(trim(COALESCE(location->>'sublocation', ''))), '[^a-z0-9]+', '', 'g'))
    WHERE COALESCE(voided, false) = false;

CREATE INDEX IF NOT EXISTS idx_projects_location_village_norm
    ON projects (regexp_replace(lower(trim(COALESCE(location->>'village', ''))), '[^a-z0-9]+', '', 'g'))
    WHERE COALESCE(voided, false) = false;

DO $$
DECLARE
    c record;
BEGIN
    IF to_regclass('public.user_project_scopes') IS NOT NULL THEN
        FOR c IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'public.user_project_scopes'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%scope_type%'
        LOOP
            EXECUTE format('ALTER TABLE public.user_project_scopes DROP CONSTRAINT %I', c.conname);
        END LOOP;

        ALTER TABLE public.user_project_scopes
            ADD CONSTRAINT user_project_scopes_scope_type_check
            CHECK (scope_type IN ('ALL_DEPARTMENTS', 'SECTOR', 'DEPARTMENT', 'SUBCOUNTY', 'WARD', 'SUBLOCATION', 'VILLAGE'));
    END IF;
END $$;

COMMIT;
