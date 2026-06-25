import { computeBoundsFromPoints, getProjectSubcountyLabel, getProjectWardLabel, normalizeSubcountyKey } from './projectMapPoint';
import { normalizeWardKey } from './projectWardKey';

/** Rough Kenya bounds for labeling coordinates far outside the country. */
export const KENYA_BOUNDS = {
  minLat: -4.8,
  maxLat: 5.5,
  minLng: 33.8,
  maxLng: 41.95,
};

function collectPolygonRings(geometry) {
  if (!geometry?.type || !geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng, ringLng: lng, ringLat: lat })));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) =>
      polygon.map((ring) => ring.map(([lng, lat]) => ({ lat, lng, ringLng: lng, ringLat: lat })))
    );
  }
  return [];
}

function pointInRing(lat, lng, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].ringLng;
    const yi = ring[i].ringLat;
    const xj = ring[j].ringLng;
    const yj = ring[j].ringLat;
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Build a checker from Machakos county GeoJSON (outer rings only).
 * @param {object} countyGeo FeatureCollection
 */
export function buildMachakosCountyChecker(countyGeo) {
  const features = countyGeo?.features || [];
  const rings = features.flatMap((feature) => collectPolygonRings(feature?.geometry));
  const outerRings = rings.length ? rings : [];

  const allPoints = outerRings.flat().map(({ lat, lng }) => ({ lat, lng }));
  const bounds = computeBoundsFromPoints(allPoints);

  const isInsideMachakos = (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || outerRings.length === 0) return true;
    return outerRings.some((ring) => pointInRing(lat, lng, ring));
  };

  const isInsideKenya = (lat, lng) =>
    lat >= KENYA_BOUNDS.minLat &&
    lat <= KENYA_BOUNDS.maxLat &&
    lng >= KENYA_BOUNDS.minLng &&
    lng <= KENYA_BOUNDS.maxLng;

  const describeCoordinateIssue = (lat, lng) => {
    if (!isInsideKenya(lat, lng)) return 'Outside Kenya';
    if (!isInsideMachakos(lat, lng)) return 'Outside Machakos County';
    return null;
  };

  return {
    bounds,
    isInsideMachakos,
    isInsideKenya,
    describeCoordinateIssue,
  };
}

export function fitGoogleMapToBounds(map, bounds, padding = 48) {
  if (!map || !bounds || !window.google?.maps) return;
  const googleBounds = new window.google.maps.LatLngBounds(
    { lat: bounds.minLat, lng: bounds.minLng },
    { lat: bounds.maxLat, lng: bounds.maxLng }
  );
  map.fitBounds(googleBounds, padding);
}

export function geometryToGooglePaths(geometry) {
  if (!geometry?.type || !geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) =>
      polygon.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })))
    );
  }
  return [];
}

/**
 * Sub-county (constituency) → ward hierarchy from Machakos ward GeoJSON, augmented with project rows.
 */
export function buildMachakosGeoHierarchy(wardGeo, projects = []) {
  const subCounties = new Map();
  const wardsBySubcounty = new Map();
  const wardToSubcounty = new Map();

  const addWard = (subKey, subLabel, wardKey, wardLabel) => {
    if (!subKey || !wardKey) return;
    subCounties.set(subKey, subLabel || subKey);
    wardToSubcounty.set(wardKey, subKey);
    if (!wardsBySubcounty.has(subKey)) wardsBySubcounty.set(subKey, new Map());
    wardsBySubcounty.get(subKey).set(wardKey, wardLabel || wardKey);
  };

  (wardGeo?.features || []).forEach((feature) => {
    const props = feature?.properties || {};
    const wardLabel = String(props.ward_name || props.COUNTY_A_1 || '').trim();
    const subLabel = String(props.constituency_name || props.CONSTITUEN || '').trim();
    addWard(normalizeSubcountyKey(subLabel), subLabel, normalizeWardKey(wardLabel), wardLabel);
  });

  (projects || []).forEach((project) => {
    const subLabel = getProjectSubcountyLabel(project);
    const wardLabel = getProjectWardLabel(project);
    addWard(normalizeSubcountyKey(subLabel), subLabel, normalizeWardKey(wardLabel), wardLabel);
  });

  return { subCounties, wardsBySubcounty, wardToSubcounty };
}

/** Ward options for a sub-county key; pass empty key for all wards in the county. */
export function getWardsForSubcounty(hierarchy, subcountyKey) {
  if (!hierarchy) return [];
  if (!subcountyKey) {
    const all = new Map();
    hierarchy.wardsBySubcounty.forEach((wardMap) => {
      wardMap.forEach((label, key) => all.set(key, label));
    });
    return [...all.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  const wardMap = hierarchy.wardsBySubcounty.get(subcountyKey) || new Map();
  return [...wardMap.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
