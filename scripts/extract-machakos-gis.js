#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE_DIR = '/media/dev/0f890e54-6086-4dec-b0bc-b6880dbd313f6/devEx/countyerp/api.iebc';
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'frontend', 'public', 'gis', 'machakos');
const TARGET_COUNTY_NAME = 'MACHAKOS';

const sourceDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE_DIR;
const outputDir = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT_DIR;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const toFeatureCollection = (features = []) => ({
  type: 'FeatureCollection',
  features,
});

const normalizeFeature = (feature, extraProps = {}) => ({
  ...feature,
  properties: {
    ...(feature.properties || {}),
    ...extraProps,
  },
});

const main = () => {
  const countyDir = path.join(sourceDir, 'county');
  const geojsonDir = path.join(sourceDir, 'geojson');
  if (!fs.existsSync(countyDir) || !fs.existsSync(geojsonDir)) {
    throw new Error(`Expected folders not found in source: ${sourceDir}`);
  }

  const countyFiles = fs.readdirSync(countyDir).filter((f) => f.endsWith('.json'));
  let machakosCounty = null;
  for (const fileName of countyFiles) {
    const filePath = path.join(countyDir, fileName);
    const payload = readJson(filePath);
    if (String(payload?.name || '').toUpperCase() === TARGET_COUNTY_NAME) {
      machakosCounty = payload;
      break;
    }
  }

  if (!machakosCounty) {
    throw new Error(`Could not find county metadata for ${TARGET_COUNTY_NAME}`);
  }

  const countyGeoPath = path.join(sourceDir, String(machakosCounty.polygon || ''));
  const countyGeo = readJson(countyGeoPath);
  const countyFeatures = (countyGeo.features || []).map((feature) =>
    normalizeFeature(feature, {
      county_name: TARGET_COUNTY_NAME,
      county_code: machakosCounty.code || null,
      county_numeric_code: feature?.properties?.COUNTY_COD ?? null,
      source_polygon: machakosCounty.polygon || null,
    })
  );

  const constituencyLocations = machakosCounty?.region?.locations || [];
  const constituencyFeatures = [];
  for (const item of constituencyLocations) {
    if (!item?.polygon) continue;
    const polygonPath = path.join(sourceDir, item.polygon);
    if (!fs.existsSync(polygonPath)) continue;
    const fc = readJson(polygonPath);
    for (const feature of fc.features || []) {
      constituencyFeatures.push(
        normalizeFeature(feature, {
          county_name: TARGET_COUNTY_NAME,
          constituency_name: item.name || feature?.properties?.CONSTITUEN || null,
          constituency_code: item.code || null,
          registered_voters: Number(item.registered || 0),
          source_polygon: item.polygon,
        })
      );
    }
  }

  const wardFiles = fs.readdirSync(geojsonDir).filter((f) => /^ward_\d+\.geojson$/i.test(f));
  const wardFeatures = [];
  for (const fileName of wardFiles) {
    const filePath = path.join(geojsonDir, fileName);
    const fc = readJson(filePath);
    for (const feature of fc.features || []) {
      const props = feature?.properties || {};
      if (String(props.COUNTY_NAM || '').toUpperCase() !== TARGET_COUNTY_NAME) continue;
      wardFeatures.push(
        normalizeFeature(feature, {
          county_name: TARGET_COUNTY_NAME,
          ward_name: props.COUNTY_A_1 || null,
          ward_code: props.COUNTY_ASS ?? null,
          constituency_name: props.CONSTITUEN || null,
          constituency_code: props.CONST_CODE ?? null,
          source_file: fileName,
        })
      );
    }
  }

  ensureDir(outputDir);
  const countyOut = path.join(outputDir, 'machakos-county.geojson');
  const constituenciesOut = path.join(outputDir, 'machakos-constituencies.geojson');
  const wardsOut = path.join(outputDir, 'machakos-wards.geojson');
  const summaryOut = path.join(outputDir, 'machakos-gis-summary.json');

  writeJson(countyOut, toFeatureCollection(countyFeatures));
  writeJson(constituenciesOut, toFeatureCollection(constituencyFeatures));
  writeJson(wardsOut, toFeatureCollection(wardFeatures));

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceDir,
    targetCounty: TARGET_COUNTY_NAME,
    outputDir,
    stats: {
      countyFeatures: countyFeatures.length,
      constituencyFeatures: constituencyFeatures.length,
      wardFeatures: wardFeatures.length,
    },
    files: {
      county: countyOut,
      constituencies: constituenciesOut,
      wards: wardsOut,
    },
  };
  writeJson(summaryOut, summary);

  console.log('Machakos GIS bundle generated successfully.');
  console.log(JSON.stringify(summary, null, 2));
};

try {
  main();
} catch (error) {
  console.error('Failed to extract Machakos GIS bundle:', error.message);
  process.exit(1);
}
