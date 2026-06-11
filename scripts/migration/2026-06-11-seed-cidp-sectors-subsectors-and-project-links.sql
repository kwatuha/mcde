-- =============================================================================
-- Machakos CIDP 2023-2027: sectors, sub-sectors, and project sector links
-- =============================================================================
--
-- Source:
--   Machakos County Integrated Development Plan (CIDP) 2023-2027,
--   Chapter 4: Development Priorities, Strategies and Programmes.
--
-- What this migration does:
--   1) Ensures the CIDP sector catalogue exists in sectors.
--   2) Ensures CIDP-aligned sub-sectors exist in sub_sectors.
--   3) Voids older/non-CIDP active sector rows so the UI shows the CIDP catalogue.
--   4) Reclassifies active test projects to CIDP sectors/sub-sectors using project
--      name, current sector, agency, location, notes, and data source keywords.
--
-- Safe to re-run:
--   - Existing CIDP sectors/sub-sectors are updated/restored.
--   - Missing CIDP sectors/sub-sectors are inserted.
--   - Project sector/sub-sector links are recalculated idempotently.
--
-- Run locally or remotely:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/migration/2026-06-11-seed-cidp-sectors-subsectors-and-project-links.sql
--
-- If you do not use DATABASE_URL:
--   PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "${DB_PORT:-5432}" \
--     -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
--     -f scripts/migration/2026-06-11-seed-cidp-sectors-subsectors-and-project-links.sql
-- =============================================================================

BEGIN;

ALTER TABLE sectors
ADD COLUMN IF NOT EXISTS alias VARCHAR(255);

