/**
 * Fetch Machakos boundary GeoJSON, preferring the simplified asset when present.
 * Falls back to the full file so older deploys keep working.
 */
export async function fetchMachakosGeojson(baseName) {
  const simplifiedPath = `/gis/machakos/${baseName}.simplified.geojson`;
  const fullPath = `/gis/machakos/${baseName}.geojson`;
  try {
    const simplifiedRes = await fetch(simplifiedPath);
    if (simplifiedRes.ok) return simplifiedRes.json();
  } catch {
    // fall through
  }
  const fullRes = await fetch(fullPath);
  if (!fullRes.ok) {
    throw new Error(`Failed to load ${baseName} boundary file.`);
  }
  return fullRes.json();
}
