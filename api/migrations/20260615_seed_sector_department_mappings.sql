BEGIN;

CREATE TABLE IF NOT EXISTS department_sector_mappings (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT NULL,
    department_name TEXT NULL,
    sector_id BIGINT NULL,
    sector_name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    voided BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_dept_sector_mappings_sector
    ON department_sector_mappings (lower(trim(sector_name)))
    WHERE voided = false;

CREATE INDEX IF NOT EXISTS idx_dept_sector_mappings_department
    ON department_sector_mappings (lower(trim(department_name)))
    WHERE voided = false;

WITH mapping(seed_sector_name, seed_department_name) AS (
    VALUES
        ('Agriculture and Co-operative Development', 'Agriculture, Food Security and Cooperative Development'),
        ('Commercial, Tourism and Labour Affairs', 'Trade, Industry, Tourism and Innovation'),
        ('Education, Youth and Social Welfare', 'Education, ECDE & Vocational Training'),
        ('Education, Youth and Social Welfare', 'Gender, Youth, Sports and Social Welfare'),
        ('Energy, Infrastructure and ICT', 'Transport, Roads, & Public Works'),
        ('Health', 'Health Services'),
        ('Lands, Environment and Natural Resources', 'Lands, Physical Planning, Housing, Urban Development and Energy'),
        ('Public Administration', 'Devolution, County Administration & Decentralized Units'),
        ('Public Administration', 'Finance, Economic Planning, Revenue Management and ICT'),
        ('Public Administration', 'Office of the Governor'),
        ('Water and Irrigation', 'Water, Irrigation, Environment, Sanitation & Climate Change')
),
resolved AS (
    SELECT
        s.id AS sector_id,
        s.name AS sector_name,
        d."departmentId" AS department_id,
        d.name AS department_name
    FROM mapping m
    LEFT JOIN sectors s
      ON COALESCE(s.voided, false) = false
     AND LOWER(TRIM(s.name)) = LOWER(TRIM(m.seed_sector_name))
    LEFT JOIN departments d
      ON COALESCE(d.voided, false) = false
     AND LOWER(TRIM(d.name)) = LOWER(TRIM(m.seed_department_name))
)
INSERT INTO department_sector_mappings (department_id, department_name, sector_id, sector_name, voided, updated_at)
SELECT department_id, department_name, sector_id, sector_name, false, CURRENT_TIMESTAMP
FROM resolved
WHERE NULLIF(TRIM(sector_name), '') IS NOT NULL
  AND NULLIF(TRIM(department_name), '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM department_sector_mappings existing
      WHERE COALESCE(existing.voided, false) = false
        AND LOWER(TRIM(existing.sector_name)) = LOWER(TRIM(resolved.sector_name))
        AND LOWER(TRIM(existing.department_name)) = LOWER(TRIM(resolved.department_name))
  );

COMMIT;