CREATE TABLE IF NOT EXISTS sub_sectors (
  id SERIAL PRIMARY KEY,
  sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  alias VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  voided BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sub_sectors_sector_id ON sub_sectors(sector_id);
CREATE INDEX IF NOT EXISTS idx_sub_sectors_name ON sub_sectors(name);
CREATE INDEX IF NOT EXISTS idx_sub_sectors_alias ON sub_sectors(alias);
CREATE INDEX IF NOT EXISTS idx_sub_sectors_voided ON sub_sectors(voided);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_sectors_unique_sector_name
ON sub_sectors(sector_id, lower(name))
WHERE voided = false;

CREATE TEMP TABLE _cidp_sectors (
  sort_order INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  alias TEXT,
  description TEXT
) ON COMMIT DROP;

INSERT INTO _cidp_sectors (sort_order, name, alias, description) VALUES
  (10, 'Agriculture and Co-operative Development',
   'Agriculture',
   'CIDP sector covering crops, livestock, veterinary services, fisheries and co-operative development.'),
  (20, 'Commercial, Tourism and Labour Affairs',
   'Trade & Tourism',
   'CIDP sector covering trade, industrialization, investment, tourism and labour affairs.'),
  (30, 'Education, Youth and Social Welfare',
   'Education & Social',
   'CIDP sector covering ECDE, vocational training, youth empowerment, sports, gender and social welfare.'),
  (40, 'Energy, Infrastructure and ICT',
   'Infrastructure & ICT',
   'CIDP sector covering energy, roads and transport, public works and ICT.'),
  (50, 'Health',
   'Health',
   'CIDP sector covering health and emergency services.'),
  (60, 'Lands, Environment and Natural Resources',
   'Lands & Environment',
   'CIDP sector covering lands, physical planning, housing, urban development, environment, natural resources and climate change.'),
  (70, 'Public Administration',
   'Public Admin',
   'CIDP sector covering county administration, finance, planning, legislation, oversight, public service and governance.'),
  (80, 'Water and Irrigation',
   'Water & Irrigation',
   'CIDP sector covering water, irrigation and sanitation.');

DO $$
DECLARE
  sector_row RECORD;
  sector_id_to_update INTEGER;
BEGIN
  FOR sector_row IN SELECT * FROM _cidp_sectors ORDER BY sort_order LOOP
    SELECT s.id
    INTO sector_id_to_update
    FROM sectors s
    WHERE lower(s.name) = lower(sector_row.name)
    ORDER BY COALESCE(s.voided, false), s.id
    LIMIT 1;

    IF sector_id_to_update IS NULL THEN
      INSERT INTO sectors (name, alias, description, voided, created_at, updated_at)
      VALUES (sector_row.name, sector_row.alias, sector_row.description, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    ELSE
      UPDATE sectors
      SET
        name = sector_row.name,
        alias = sector_row.alias,
        description = sector_row.description,
        voided = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = sector_id_to_update;
    END IF;
  END LOOP;
END $$;

CREATE TEMP TABLE _cidp_sub_sectors (
  sector_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  alias TEXT,
  description TEXT,
  PRIMARY KEY (sector_name, name)
) ON COMMIT DROP;

INSERT INTO _cidp_sub_sectors (sector_name, sort_order, name, alias, description) VALUES
  ('Agriculture and Co-operative Development', 10, 'Crops', 'Crops', 'Crop development, food security, farm inputs, value chains and agricultural extension.'),
  ('Agriculture and Co-operative Development', 20, 'Livestock', 'Livestock', 'Livestock production, feeds, markets, breeding and emerging livestock.'),
  ('Agriculture and Co-operative Development', 30, 'Veterinary Services', 'Vet Services', 'Animal disease control, vaccination, animal welfare and meat hygiene.'),
  ('Agriculture and Co-operative Development', 40, 'Fisheries', 'Fisheries', 'Capture fisheries, aquaculture, fish quality assurance and fish marketing.'),
  ('Agriculture and Co-operative Development', 50, 'Co-operative Development', 'Co-operatives', 'Growth, governance, audits, value chains and financial services for co-operatives.'),

  ('Commercial, Tourism and Labour Affairs', 10, 'Trade', 'Trade', 'Markets, trade licensing, trade promotion and consumer protection.'),
  ('Commercial, Tourism and Labour Affairs', 20, 'Industrialization', 'Industry', 'Industrial development, industrial parks, industry liaison and value addition.'),
  ('Commercial, Tourism and Labour Affairs', 30, 'Investment', 'Investment', 'Investment promotion, enterprise development, business support and partnerships.'),
  ('Commercial, Tourism and Labour Affairs', 40, 'Tourism', 'Tourism', 'Tourism products, tourism marketing, tourism infrastructure and county image.'),
  ('Commercial, Tourism and Labour Affairs', 50, 'Labour Affairs', 'Labour', 'Labour affairs, employment creation and decent work.'),
  ('Commercial, Tourism and Labour Affairs', 60, 'Culture and Creative Arts', 'Culture & Arts', 'Culture, creative arts, film, cultural heritage and local creatives.'),
  ('Commercial, Tourism and Labour Affairs', 70, 'Liquor Licensing', 'Liquor', 'Liquor licensing, inspection, compliance and responsible drinking campaigns.'),

  ('Education, Youth and Social Welfare', 10, 'ECDE / Education', 'ECDE', 'Early childhood development education, education infrastructure and bursary support.'),
  ('Education, Youth and Social Welfare', 20, 'Youth Empowerment', 'Youth', 'Youth empowerment, entrepreneurship, health and social empowerment.'),
  ('Education, Youth and Social Welfare', 30, 'Vocational and Skills Training', 'Vocational Training', 'Vocational training centres, trainers, grants and skills development.'),
  ('Education, Youth and Social Welfare', 40, 'Sports and Stadia', 'Sports', 'Sports infrastructure, stadia, playing grounds, talent and sports equipment.'),
  ('Education, Youth and Social Welfare', 50, 'Gender and Social Welfare', 'Gender & Welfare', 'Gender mainstreaming, social welfare, PWDs, OVCs, GBV response and vulnerable groups.'),

  ('Energy, Infrastructure and ICT', 10, 'Energy', 'Energy', 'Energy access, solarization, street lighting, floodlights and energy planning.'),
  ('Energy, Infrastructure and ICT', 20, 'Roads and Transport', 'Roads', 'Road construction, grading, gravelling, drainage, transport facilities and compliance.'),
  ('Energy, Infrastructure and ICT', 30, 'Public Works', 'Public Works', 'Public buildings, public amenities, support structures and building facilities.'),
  ('Energy, Infrastructure and ICT', 40, 'ICT', 'ICT', 'ICT infrastructure, digital services, ICT skills, green ICT and innovation.'),

  ('Health', 10, 'Health Services', 'Health Services', 'General health service delivery and facility-based health services.'),
  ('Health', 20, 'Emergency Services', 'Emergency', 'Health emergency services and emergency response.'),
  ('Health', 30, 'Health Products and Technologies', 'HPT', 'Medicines, medical supplies, health products, forecasting, warehousing and pharmacies.'),
  ('Health', 40, 'Environmental Health Services', 'Env. Health', 'Public health, disease surveillance, food safety, water sanitation and hygiene.'),
  ('Health', 50, 'Laboratory Services', 'Lab Services', 'Laboratory reagents, equipment, staff capacity and quality standards.'),
  ('Health', 60, 'Health Standards and Quality Assurance', 'Quality Assurance', 'Patient safety, service standards, inspections and quality assurance.'),
  ('Health', 70, 'Hospital Level Services', 'Hospital Services', 'Hospital operations, infrastructure, drugs, equipment and human resources for health.'),
  ('Health', 80, 'Immunization Services', 'Immunization', 'Vaccine distribution, cold chain, outreach and immunization coverage.'),
  ('Health', 90, 'HIV / TB Services', 'HIV/TB', 'HIV, TB, PMTCT, PrEP, OVC and related community health services.'),
  ('Health', 100, 'Mental Health', 'Mental Health', 'Mental health services, psychosocial centres and community mental health practice.'),

  ('Lands, Environment and Natural Resources', 10, 'Lands and Physical Planning', 'Lands & Planning', 'Land governance, land records, GIS, valuation rolls, spatial planning and development control.'),
  ('Lands, Environment and Natural Resources', 20, 'Housing and Urban Development', 'Housing & Urban', 'Housing, urban governance, municipalities, townships and urban development.'),
  ('Lands, Environment and Natural Resources', 30, 'Environment and Natural Resources', 'Environment', 'Environment management, natural resources, forestry, solid waste and catchment protection.'),
  ('Lands, Environment and Natural Resources', 40, 'Climate Change', 'Climate Change', 'Climate change adaptation, resilience, climate action plans and clean alternatives.'),

  ('Public Administration', 10, 'Office of the Governor', 'Governor', 'Governor functions, policy coordination, partnerships, public participation and disaster coordination.'),
  ('Public Administration', 20, 'Finance Services', 'Finance', 'Budgeting, financial reporting, pending bills, asset management and financial controls.'),
  ('Public Administration', 30, 'Economic Planning', 'Planning', 'Economic planning, research, feasibility services and monitoring and evaluation.'),
  ('Public Administration', 40, 'Revenue Management', 'Revenue', 'Revenue collection, revenue mapping, revenue automation and compliance.'),
  ('Public Administration', 50, 'County Assembly', 'Assembly', 'Legislation, oversight, representation and assembly service delivery.'),
  ('Public Administration', 60, 'County Administration and Decentralized Units', 'County Admin', 'County administration, decentralized services, administrative offices and service delivery.'),
  ('Public Administration', 70, 'Inspectorate Services', 'Inspectorate', 'Inspectorate services, enforcement and compliance with county laws.'),
  ('Public Administration', 80, 'Public Service and Performance Management', 'Public Service', 'Human resources, performance management, staff welfare and training.'),
  ('Public Administration', 90, 'County Public Service Board', 'CPSB', 'Recruitment, HR audit, staff establishment and HR policy.'),
  ('Public Administration', 100, 'Office of the County Attorney', 'County Attorney', 'Legal services, litigation, county gazette, registry and law support.'),
  ('Public Administration', 110, 'Procurement Unit', 'Procurement', 'Procurement records, procurement processes, asset disposal and maintenance planning.'),
  ('Public Administration', 120, 'Audit Unit', 'Audit', 'Internal controls, audit, risk management and financial record assurance.'),

  ('Water and Irrigation', 10, 'Water', 'Water', 'Water supply, water infrastructure, water storage, water harvesting and water quality.'),
  ('Water and Irrigation', 20, 'Irrigation', 'Irrigation', 'Irrigation projects, irrigation technologies and irrigation water use.'),
  ('Water and Irrigation', 30, 'Sanitation', 'Sanitation', 'Sewer lines, treatment works, septic systems, public toilets and sanitation supplies.');

DO $$
DECLARE
  sub_sector_row RECORD;
  parent_sector_id INTEGER;
  sub_sector_id_to_update INTEGER;
BEGIN
  FOR sub_sector_row IN SELECT * FROM _cidp_sub_sectors ORDER BY sector_name, sort_order LOOP
    SELECT s.id
    INTO parent_sector_id
    FROM sectors s
    WHERE lower(s.name) = lower(sub_sector_row.sector_name)
      AND COALESCE(s.voided, false) = false
    LIMIT 1;

    IF parent_sector_id IS NULL THEN
      RAISE EXCEPTION 'CIDP sector % was not found while seeding sub-sectors', sub_sector_row.sector_name;
    END IF;

    SELECT ss.id
    INTO sub_sector_id_to_update
    FROM sub_sectors ss
    WHERE ss.sector_id = parent_sector_id
      AND lower(ss.name) = lower(sub_sector_row.name)
    ORDER BY COALESCE(ss.voided, false), ss.id
    LIMIT 1;

    IF sub_sector_id_to_update IS NULL THEN
      INSERT INTO sub_sectors (sector_id, name, alias, description, voided, created_at, updated_at)
      VALUES (
        parent_sector_id,
        sub_sector_row.name,
        sub_sector_row.alias,
        sub_sector_row.description,
        false,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );
    ELSE
      UPDATE sub_sectors
      SET
        name = sub_sector_row.name,
        alias = sub_sector_row.alias,
        description = sub_sector_row.description,
        voided = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = sub_sector_id_to_update;
    END IF;
  END LOOP;
END $$;

-- Hide non-CIDP sub-sectors under CIDP sectors so dropdowns stay clean.
UPDATE sub_sectors ss
SET voided = true,
    updated_at = CURRENT_TIMESTAMP
FROM sectors s
WHERE ss.sector_id = s.id
  AND COALESCE(s.voided, false) = false
  AND EXISTS (
    SELECT 1
    FROM _cidp_sectors cs
    WHERE lower(cs.name) = lower(s.name)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM _cidp_sub_sectors css
    WHERE lower(css.sector_name) = lower(s.name)
      AND lower(css.name) = lower(ss.name)
  );

-- Hide older/non-CIDP sector catalogue rows after projects have been remapped by name.
UPDATE sectors s
SET voided = true,
    updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(s.voided, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM _cidp_sectors cs
    WHERE lower(cs.name) = lower(s.name)
  );

-- Keep sub-sector catalogue visibility aligned with parent sectors.
UPDATE sub_sectors ss
SET voided = true,
    updated_at = CURRENT_TIMESTAMP
FROM sectors s
WHERE ss.sector_id = s.id
  AND COALESCE(s.voided, false) = true
  AND COALESCE(ss.voided, false) = false;

CREATE TEMP TABLE _cidp_project_rules (
  priority INTEGER PRIMARY KEY,
  sector_name TEXT NOT NULL,
  sub_sector_name TEXT NOT NULL,
  patterns TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _cidp_project_rules (priority, sector_name, sub_sector_name, patterns) VALUES
  (10, 'Health', 'Laboratory Services',
   ARRAY['%laboratory%', '% lab %', '%diagnostic%', '%x-ray%', '%xray%', '%ultrasound%', '%radiology%']),
  (20, 'Health', 'Hospital Level Services',
   ARRAY['%health%', '%hospital%', '%dispensary%', '%clinic%', '%maternity%', '%medical%', '%pharmacy%', '%rehabilitation%']),
  (30, 'Health', 'Immunization Services',
   ARRAY['%immunization%', '%vaccin%', '%cold chain%']),
  (40, 'Health', 'HIV / TB Services',
   ARRAY['%hiv%', '%tb%', '%tuberculosis%', '%pmtct%', '%prep%', '%ovc%']),
  (50, 'Health', 'Mental Health',
   ARRAY['%mental health%', '%psychosocial%']),

  (100, 'Education, Youth and Social Welfare', 'ECDE / Education',
   ARRAY['%ecde%', '%classroom%', '%school%', '%bursary%', '%education%', '%primary%']),
  (110, 'Education, Youth and Social Welfare', 'Vocational and Skills Training',
   ARRAY['%vocational%', '%vtc%', '%skills training%', '%training workshop%', '%workshop%']),
  (120, 'Education, Youth and Social Welfare', 'Youth Empowerment',
   ARRAY['%youth%', '%empowerment centre%', '%empowerment center%']),
  (130, 'Education, Youth and Social Welfare', 'Sports and Stadia',
   ARRAY['%sports%', '%stadium%', '%stadia%', '%playing ground%', '%playground%']),
  (140, 'Education, Youth and Social Welfare', 'Gender and Social Welfare',
   ARRAY['%gender%', '%pwd%', '%gbv%', '%social welfare%', '%social protection%', '%spcr%', '%elderly%', '%rescue centre%', '%rescue center%']),

  (200, 'Commercial, Tourism and Labour Affairs', 'Trade',
   ARRAY['%market%', '%kiosk%', '%trade%', '%trader%', '%business%', '%sme%', '%licens%', '%geca%', '%general economic%', '%commercial affairs%']),
  (210, 'Commercial, Tourism and Labour Affairs', 'Tourism',
   ARRAY['%tourism%', '%tourist%', '%park%', '%heritage%', '%conference tourism%', '%eco-tourism%']),
  (220, 'Commercial, Tourism and Labour Affairs', 'Culture and Creative Arts',
   ARRAY['%culture%', '%creative%', '%film%', '%machawood%', '%museum%', '%amphitheater%', '%amphitheatre%']),
  (230, 'Commercial, Tourism and Labour Affairs', 'Liquor Licensing',
   ARRAY['%liquor%', '%alcohol%']),
  (240, 'Commercial, Tourism and Labour Affairs', 'Investment',
   ARRAY['%investment%', '%enterprise%', '%incubation%', '%business park%', '%wikwatyo%']),
  (250, 'Commercial, Tourism and Labour Affairs', 'Industrialization',
   ARRAY['%industrial%', '%industry%', '%factory%', '%processing plant%']),

  (300, 'Energy, Infrastructure and ICT', 'Energy',
   ARRAY['%solar%', '%street light%', '%streetlight%', '%floodlight%', '%electric%', '%power%', '%energy%', '%transformer%']),
  (310, 'Energy, Infrastructure and ICT', 'ICT',
   ARRAY['%ict%', '%digital%', '%internet%', '%data centre%', '%data center%', '%innovation hub%', '%community ict%']),
  (320, 'Energy, Infrastructure and ICT', 'Roads and Transport',
   ARRAY['%road%', '%bridge%', '%footbridge%', '%bus park%', '%stage%', '%transport%', '%drainage%', '%culvert%', '%cabro%']),
  (330, 'Energy, Infrastructure and ICT', 'Public Works',
   ARRAY['%public works%', '%public amenit%', '%building%', '%office block%', '%facility construction%']),

  (400, 'Water and Irrigation', 'Sanitation',
   ARRAY['%sanitation%', '%sewer%', '%toilet%', '%latrine%', '%ablution%', '%septic%', '%wastewater%']),
  (410, 'Water and Irrigation', 'Irrigation',
   ARRAY['%irrigation%', '%farm pond%', '%irrigation scheme%']),
  (420, 'Water and Irrigation', 'Water',
   ARRAY['%water%', '%borehole%', '%dam%', '%water pan%', '%rainwater%', '%tank%', '%pipeline%', '%kiosk%']),

  (500, 'Agriculture and Co-operative Development', 'Livestock',
   ARRAY['%livestock%', '%cattle%', '%dip%', '%sale yard%', '%slaughter%', '%dairy%', '%poultry%', '%goat%', '%fodder%', '%pasture%']),
  (510, 'Agriculture and Co-operative Development', 'Fisheries',
   ARRAY['%fish%', '%fisher%', '%aquaculture%', '%fingerling%']),
  (520, 'Agriculture and Co-operative Development', 'Co-operative Development',
   ARRAY['%co-operative%', '%cooperative%', '%sacco%', '%coffee society%', '%societies%']),
  (530, 'Agriculture and Co-operative Development', 'Veterinary Services',
   ARRAY['%veterinary%', '%animal health%', '%rabies%', '%vaccinated animals%']),
  (540, 'Agriculture and Co-operative Development', 'Crops',
   ARRAY['%agriculture%', '%crop%', '%farm%', '%seed%', '%fertilizer%', '%soil%', '%coffee%', '%avocado%', '%honey%', '%apiculture%']),

  (600, 'Lands, Environment and Natural Resources', 'Environment and Natural Resources',
   ARRAY['%environment%', '%solid waste%', '%waste collection%', '%tree%', '%forest%', '%catchment%', '%garbage%', '%quarry%']),
  (610, 'Lands, Environment and Natural Resources', 'Climate Change',
   ARRAY['%climate%', '%resilience%', '%adaptation%', '%drought%', '%flood%']),
  (620, 'Lands, Environment and Natural Resources', 'Lands and Physical Planning',
   ARRAY['%land%', '%spatial%', '%physical planning%', '%survey%', '%valuation%', '%gis%', '%development control%']),
  (630, 'Lands, Environment and Natural Resources', 'Housing and Urban Development',
   ARRAY['%housing%', '%urban%', '%municipal%', '%township%', '%informal settlement%']),

  (700, 'Public Administration', 'County Assembly',
   ARRAY['%assembly%', '%mca%', '%legislation%', '%oversight%']),
  (710, 'Public Administration', 'Office of the Governor',
   ARRAY['%governor%', '%public participation%', '%stakeholder%', '%policy%']),
  (720, 'Public Administration', 'Finance Services',
   ARRAY['%finance%', '%budget%', '%ifmis%', '%pending bill%', '%asset management%']),
  (730, 'Public Administration', 'Economic Planning',
   ARRAY['%planning%', '%m&e%', '%monitoring and evaluation%', '%statistics%', '%research%']),
  (740, 'Public Administration', 'Revenue Management',
   ARRAY['%revenue%', '%own source%', '%osr%', '%parking%']),
  (750, 'Public Administration', 'Procurement Unit',
   ARRAY['%procurement%', '%supply chain%', '%asset disposal%']),
  (760, 'Public Administration', 'Audit Unit',
   ARRAY['%audit%', '%risk management%', '%internal control%']),
  (770, 'Public Administration', 'County Administration and Decentralized Units',
   ARRAY['%public administration%', '%governance%', '%gjlo%', '%pair%', '%ward office%', '%service centre%', '%service center%', '%administrative office%', '%decentralized%', '%sub county office%', '%sub-county office%']),
  (780, 'Public Administration', 'Public Service and Performance Management',
   ARRAY['%public service%', '%performance management%', '%staff training%', '%human resource%', '%hr%']);

WITH classified_projects AS (
  SELECT
    p.project_id,
    COALESCE(rule_match.sector_name, 'Agriculture and Co-operative Development') AS sector_name,
    COALESCE(rule_match.sub_sector_name, 'Crops') AS sub_sector_name
  FROM projects p
  LEFT JOIN LATERAL (
    SELECT r.sector_name, r.sub_sector_name
    FROM _cidp_project_rules r
    WHERE lower(concat_ws(
      ' ',
      p.name,
      p.sector,
      p.ministry,
      p.state_department,
      p.implementing_agency,
      p.location::text,
      p.notes::text,
      p.data_sources::text
    )) LIKE ANY (r.patterns)
    ORDER BY r.priority
    LIMIT 1
  ) rule_match ON true
  WHERE COALESCE(p.voided, false) = false
),
resolved_projects AS (
  SELECT
    cp.project_id,
    cp.sector_name,
    cp.sub_sector_name,
    ss.id AS sub_sector_id
  FROM classified_projects cp
  JOIN sectors s
    ON lower(s.name) = lower(cp.sector_name)
   AND COALESCE(s.voided, false) = false
  JOIN sub_sectors ss
    ON ss.sector_id = s.id
   AND lower(ss.name) = lower(cp.sub_sector_name)
   AND COALESCE(ss.voided, false) = false
)
UPDATE projects p
SET
  sector = rp.sector_name,
  notes = jsonb_set(
    jsonb_set(
      COALESCE(p.notes, '{}'::jsonb),
      '{sub_sector}',
      to_jsonb(rp.sub_sector_name),
      true
    ),
    '{sub_sector_id}',
    to_jsonb(rp.sub_sector_id),
    true
  ),
  updated_at = CURRENT_TIMESTAMP
FROM resolved_projects rp
WHERE p.project_id = rp.project_id;

-- Summary: active CIDP sector/sub-sector catalogue.
SELECT
  s.name AS sector,
  COUNT(ss.id) AS active_sub_sectors
FROM sectors s
LEFT JOIN sub_sectors ss
  ON ss.sector_id = s.id
 AND COALESCE(ss.voided, false) = false
WHERE COALESCE(s.voided, false) = false
GROUP BY s.name
ORDER BY s.name;

-- Summary: active project distribution after reclassification.
SELECT
  p.sector,
  p.notes->>'sub_sector' AS sub_sector,
  COUNT(*) AS active_projects
FROM projects p
WHERE COALESCE(p.voided, false) = false
GROUP BY p.sector, p.notes->>'sub_sector'
ORDER BY p.sector, sub_sector;

COMMIT;
