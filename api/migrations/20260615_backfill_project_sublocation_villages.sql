\set ON_ERROR_STOP on

\if :{?apply}
\else
\set apply false
\endif

\if :{?overwrite}
\else
\set overwrite false
\endif

\if :{?allow_county_fallback}
\else
\set allow_county_fallback false
\endif

\if :{?seed}
\else
\set seed machakos-project-sublocation-village-backfill-v1
\endif

\echo Project sublocation/village backfill
\echo apply=:apply overwrite=:overwrite allow_county_fallback=:allow_county_fallback seed=:seed

BEGIN;

CREATE TEMP TABLE _project_sublocation_village_backfill AS
WITH project_rows AS (
  SELECT
    p.project_id,
    p.name AS project_name,
    CASE
      WHEN jsonb_typeof(p.location) = 'object' THEN p.location
      ELSE '{}'::jsonb
    END AS location
  FROM projects p
  WHERE COALESCE(p.voided, false) = false
    AND (
      :'overwrite'::boolean
      OR p.location IS NULL
      OR jsonb_typeof(p.location) <> 'object'
      OR NULLIF(TRIM(p.location->>'sublocation'), '') IS NULL
      OR NULLIF(TRIM(p.location->>'village'), '') IS NULL
    )
),
eligible_projects AS (
  SELECT
    pr.*,
    NULLIF(TRIM(COALESCE(
      pr.location->>'subcounty',
      pr.location->>'SubCounty',
      pr.location->>'constituency',
      pr.location->>'Constituency'
    )), '') AS old_subcounty,
    NULLIF(TRIM(COALESCE(pr.location->>'ward', pr.location->>'Ward')), '') AS old_ward,
    NULLIF(TRIM(pr.location->>'sublocation'), '') AS old_sublocation,
    NULLIF(TRIM(pr.location->>'village'), '') AS old_village,
    regexp_replace(
      replace(lower(TRIM(COALESCE(
        pr.location->>'subcounty',
        pr.location->>'SubCounty',
        pr.location->>'constituency',
        pr.location->>'Constituency',
        ''
      ))), '&', 'and'),
      '[^a-z0-9]+',
      '',
      'g'
    ) AS subcounty_key,
    regexp_replace(
      replace(lower(TRIM(COALESCE(pr.location->>'ward', pr.location->>'Ward', ''))), '&', 'and'),
      '[^a-z0-9]+',
      '',
      'g'
    ) AS ward_key
  FROM project_rows pr
),
catalog AS (
  SELECT
    id AS catalog_id,
    county,
    subcounty,
    ward,
    sublocation,
    village,
    regexp_replace(replace(lower(TRIM(subcounty)), '&', 'and'), '[^a-z0-9]+', '', 'g') AS subcounty_key,
    regexp_replace(replace(lower(TRIM(ward)), '&', 'and'), '[^a-z0-9]+', '', 'g') AS ward_key
  FROM machakos_sublocation_villages
  WHERE COALESCE(voided, false) = false
    AND NULLIF(TRIM(subcounty), '') IS NOT NULL
    AND NULLIF(TRIM(ward), '') IS NOT NULL
    AND NULLIF(TRIM(sublocation), '') IS NOT NULL
    AND NULLIF(TRIM(village), '') IS NOT NULL
),
matched AS (
  SELECT
    ep.project_id,
    ep.project_name,
    ep.location,
    ep.old_subcounty,
    ep.old_ward,
    ep.old_sublocation,
    ep.old_village,
    c.catalog_id,
    c.county AS catalog_county,
    c.subcounty AS catalog_subcounty,
    c.ward AS catalog_ward,
    c.sublocation AS catalog_sublocation,
    c.village AS catalog_village,
    'ward'::text AS match_level,
    1 AS match_priority
  FROM eligible_projects ep
  JOIN catalog c
    ON c.subcounty_key = ep.subcounty_key
   AND c.ward_key = ep.ward_key
  WHERE ep.subcounty_key <> '' AND ep.ward_key <> ''

  UNION ALL

  SELECT
    ep.project_id,
    ep.project_name,
    ep.location,
    ep.old_subcounty,
    ep.old_ward,
    ep.old_sublocation,
    ep.old_village,
    c.catalog_id,
    c.county AS catalog_county,
    c.subcounty AS catalog_subcounty,
    c.ward AS catalog_ward,
    c.sublocation AS catalog_sublocation,
    c.village AS catalog_village,
    'ward-only'::text AS match_level,
    2 AS match_priority
  FROM eligible_projects ep
  JOIN catalog c
    ON c.ward_key = ep.ward_key
  WHERE ep.ward_key <> ''

  UNION ALL

  SELECT
    ep.project_id,
    ep.project_name,
    ep.location,
    ep.old_subcounty,
    ep.old_ward,
    ep.old_sublocation,
    ep.old_village,
    c.catalog_id,
    c.county AS catalog_county,
    c.subcounty AS catalog_subcounty,
    c.ward AS catalog_ward,
    c.sublocation AS catalog_sublocation,
    c.village AS catalog_village,
    'subcounty'::text AS match_level,
    3 AS match_priority
  FROM eligible_projects ep
  JOIN catalog c
    ON c.subcounty_key = ep.subcounty_key
  WHERE ep.subcounty_key <> ''

  UNION ALL

  SELECT
    ep.project_id,
    ep.project_name,
    ep.location,
    ep.old_subcounty,
    ep.old_ward,
    ep.old_sublocation,
    ep.old_village,
    c.catalog_id,
    c.county AS catalog_county,
    c.subcounty AS catalog_subcounty,
    c.ward AS catalog_ward,
    c.sublocation AS catalog_sublocation,
    c.village AS catalog_village,
    'county'::text AS match_level,
    4 AS match_priority
  FROM eligible_projects ep
  CROSS JOIN catalog c
  WHERE :'allow_county_fallback'::boolean
),
ranked AS (
  SELECT
    m.*,
    ROW_NUMBER() OVER (
      PARTITION BY m.project_id
      ORDER BY
        m.match_priority,
        md5(:'seed' || '|' || m.project_id::text || '|' || m.match_level || '|' || m.catalog_id::text)
    ) AS rn
  FROM matched m
),
chosen AS (
  SELECT *
  FROM ranked
  WHERE rn = 1
)
SELECT
  project_id,
  project_name,
  match_level,
  old_subcounty,
  old_ward,
  old_sublocation,
  old_village,
  COALESCE(NULLIF(TRIM(old_subcounty), ''), catalog_subcounty) AS new_subcounty,
  COALESCE(NULLIF(TRIM(old_ward), ''), catalog_ward) AS new_ward,
  catalog_sublocation AS new_sublocation,
  catalog_village AS new_village,
  location
    || jsonb_build_object(
      'county', COALESCE(NULLIF(TRIM(location->>'county'), ''), catalog_county, 'Machakos'),
      'subcounty', COALESCE(NULLIF(TRIM(old_subcounty), ''), catalog_subcounty),
      'constituency', COALESCE(NULLIF(TRIM(location->>'constituency'), ''), NULLIF(TRIM(old_subcounty), ''), catalog_subcounty),
      'ward', COALESCE(NULLIF(TRIM(old_ward), ''), catalog_ward),
      'sublocation', catalog_sublocation,
      'village', catalog_village
    ) AS new_location
