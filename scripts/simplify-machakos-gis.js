#!/usr/bin/env node
/**
 * Build simplified Machakos boundary GeoJSON for fast GIS dashboards.
 *
 * Input (full IEBC extracts):
 *   frontend/public/gis/machakos/machakos-{wards,county,constituencies}.geojson
 * Output:
 *   frontend/public/gis/machakos/machakos-*.simplified.geojson
 *
 * Usage: node scripts/simplify-machakos-gis.js
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'frontend', 'public', 'gis', 'machakos');

function dist2(p, a, b) {
  const x = p[0];
  const y = p[1];
  const x1 = a[0];
  const y1 = a[1];
  const x2 = b[0];
  const y2 = b[1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const ex = x - x1;
    const ey = y - y1;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const ex = x - px;
  const ey = y - py;
  return ex * ex + ey * ey;
}

function douglasPeucker(points, epsilon) {
  if (!points || points.length < 3) return points;
  const eps2 = epsilon * epsilon;
  let maxD = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i += 1) {
    const d = dist2(points[i], points[0], points[end]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps2) {
    const left = douglasPeucker(points.slice(0, idx + 1), epsilon);
    const right = douglasPeucker(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function simplifyRing(ring, epsilon) {
  if (!Array.isArray(ring) || ring.length < 4) return ring;
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const open = closed ? ring.slice(0, -1) : ring.slice();
  let simplified = douglasPeucker(open, epsilon);
  if (simplified.length < 3) simplified = open.slice(0, 3);
  return simplified.concat([simplified[0]]);
}

function simplifyCoords(coords, type, epsilon) {
  if (type === 'Polygon') {
    return coords.map((ring, i) => simplifyRing(ring, i === 0 ? epsilon : epsilon * 0.5));
  }
  if (type === 'MultiPolygon') {
    return coords.map((poly) =>
      poly.map((ring, i) => simplifyRing(ring, i === 0 ? epsilon : epsilon * 0.5))
    );
  }
  return coords;
}

function simplifyFeatureCollection(fc, epsilon) {
  return {
    type: 'FeatureCollection',
    features: (fc.features || []).map((f) => {
      if (!f.geometry) return f;
      return {
        type: 'Feature',
        properties: f.properties || {},
        geometry: {
          type: f.geometry.type,
          coordinates: simplifyCoords(f.geometry.coordinates, f.geometry.type, epsilon),
        },
      };
    }),
  };
}

function countVerts(geom) {
  let n = 0;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      n += 1;
      return;
    }
    c.forEach(walk);
  };
  walk(geom.coordinates);
  return n;
}

const FILES = [
  ['machakos-wards.geojson', 'machakos-wards.simplified.geojson', 0.00035],
  ['machakos-county.geojson', 'machakos-county.simplified.geojson', 0.00025],
  ['machakos-constituencies.geojson', 'machakos-constituencies.simplified.geojson', 0.0003],
];

for (const [src, dest, eps] of FILES) {
  const srcPath = path.join(OUT_DIR, src);
  if (!fs.existsSync(srcPath)) {
    console.warn(`skip missing ${srcPath}`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  let before = 0;
  raw.features.forEach((f) => {
    before += countVerts(f.geometry);
  });
  const simplified = simplifyFeatureCollection(raw, eps);
  let after = 0;
  simplified.features.forEach((f) => {
    after += countVerts(f.geometry);
  });
  const outPath = path.join(OUT_DIR, dest);
  fs.writeFileSync(outPath, JSON.stringify(simplified));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`${dest}: verts ${before}→${after}, ${kb} KB`);
}
