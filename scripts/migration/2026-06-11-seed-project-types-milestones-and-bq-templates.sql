-- =============================================================================
-- Seed project type templates from api/templates/project_types_milestones_sample.xlsx
-- =============================================================================
-- This migration is idempotent:
--   - inserts missing project categories, milestone templates, and BQ templates
--   - refreshes matching workbook rows by name
--   - does not delete or void existing extra/manual rows
--
-- Source workbook sheets:
--   - Project Types
--   - Milestone Templates
--   - Sample BQ Templates
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS categories (
  "categoryId" INTEGER NOT NULL PRIMARY KEY,
  "categoryName" VARCHAR(255),
  description TEXT,
  picture VARCHAR(255),
  voided BOOLEAN DEFAULT FALSE,
  "voidedBy" VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS category_milestones (
  "milestoneId" INTEGER NOT NULL PRIMARY KEY,
  "categoryId" INTEGER NOT NULL,
  "milestoneName" VARCHAR(255) NOT NULL,
  description TEXT,
  "sequenceOrder" INTEGER,
  "userId" INTEGER,
  voided BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unit_of_measure VARCHAR(100),
  achievement_value NUMERIC(18,2)
);

CREATE TABLE IF NOT EXISTS category_bq_templates (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL,
  milestone_id BIGINT NULL,
  activity_name TEXT NOT NULL,
  description TEXT NULL,
  unit_of_measure TEXT NULL,
  quantity NUMERIC(18,4) NULL,
  unit_cost NUMERIC(18,2) NULL,
  budget_amount NUMERIC(18,2) NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS picture VARCHAR(255);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS voided BOOLEAN DEFAULT FALSE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS "voidedBy" VARCHAR(255);

ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS "sequenceOrder" INTEGER;
ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS "userId" INTEGER;
ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS voided BOOLEAN DEFAULT FALSE;
ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(100);
ALTER TABLE category_milestones ADD COLUMN IF NOT EXISTS achievement_value NUMERIC(18,2);

ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS category_id BIGINT;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS milestone_id BIGINT NULL;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS activity_name TEXT;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS unit_of_measure TEXT NULL;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4) NULL;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,2) NULL;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(18,2) NULL;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE category_bq_templates ADD COLUMN IF NOT EXISTS voided BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_category_milestones_category
  ON category_milestones ("categoryId", voided, "sequenceOrder");

CREATE INDEX IF NOT EXISTS idx_category_bq_templates_category
  ON category_bq_templates (category_id, voided, sort_order);

CREATE TEMP TABLE seed_project_types (
  code TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  description TEXT NOT NULL,
  typical_sector TEXT,
  notes TEXT
) ON COMMIT DROP;

INSERT INTO seed_project_types (code, category_name, description, typical_sector, notes) VALUES
  ('ROAD-ACCESS', 'Access Road Improvement', 'Routine construction, grading, gravelling, drainage, and spot improvement of local access roads.', 'Roads and Transport', 'Use for ward roads, feeder roads, and market access roads.'),
  ('WATER-BOREHOLE', 'Borehole and Water Supply', 'Drilling, equipping, storage, piping, and commissioning of community water supply projects.', 'Water and Irrigation', 'Use for boreholes, tanks, kiosks, and reticulation works.'),
  ('ECDE-CLASSROOM', 'ECDE Classroom Construction', 'Construction and equipping of early childhood development classrooms and related facilities.', 'Education', 'Use for ECDE classrooms, sanitation blocks, and basic furniture packages.'),
  ('HEALTH-FACILITY', 'Health Facility Upgrade', 'Renovation, expansion, equipping, and commissioning of dispensaries, health centres, or maternity units.', 'Health Services', 'Use where procurement needs staged facility upgrade milestones.'),
  ('MARKET-SHED', 'Market Shed and Trading Facility', 'Construction or rehabilitation of market sheds, stalls, drainage, sanitation, and lighting.', 'Trade and Industrialization', 'Use for market shelters, kiosks, paving, and basic public amenities.');

UPDATE categories c
SET description = s.description,
    voided = FALSE
FROM seed_project_types s
WHERE c."categoryName" = s.category_name
  AND COALESCE(c.voided, FALSE) = FALSE
  AND (c.description IS DISTINCT FROM s.description OR c.voided IS DISTINCT FROM FALSE);

WITH missing_categories AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (ORDER BY s.code) AS rn
  FROM seed_project_types s
  WHERE NOT EXISTS (
    SELECT 1
    FROM categories c
    WHERE c."categoryName" = s.category_name
      AND COALESCE(c.voided, FALSE) = FALSE
  )
),
max_category AS (
  SELECT COALESCE(MAX("categoryId"), 0) AS max_id FROM categories
)
INSERT INTO categories ("categoryId", "categoryName", description, voided)
SELECT max_category.max_id + missing_categories.rn,
       missing_categories.category_name,
       missing_categories.description,
       FALSE