FROM chosen;

\echo Summary
SELECT
  (SELECT COUNT(*) FROM projects WHERE COALESCE(voided, false) = false) AS active_projects,
  (
    SELECT COUNT(*)
    FROM projects
    WHERE COALESCE(voided, false) = false
      AND (
        :'overwrite'::boolean
        OR location IS NULL
        OR jsonb_typeof(location) <> 'object'
        OR NULLIF(TRIM(location->>'sublocation'), '') IS NULL
        OR NULLIF(TRIM(location->>'village'), '') IS NULL
      )
  ) AS eligible_projects,
  (SELECT COUNT(*) FROM _project_sublocation_village_backfill) AS proposed_updates;

\echo Match levels
SELECT match_level, COUNT(*) AS proposed_updates
FROM _project_sublocation_village_backfill
GROUP BY match_level
ORDER BY
  CASE match_level
    WHEN 'ward' THEN 1
    WHEN 'ward-only' THEN 2
    WHEN 'subcounty' THEN 3
    WHEN 'county' THEN 4
    ELSE 9
  END;

\echo Sample proposed assignments
SELECT
  project_id,
  project_name,
  match_level,
  old_subcounty,
  old_ward,
  old_sublocation,
  old_village,
  new_subcounty,
  new_ward,
  new_sublocation,
  new_village
FROM _project_sublocation_village_backfill
ORDER BY project_id
LIMIT 25;

\if :apply
UPDATE projects p
SET location = b.new_location,
    updated_at = CURRENT_TIMESTAMP
FROM _project_sublocation_village_backfill b
WHERE p.project_id = b.project_id
  AND COALESCE(p.voided, false) = false;

\echo Applied updates
SELECT COUNT(*) AS applied_updates
FROM _project_sublocation_village_backfill;

COMMIT;
\else
\echo Dry-run only. No projects were updated. Re-run with -v apply=true to apply.
ROLLBACK;
\endif
