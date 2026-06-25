/**
 * Status-colored circular map markers for Google Maps.
 * Uses numeric path 0 (google.maps.SymbolPath.CIRCLE) so icons work without
 * reading window.google at render time — avoids default red pin fallback on deploy.
 */
const GOOGLE_CIRCLE_PATH = 0;

export function buildStatusDotMarkerIcon(fillColor, options = {}) {
  const {
    scale = 8,
    strokeColor = '#ffffff',
    strokeWeight = 1.5,
    fillOpacity = 1,
  } = options;

  return {
    path: GOOGLE_CIRCLE_PATH,
    fillColor: fillColor || '#757575',
    fillOpacity,
    strokeColor,
    strokeWeight,
    scale,
  };
}

export function buildErrorDotMarkerIcon(options = {}) {
  return buildStatusDotMarkerIcon('#DC2626', {
    scale: 10,
    strokeWeight: 2,
    ...options,
  });
}