FROM missing_categories
CROSS JOIN max_category;

CREATE TEMP TABLE seed_category_milestones (
  code TEXT NOT NULL,
  sequence_order INTEGER NOT NULL,
  milestone_name TEXT NOT NULL,
  description TEXT NOT NULL,
  unit_of_measure TEXT,
  achievement_value NUMERIC(18,2)
) ON COMMIT DROP;

INSERT INTO seed_category_milestones (code, sequence_order, milestone_name, description, unit_of_measure, achievement_value) VALUES
  ('ROAD-ACCESS', 1, 'Site handover and route confirmation', 'Confirm chainage, access constraints, scope boundaries, and site possession.', 'No.', 1),
  ('ROAD-ACCESS', 2, 'Bush clearing and earthworks', 'Clear vegetation, shape formation, open side drains, and prepare road bed.', 'Km', 2.5),
  ('ROAD-ACCESS', 3, 'Culverts and drainage structures', 'Install culverts, mitre drains, scour checks, and other drainage controls.', 'No.', 6),
  ('ROAD-ACCESS', 4, 'Gravelling and compaction', 'Place approved gravel material, spread, water, and compact to required standard.', 'Km', 2.5),
  ('ROAD-ACCESS', 5, 'Inspection, defects correction, and completion', 'Joint inspection, snag correction, measurement, and completion certificate.', 'No.', 1),
  ('WATER-BOREHOLE', 1, 'Hydrogeological survey and permits', 'Complete survey, siting, environmental screening, and drilling approvals.', 'No.', 1),
  ('WATER-BOREHOLE', 2, 'Borehole drilling and test pumping', 'Drill borehole, case, gravel pack, develop, and perform test pumping.', 'No.', 1),
  ('WATER-BOREHOLE', 3, 'Equipping and power installation', 'Install pump, controls, solar or grid connection, and protection works.', 'No.', 1),
  ('WATER-BOREHOLE', 4, 'Storage and distribution works', 'Construct tank base, install tank, pipework, kiosks, and fittings.', 'No.', 1),
  ('WATER-BOREHOLE', 5, 'Water quality testing and commissioning', 'Carry out quality test, disinfect, train operators, and commission system.', 'No.', 1),
  ('ECDE-CLASSROOM', 1, 'Site handover and setting out', 'Confirm site, drawings, levels, and construction boundaries.', 'No.', 1),
  ('ECDE-CLASSROOM', 2, 'Foundation and substructure works', 'Excavation, foundation concrete, walling below slab, and hardcore filling.', 'No.', 1),
  ('ECDE-CLASSROOM', 3, 'Walling, roofing, and external envelope', 'Walling, ring beam, roof structure, covering, doors, windows, and finishes base.', 'No.', 1),
  ('ECDE-CLASSROOM', 4, 'Finishes, fittings, and services', 'Plaster, floor, painting, electrical works, sanitation, furniture, and signage.', 'No.', 1),
  ('ECDE-CLASSROOM', 5, 'Final inspection and handover', 'Snag list closure, completion certificate, and handover to school committee.', 'No.', 1),
  ('HEALTH-FACILITY', 1, 'Facility assessment and site handover', 'Confirm priority rooms, service continuity plan, drawings, and site possession.', 'No.', 1),
  ('HEALTH-FACILITY', 2, 'Civil works and structural alterations', 'Carry out demolitions, masonry, roofing, partitions, ramps, and core renovations.', 'No.', 1),
  ('HEALTH-FACILITY', 3, 'Mechanical, electrical, and plumbing works', 'Install water, drainage, electrical fittings, lighting, ventilation, and medical utility points.', 'No.', 1),
  ('HEALTH-FACILITY', 4, 'Equipment supply and installation', 'Supply, install, test, and label approved facility equipment.', 'No.', 1),
  ('HEALTH-FACILITY', 5, 'Testing, user training, and commissioning', 'Run tests, train facility staff, close defects, and commission upgraded facility.', 'No.', 1),
  ('MARKET-SHED', 1, 'Site confirmation and trader engagement', 'Confirm site boundaries, temporary relocation needs, access, and trader communication.', 'No.', 1),
  ('MARKET-SHED', 2, 'Foundations and structural frame', 'Construct foundations, columns, steel or timber frame, and core support works.', 'No.', 1),
  ('MARKET-SHED', 3, 'Roofing, stalls, and floor works', 'Install roof covering, gutters, stalls, concrete floor, paving, and access paths.', 'No.', 1),
  ('MARKET-SHED', 4, 'Drainage, sanitation, and lighting', 'Complete drainage, water points, sanitation, security lighting, and waste handling points.', 'No.', 1),
  ('MARKET-SHED', 5, 'Inspection, allocation support, and handover', 'Inspect works, correct defects, support stall mapping, and hand over facility.', 'No.', 1);

