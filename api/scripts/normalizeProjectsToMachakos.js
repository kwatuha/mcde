#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pool = require('../config/db');

const WARDS_FILE = path.resolve(__dirname, '..', '..', 'frontend', 'public', 'gis', 'machakos', 'machakos-wards.geojson');
const FALLBACK_WARDS = [
  { wardName: 'MUMBUNI NORTH', constituencyName: 'MACHAKOS TOWN', lat: -1.5044, lng: 37.2809 },
  { wardName: 'KALAMA', constituencyName: 'MACHAKOS TOWN', lat: -1.5264, lng: 37.3553 },
  { wardName: 'MUA', constituencyName: 'MACHAKOS TOWN', lat: -1.3591, lng: 37.2120 },
  { wardName: 'MASII', constituencyName: 'MWALA', lat: -1.3727, lng: 37.5201 },
  { wardName: 'WAMUNYU', constituencyName: 'MWALA', lat: -1.3127, lng: 37.5526 },
  { wardName: 'KIBAUNI', constituencyName: 'MWALA', lat: -1.4512, lng: 37.6594 },
  { wardName: 'KITHIMANI', constituencyName: 'YATTA', lat: -1.1627, lng: 37.6211 },
  { wardName: 'NDALANI', constituencyName: 'YATTA', lat: -1.1020, lng: 37.5850 },
  { wardName: 'KINANIE', constituencyName: 'MAVOKO', lat: -1.4512, lng: 37.0628 },
  { wardName: 'MUTHWANI', constituencyName: 'MAVOKO', lat: -1.4310, lng: 37.0890 },
  { wardName: 'KANGUNDO NORTH', constituencyName: 'KANGUNDO', lat: -1.3065, lng: 37.3524 },
  { wardName: 'KANGUNDO CENTRAL', constituencyName: 'KANGUNDO', lat: -1.3087, lng: 37.3382 },
  { wardName: 'KATHIANI CENTRAL', constituencyName: 'KATHIANI', lat: -1.4210, lng: 37.2968 },
  { wardName: 'MITABONI', constituencyName: 'KATHIANI', lat: -1.4528, lng: 37.2275 },
  { wardName: 'KYELENI', constituencyName: 'MATUNGULU', lat: -1.2382, lng: 37.3021 },
  { wardName: 'TALA', constituencyName: 'MATUNGULU', lat: -1.2885, lng: 37.3661 },
  { wardName: 'KIVAA', constituencyName: 'MASINGA', lat: -0.9449, lng: 37.6070 },
  { wardName: 'EKALAKALA', constituencyName: 'MASINGA', lat: -1.0250, lng: 37.6840 },
];

const NAME_TEMPLATES = [
  'Ward Access Road Improvement',
  'ECDE Classroom Construction',
  'Health Dispensary Upgrade',
  'Market Drainage and Paving Works',
  'Borehole Drilling and Water Kiosk',
  'Solar Street Lighting Installation',
  'Cattle Dip Rehabilitation',
  'Ward Sports Ground Modernization',
  'Community ICT Hub Setup',
  'Maternity Wing Expansion',
  'Ward Solid Waste Collection Points',
  'Public Toilet and Ablution Block',
  'Smallholder Irrigation Scheme',
  'Youth Vocational Training Workshop',
  'Bus Park and Stage Upgrade',
  'Ward Office and Service Centre',
  'Primary School Sanitation Upgrade',
  'Rainwater Harvesting Infrastructure',
  'Public Health Laboratory Renovation',
  'Ward Footbridge Construction',
];

const averagePoint = (ring = []) => {
  if (!Array.isArray(ring) || ring.length === 0) return { lat: null, lng: null };
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  for (const coord of ring) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    sumLng += Number(coord[0]);
    sumLat += Number(coord[1]);
    count += 1;
  }
  if (!count) return { lat: null, lng: null };
  return {
    lat: Number((sumLat / count).toFixed(6)),
    lng: Number((sumLng / count).toFixed(6)),
  };
};

const loadWardCatalog = () => {
  if (!fs.existsSync(WARDS_FILE)) {
    return FALLBACK_WARDS;
  }
  const raw = fs.readFileSync(WARDS_FILE, 'utf8');
  const geo = JSON.parse(raw);
  const catalog = [];
  for (const feature of geo.features || []) {
    const props = feature.properties || {};
    const geometry = feature.geometry || {};
    const ring = geometry.type === 'Polygon'
      ? geometry.coordinates?.[0] || []
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates?.[0]?.[0] || []
        : [];
    const point = averagePoint(ring);
    if (!props.ward_name || !props.constituency_name || point.lat == null || point.lng == null) continue;
    catalog.push({
      wardName: String(props.ward_name).trim(),
      constituencyName: String(props.constituency_name).trim(),
      lat: point.lat,
      lng: point.lng,
    });
  }
  if (!catalog.length) return FALLBACK_WARDS;
  return catalog;
};

const pickTemplate = (index) => NAME_TEMPLATES[index % NAME_TEMPLATES.length];

async function run() {
  const wardCatalog = loadWardCatalog();
  const projectsRes = await pool.query(
    'SELECT project_id, name, location FROM projects WHERE voided = false ORDER BY project_id'
  );
  const projects = projectsRes.rows || [];
  if (!projects.length) {
    console.log('No active projects found.');
    return;
  }

  await pool.query('BEGIN');
  try {
    for (let i = 0; i < projects.length; i += 1) {
      const project = projects[i];
      const ward = wardCatalog[i % wardCatalog.length];
      const template = pickTemplate(i);
      const newName = `Machakos ${template} - ${ward.wardName}`;
      const existingLocation = typeof project.location === 'object' && project.location ? project.location : {};
      const updatedLocation = {
        ...existingLocation,
        county: 'MACHAKOS',
        constituency: ward.constituencyName,
        ward: ward.wardName,
        geocoordinates: {
          ...(existingLocation.geocoordinates || {}),
          lat: ward.lat,
          lng: ward.lng,
        },
      };

      await pool.query(
        `
          UPDATE projects
          SET
            name = $1,
            location = $2::jsonb,
            updated_at = CURRENT_TIMESTAMP
          WHERE project_id = $3
        `,
        [newName, JSON.stringify(updatedLocation), project.project_id]
      );
    }

    await pool.query('COMMIT');
    console.log(`Normalized ${projects.length} projects to Machakos sample naming and locations.`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

run()
  .catch((error) => {
    console.error('Failed to normalize projects:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (_error) {
      // ignore
    }
  });
