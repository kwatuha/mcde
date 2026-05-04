/**
 * Normalizes ward labels for matching project rows to GIS boundaries (same rules as GIS dashboard).
 */
export const normalizeWardKey = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[/_-]+/g, ' ')
    .replace(/\s+/g, ' ');

/**
 * Ward key for a project row — first comma-separated ward token, same source fields as GIS aggregation.
 */
export function getProjectWardKey(project) {
  return normalizeWardKey(
    String(
      project?.wardName ||
        project?.wardNames ||
        project?.ward ||
        project?.ward_name ||
        project?.countyAssName ||
        project?.countyA1 ||
        project?.location?.ward ||
        ''
    )
      .split(',')[0]
      .trim()
  );
}