UPDATE category_milestones m
SET description = s.description,
    "sequenceOrder" = s.sequence_order,
    unit_of_measure = s.unit_of_measure,
    achievement_value = s.achievement_value,
    voided = FALSE,
    "updatedAt" = CURRENT_TIMESTAMP
FROM seed_category_milestones s
JOIN seed_project_types pt ON pt.code = s.code
JOIN categories c ON c."categoryName" = pt.category_name AND COALESCE(c.voided, FALSE) = FALSE
WHERE m."categoryId" = c."categoryId"
  AND m."milestoneName" = s.milestone_name
  AND COALESCE(m.voided, FALSE) = FALSE;

WITH missing_milestones AS (
  SELECT
    c."categoryId",
    s.milestone_name,
    s.description,
    s.sequence_order,
    s.unit_of_measure,
    s.achievement_value,
    ROW_NUMBER() OVER (ORDER BY c."categoryId", s.sequence_order, s.milestone_name) AS rn
  FROM seed_category_milestones s
  JOIN seed_project_types pt ON pt.code = s.code
  JOIN categories c ON c."categoryName" = pt.category_name AND COALESCE(c.voided, FALSE) = FALSE
  WHERE NOT EXISTS (
    SELECT 1
    FROM category_milestones m
    WHERE m."categoryId" = c."categoryId"
      AND m."milestoneName" = s.milestone_name
      AND COALESCE(m.voided, FALSE) = FALSE
  )
),
max_milestone AS (
  SELECT COALESCE(MAX("milestoneId"), 0) AS max_id FROM category_milestones
)
INSERT INTO category_milestones (
  "milestoneId",
  "categoryId",
  "milestoneName",
  description,
  "sequenceOrder",
  unit_of_measure,
  achievement_value,
  "userId",
  voided,
  "createdAt",
  "updatedAt"
)
SELECT max_milestone.max_id + missing_milestones.rn,
       missing_milestones."categoryId",
       missing_milestones.milestone_name,
       missing_milestones.description,
       missing_milestones.sequence_order,
       missing_milestones.unit_of_measure,
       missing_milestones.achievement_value,
       1,
       FALSE,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM missing_milestones
CROSS JOIN max_milestone;

