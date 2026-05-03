import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { InfoWindowF, MarkerF, PolygonF } from '@react-google-maps/api';
import GoogleMapComponent from '../components/gis/GoogleMapComponent';
import projectService from '../api/projectService';

const MACHAKOS_CENTER = { lat: -1.277062, lng: 37.412018 };

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\/_-]+/g, ' ')
    .replace(/\s+/g, ' ');
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const toMoney = (value) => toNumber(value).toLocaleString();
const normalizeStatus = (value) => normalizeKey(value || 'UNKNOWN');
const STATUS_COLORS = {
  COMPLETED: '#16A34A',
  IN_PROGRESS: '#2563EB',
  AT_RISK: '#DC2626',
  ON_HOLD: '#D97706',
  NOT_STARTED: '#6B7280',
  UNKNOWN: '#9CA3AF',
};
const statusToColor = (statusKey) => STATUS_COLORS[statusKey] || STATUS_COLORS.UNKNOWN;

const getProjectWardKey = (project) =>
  normalizeKey(
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

const getProjectPoint = (project) => {
  const candidates = [
    [project?.latitude, project?.longitude],
    [project?.lat, project?.lng],
    [project?.geoLat, project?.geoLon],
  ];
  for (const [latValue, lngValue] of candidates) {
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
};

const geometryToGooglePaths = (geometry) => {
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
};

function GISDashboardPage() {
  const [countyGeo, setCountyGeo] = useState(null);
  const [constituencyGeo, setConstituencyGeo] = useState(null);
  const [wardGeo, setWardGeo] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('count');
  const [showMarkers, setShowMarkers] = useState('yes');
  const [hoverWard, setHoverWard] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [mapBaseStyle, setMapBaseStyle] = useState('roadmap');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const [countyRes, constituencyRes, wardRes, projectRows] = await Promise.all([
          fetch('/gis/machakos/machakos-county.geojson'),
          fetch('/gis/machakos/machakos-constituencies.geojson'),
          fetch('/gis/machakos/machakos-wards.geojson'),
          projectService.projects.getProjects(),
        ]);

        if (!countyRes.ok || !constituencyRes.ok || !wardRes.ok) {
          throw new Error('Failed to load Machakos GIS boundary files.');
        }

        const [countyJson, constituencyJson, wardJson] = await Promise.all([
          countyRes.json(),
          constituencyRes.json(),
          wardRes.json(),
        ]);

        setCountyGeo(countyJson);
        setConstituencyGeo(constituencyJson);
        setWardGeo(wardJson);
        setProjects(Array.isArray(projectRows) ? projectRows : []);
      } catch (err) {
        setError(err?.message || 'Failed to load GIS dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const wardMetrics = useMemo(() => {
    const aggregate = new Map();
    for (const project of projects) {
      const wardKey = getProjectWardKey(project);
      if (!wardKey) continue;
      if (!aggregate.has(wardKey)) {
        aggregate.set(wardKey, { count: 0, budget: 0, disbursed: 0, statusCounts: {} });
      }
      const entry = aggregate.get(wardKey);
      entry.count += 1;
      entry.budget += toNumber(project?.costOfProject || project?.budget);
      entry.disbursed += toNumber(project?.paidOut || project?.disbursed || project?.amountPaid);
      const statusKey = normalizeStatus(project?.status);
      entry.statusCounts[statusKey] = (entry.statusCounts[statusKey] || 0) + 1;
    }
    return aggregate;
  }, [projects]);

  const maxMetric = useMemo(() => {
    let max = 0;
    wardMetrics.forEach((value) => {
      max = Math.max(max, value[metric] || 0);
    });
    return max;
  }, [wardMetrics, metric]);

  const markers = useMemo(
    () =>
      projects
        .map((project) => ({ project, point: getProjectPoint(project) }))
        .filter((item) => item.point),
    [projects]
  );

  const wardPolygons = useMemo(() => {
    const features = wardGeo?.features || [];
    return features.flatMap((feature, index) => {
      const pathsList = geometryToGooglePaths(feature.geometry);
      const wardName = feature?.properties?.ward_name || feature?.properties?.COUNTY_A_1 || `Ward ${index + 1}`;
      const wardKey = normalizeKey(wardName);
      const values = wardMetrics.get(wardKey) || { count: 0, budget: 0, disbursed: 0, statusCounts: {} };
      const dominantStatus = Object.entries(values.statusCounts || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNKNOWN';
      const fillColor = statusToColor(dominantStatus);
      return pathsList.map((paths, pathIndex) => ({
        key: `${wardName}-${index}-${pathIndex}`,
        wardName,
        wardKey,
        values,
        dominantStatus,
        fillColor,
        paths,
      }));
    });
  }, [wardGeo, wardMetrics, metric, maxMetric]);

  const constituencyPolygons = useMemo(() => {
    const features = constituencyGeo?.features || [];
    return features.flatMap((feature, index) => {
      const pathsList = geometryToGooglePaths(feature.geometry);
      return pathsList.map((paths, pathIndex) => ({
        key: `const-${index}-${pathIndex}`,
        paths,
      }));
    });
  }, [constituencyGeo]);

  const countyPolygons = useMemo(() => {
    const features = countyGeo?.features || [];
    return features.flatMap((feature, index) => {
      const pathsList = geometryToGooglePaths(feature.geometry);
      return pathsList.map((paths, pathIndex) => ({
        key: `county-${index}-${pathIndex}`,
        paths,
      }));
    });
  }, [countyGeo]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="70vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading GIS dashboard...</Typography>
      </Box>
    );
  }

  /** Status-colored ward fills hide satellite/hybrid imagery; use outlines only on aerial bases. */
  const aerialBaseMap = mapBaseStyle === 'satellite' || mapBaseStyle === 'hybrid';

  return (
    <Box sx={{ p: { xs: 1, sm: 1.5 }, pb: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5} sx={{ mb: 1 }} alignItems={{ sm: 'baseline' }} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          Machakos GIS Dashboard
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          Ward heat map · Machakos boundaries · project markers
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ columnGap: 1, rowGap: 0.75 }}
        >
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="gis-metric-label">Heat metric</InputLabel>
            <Select
              labelId="gis-metric-label"
              value={metric}
              label="Heat metric"
              onChange={(e) => setMetric(e.target.value)}
            >
              <MenuItem value="count">Project count</MenuItem>
              <MenuItem value="budget">Budget</MenuItem>
              <MenuItem value="disbursed">Disbursed</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="gis-markers-label">Markers</InputLabel>
            <Select
              labelId="gis-markers-label"
              value={showMarkers}
              label="Markers"
              onChange={(e) => setShowMarkers(e.target.value)}
            >
              <MenuItem value="yes">Show</MenuItem>
              <MenuItem value="no">Hide</MenuItem>
            </Select>
          </FormControl>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mapBaseStyle}
            onChange={(_, value) => {
              if (value) setMapBaseStyle(value);
            }}
            aria-label="Base map"
          >
            <ToggleButton value="roadmap" aria-label="Road map">
              Map
            </ToggleButton>
            <ToggleButton value="satellite" aria-label="Satellite" title="Aerial imagery">
              Satellite
            </ToggleButton>
            <ToggleButton value="hybrid" aria-label="Hybrid" title="Satellite + labels">
              Hybrid
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {projects.length} projects · {markers.length} on map
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: 'wrap' }} useFlexGap alignItems="center">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <Box key={status} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '2px', backgroundColor: color, border: '1px solid rgba(0,0,0,0.12)' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', lineHeight: 1 }}>
                {status.replace(/_/g, ' ')}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <GoogleMapComponent
          center={MACHAKOS_CENTER}
          zoom={9}
          style={{ height: '72vh', minHeight: 420, width: '100%' }}
          mapTypeId={mapBaseStyle}
          searchPlacement="above"
        >
          {countyPolygons.map((polygon) => (
            <PolygonF
              key={polygon.key}
              paths={polygon.paths}
              options={{
                strokeColor: aerialBaseMap ? '#E8F4FC' : '#1E3A8A',
                strokeOpacity: 0.95,
                strokeWeight: 2,
                fillColor: '#93C5FD',
                fillOpacity: aerialBaseMap ? 0 : 0.04,
                clickable: false,
                zIndex: 1,
              }}
            />
          ))}

          {constituencyPolygons.map((polygon) => (
            <PolygonF
              key={polygon.key}
              paths={polygon.paths}
              options={{
                strokeColor: aerialBaseMap ? '#F1F5F9' : '#6B7280',
                strokeOpacity: aerialBaseMap ? 0.75 : 0.7,
                strokeWeight: aerialBaseMap ? 1.5 : 1,
                fillOpacity: 0,
                clickable: false,
                zIndex: 2,
              }}
            />
          ))}

          {wardPolygons.map((ward) => (
            <PolygonF
              key={ward.key}
              paths={ward.paths}
              options={{
                strokeColor: aerialBaseMap ? '#FFFFFF' : '#555',
                strokeOpacity: aerialBaseMap ? 0.92 : 0.8,
                strokeWeight: aerialBaseMap ? 2 : 1,
                fillColor: ward.fillColor,
                fillOpacity: aerialBaseMap ? 0 : 0.65,
                zIndex: 3,
              }}
              onMouseOver={(event) => {
                setHoverWard({
                  wardName: ward.wardName,
                  count: ward.values.count,
                  position: {
                    lat: event?.latLng?.lat?.() ?? ward.paths?.[0]?.lat ?? MACHAKOS_CENTER.lat,
                    lng: event?.latLng?.lng?.() ?? ward.paths?.[0]?.lng ?? MACHAKOS_CENTER.lng,
                  },
                });
              }}
              onMouseOut={() => setHoverWard(null)}
              onClick={(event) => {
                setSelectedWard({
                  ...ward,
                  position: {
                    lat: event?.latLng?.lat?.() ?? ward.paths?.[0]?.lat ?? MACHAKOS_CENTER.lat,
                    lng: event?.latLng?.lng?.() ?? ward.paths?.[0]?.lng ?? MACHAKOS_CENTER.lng,
                  },
                });
              }}
            />
          ))}

          {hoverWard && (
            <InfoWindowF
              position={hoverWard.position}
              options={{ disableAutoPan: true }}
              onCloseClick={() => setHoverWard(null)}
            >
              <div>
                <strong>{hoverWard.wardName}</strong><br />
                Projects: {hoverWard.count}
              </div>
            </InfoWindowF>
          )}

          {selectedWard && (
            <InfoWindowF
              position={selectedWard.position}
              onCloseClick={() => setSelectedWard(null)}
            >
              <div>
                <strong>{selectedWard.wardName}</strong><br />
                Dominant status: {selectedWard.dominantStatus.replace(/_/g, ' ')}<br />
                Projects: {selectedWard.values.count}<br />
                Budget: {toMoney(selectedWard.values.budget)}<br />
                Disbursed: {toMoney(selectedWard.values.disbursed)}
              </div>
            </InfoWindowF>
          )}

          {showMarkers === 'yes' && markers.map(({ project, point }) => (
            <MarkerF
              key={project.id || project.projectId || `${project.projectName}-${point.lat}-${point.lng}`}
              position={{ lat: point.lat, lng: point.lng }}
              onClick={() => setSelectedProject({ project, point })}
            />
          ))}

          {selectedProject && (
            <InfoWindowF
              position={{ lat: selectedProject.point.lat, lng: selectedProject.point.lng }}
              onCloseClick={() => setSelectedProject(null)}
            >
              <div>
                <strong>{selectedProject.project.projectName || 'Project'}</strong><br />
                Status: {selectedProject.project.status || '-'}<br />
                Budget: {toMoney(selectedProject.project.costOfProject || selectedProject.project.budget)}
              </div>
            </InfoWindowF>
          )}
        </GoogleMapComponent>
      </Paper>
    </Box>
  );
}

export default GISDashboardPage;