CREATE TEMP TABLE seed_category_bq_templates (
  code TEXT NOT NULL,
  linked_milestone_name TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  description TEXT NOT NULL,
  unit_of_measure TEXT,
  quantity NUMERIC(18,4),
  unit_cost NUMERIC(18,2),
  budget_amount NUMERIC(18,2),
  sort_order INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO seed_category_bq_templates (
  code,
  linked_milestone_name,
  activity_name,
  description,
  unit_of_measure,
  quantity,
  unit_cost,
  budget_amount,
  sort_order
) VALUES
  ('ROAD-ACCESS', 'Bush clearing and earthworks', 'Bush clearing and grubbing', 'Clear vegetation and dispose unsuitable material.', 'Km', 2.5, 85000, 212500, 1),
  ('ROAD-ACCESS', 'Culverts and drainage structures', '600mm concrete culvert installation', 'Supply and install culvert barrels including headwalls.', 'No.', 6, 120000, 720000, 2),
  ('ROAD-ACCESS', 'Gravelling and compaction', 'Approved gravel wearing course', 'Place and compact gravel to approved thickness.', 'Km', 2.5, 450000, 1125000, 3),
  ('WATER-BOREHOLE', 'Borehole drilling and test pumping', 'Borehole drilling', 'Drill and case borehole to approved depth.', 'No.', 1, 1850000, 1850000, 1),
  ('WATER-BOREHOLE', 'Equipping and power installation', 'Solar pumping system', 'Supply and install pump, panels, controls, and accessories.', 'No.', 1, 950000, 950000, 2),
  ('ECDE-CLASSROOM', 'Walling, roofing, and external envelope', 'Classroom superstructure', 'Walling, roofing, doors, and windows.', 'No.', 1, 2600000, 2600000, 1),
  ('ECDE-CLASSROOM', 'Finishes, fittings, and services', 'Internal and external finishes', 'Plastering, flooring, painting, electricals, and fittings.', 'No.', 1, 900000, 900000, 2),
  ('HEALTH-FACILITY', 'Equipment supply and installation', 'Basic facility equipment package', 'Supply and install approved medical and utility equipment.', 'Lot', 1, 1800000, 1800000, 1),
  ('MARKET-SHED', 'Roofing, stalls, and floor works', 'Market shed roof and stalls', 'Roof covering, stall partitions, floor slab, and paving.', 'Lot', 1, 3200000, 3200000, 1);

WITH resolved_templates AS (
  SELECT
    c."categoryId" AS category_id,
    m."milestoneId" AS milestone_id,
    b.activity_name,
    b.description,
    b.unit_of_measure,
    b.quantity,
    b.unit_cost,
    b.budget_amount,
    b.sort_order
  FROM seed_category_bq_templates b
  JOIN seed_project_types pt ON pt.code = b.code
  JOIN categories c ON c."categoryName" = pt.category_name AND COALESCE(c.voided, FALSE) = FALSE
  LEFT JOIN category_milestones m
    ON m."categoryId" = c."categoryId"
   AND m."milestoneName" = b.linked_milestone_name
   AND COALESCE(m.voided, FALSE) = FALSE
)
UPDATE category_bq_templates t
SET milestone_id = r.milestone_id,
    description = r.description,
    unit_of_measure = r.unit_of_measure,
    quantity = r.quantity,
    unit_cost = r.unit_cost,
    budget_amount = r.budget_amount,
    sort_order = r.sort_order,
    voided = FALSE,
    updated_at = CURRENT_TIMESTAMP
FROM resolved_templates r
WHERE t.category_id = r.category_id
  AND t.activity_name = r.activity_name
  AND COALESCE(t.voided, FALSE) = FALSE;

WITH resolved_templates AS (
  SELECT
    c."categoryId" AS category_id,
    m."milestoneId" AS milestone_id,
    b.activity_name,
    b.description,
    b.unit_of_measure,
    b.quantity,
    b.unit_cost,
    b.budget_amount,
    b.sort_order
  FROM seed_category_bq_templates b
  JOIN seed_project_types pt ON pt.code = b.code
  JOIN categories c ON c."categoryName" = pt.category_name AND COALESCE(c.voided, FALSE) = FALSE
  LEFT JOIN category_milestones m
    ON m."categoryId" = c."categoryId"
   AND m."milestoneName" = b.linked_milestone_name
   AND COALESCE(m.voided, FALSE) = FALSE
),
missing_templates AS (
  SELECT
    r.*,
    ROW_NUMBER() OVER (ORDER BY r.category_id, r.sort_order, r.activity_name) AS rn
  FROM resolved_templates r
  WHERE NOT EXISTS (
    SELECT 1
    FROM category_bq_templates t
    WHERE t.category_id = r.category_id
      AND t.activity_name = r.activity_name
      AND COALESCE(t.voided, FALSE) = FALSE
  )
),
max_template AS (
  SELECT COALESCE(MAX(id), 0) AS max_id FROM category_bq_templates
)
INSERT INTO category_bq_templates (
  id,
  category_id,
  milestone_id,
  activity_name,
  description,
  unit_of_measure,
  quantity,
  unit_cost,
  budget_amount,
  sort_order,
  created_at,
  updated_at,
  voided
)
SELECT max_template.max_id + missing_templates.rn,
       missing_templates.category_id,
       missing_templates.milestone_id,
       missing_templates.activity_name,
       missing_templates.description,
       missing_templates.unit_of_measure,
       missing_templates.quantity,
       missing_templates.unit_cost,
       missing_templates.budget_amount,
       missing_templates.sort_order,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP,
       FALSE
FROM missing_templates
CROSS JOIN max_template;

DO $$
DECLARE
  template_seq TEXT;
BEGIN
  SELECT pg_get_serial_sequence('category_bq_templates', 'id') INTO template_seq;
  IF template_seq IS NOT NULL THEN
    EXECUTE format(
      'SELECT setval(%L, GREATEST((SELECT COALESCE(MAX(id), 0) FROM category_bq_templates), 1), true)',
      template_seq
    );
  END IF;
END $$;

-- Verification summary for the workbook seed rows.
WITH sample_categories AS (
  SELECT c."categoryId", c."categoryName"
  FROM categories c
  JOIN seed_project_types s ON s.category_name = c."categoryName"
  WHERE COALESCE(c.voided, FALSE) = FALSE
)
SELECT 'project_type_categories' AS seed_area, COUNT(*) AS seeded_rows FROM sample_categories
UNION ALL
SELECT 'milestone_templates', COUNT(*)
FROM category_milestones m
JOIN sample_categories c ON c."categoryId" = m."categoryId"
JOIN seed_category_milestones s ON s.milestone_name = m."milestoneName"
WHERE COALESCE(m.voided, FALSE) = FALSE
UNION ALL
SELECT 'bq_templates', COUNT(*)
FROM category_bq_templates t
JOIN sample_categories c ON c."categoryId" = t.category_id
JOIN seed_category_bq_templates s ON s.activity_name = t.activity_name
WHERE COALESCE(t.voided, FALSE) = FALSE
ORDER BY seed_area;

COMMIT;
