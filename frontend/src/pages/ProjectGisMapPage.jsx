import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { InfoWindowF, MarkerF, PolygonF } from '@react-google-maps/api';
import { useNavigate } from 'react-router-dom';
import GoogleMapComponent from '../components/gis/GoogleMapComponent';
import projectService from '../api/projectService';
import { ROUTES } from '../configs/appConfig';
import { getProjectStatusBackgroundColor } from '../utils/projectStatusColors';
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import { normalizeWardKey } from '../utils/projectWardKey';
import {
  buildMachakosCountyChecker,
  fitGoogleMapToBounds,
  geometryToGooglePaths,
} from '../utils/machakosCountyGeo';
import {
  computeBoundsFromPoints,
  getProjectDepartmentLabel,
  getProjectFinancialYearLabel,
  getProjectMapPoint,
  getProjectSectorLabel,
  getProjectSubcountyLabel,
  getProjectWardLabel,
  normalizeDepartmentKey,
  normalizeSubcountyKey,
  projectMatchesSubcountyFilter,
  projectMatchesWardFilter,
  toMoney,
} from '../utils/projectMapPoint';
import { buildErrorDotMarkerIcon, buildStatusDotMarkerIcon } from '../utils/mapMarkerIcons';

const MACHAKOS_CENTER = { lat: -1.277062, lng: 37.412018 };
const DEFAULT_ZOOM = 9;

function ProjectGisMapPage() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [activeTab, setActiveTab] = useState('map');
  const [projects, setProjects] = useState([]);
  const [wardGeo, setWardGeo] = useState(null);
  const [countyGeo, setCountyGeo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [mapBaseStyle, setMapBaseStyle] = useState('roadmap');
  const [autoZoom, setAutoZoom] = useState(true);
  const [errorSearch, setErrorSearch] = useState('');
  const [previewErrorMarker, setPreviewErrorMarker] = useState(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    sector: '',
    department: '',
    financialYear: '',
    subCounty: '',
    ward: '',
    coordinatesOnly: 'yes',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [countyRes, wardRes, projectRows] = await Promise.all([
          fetch('/gis/machakos/machakos-county.geojson'),
          fetch('/gis/machakos/machakos-wards.geojson'),
          projectService.projects.getProjects({ limit: 5000 }),
        ]);
        if (!countyRes.ok || !wardRes.ok) {
          throw new Error('Failed to load Machakos boundary files.');
        }
        const [countyJson, wardJson] = await Promise.all([countyRes.json(), wardRes.json()]);
        setCountyGeo(countyJson);
        setWardGeo(wardJson);
        setProjects(Array.isArray(projectRows) ? projectRows : []);
      } catch (err) {
        setError(err?.message || 'Failed to load project GIS data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const countyChecker = useMemo(
    () => (countyGeo ? buildMachakosCountyChecker(countyGeo) : null),
    [countyGeo]
  );

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

  const gisErrorProjects = useMemo(() => {
    if (!countyChecker) return [];
    return projects
      .map((project) => {
        const point = getProjectMapPoint(project);
        if (!point) return null;
        const issue = countyChecker.describeCoordinateIssue(point.lat, point.lng);
        if (!issue) return null;
        return {
          project,
          point,
          issue,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.project?.projectName || '').localeCompare(String(b.project?.projectName || '')));
  }, [projects, countyChecker]);

  const filteredGisErrors = useMemo(() => {
    const q = String(errorSearch || '').trim().toLowerCase();
    if (!q) return gisErrorProjects;
    return gisErrorProjects.filter(({ project, issue, point }) => {
      const haystack = [
        project?.projectName,
        project?.id,
        issue,
        point?.lat,
        point?.lng,
        getProjectWardLabel(project),
        getProjectDepartmentLabel(project),
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  }, [gisErrorProjects, errorSearch]);

  const filterOptions = useMemo(() => {
    const statuses = new Set();
    const sectors = new Set();
    const departments = new Set();
    const financialYears = new Set();
    const subCounties = new Map();
    const wards = new Map();

    projects.forEach((project) => {
      const status = normalizeProjectStatus(project?.status || project?.Status || '');
      if (status) statuses.add(status);
      const sector = getProjectSectorLabel(project);
      if (sector) sectors.add(sector);
      const dept = getProjectDepartmentLabel(project);
      if (dept) departments.add(dept);
      const fy = getProjectFinancialYearLabel(project);
      if (fy) financialYears.add(fy);

      const sub = getProjectSubcountyLabel(project);
      if (sub) subCounties.set(normalizeSubcountyKey(sub), sub);

      const ward = getProjectWardLabel(project);
      const wardKey = normalizeWardKey(ward);
      if (wardKey) wards.set(wardKey, ward);
    });

    const sortAlpha = (a, b) => a.localeCompare(b);
    return {
      statuses: [...statuses].sort(sortAlpha),
      sectors: [...sectors].sort(sortAlpha),
      departments: [...departments].sort(sortAlpha),
      financialYears: [...financialYears].sort(sortAlpha),
      subCounties: [...subCounties.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)),
      wards: [...wards.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const search = String(filters.search || '').trim().toLowerCase();
    return projects.filter((project) => {
      const status = normalizeProjectStatus(project?.status || project?.Status || '');
      const sector = getProjectSectorLabel(project);
      const dept = getProjectDepartmentLabel(project);
      const fy = getProjectFinancialYearLabel(project);
      const point = getProjectMapPoint(project);

      if (filters.status && status !== filters.status) return false;
      if (filters.sector && sector !== filters.sector) return false;
      if (filters.department && normalizeDepartmentKey(dept) !== normalizeDepartmentKey(filters.department)) return false;
      if (filters.financialYear && fy !== filters.financialYear) return false;
      if (filters.subCounty && !projectMatchesSubcountyFilter(project, filters.subCounty)) return false;
      if (filters.ward && !projectMatchesWardFilter(project, filters.ward)) return false;
      if (filters.coordinatesOnly === 'yes' && !point) return false;

      if (search) {
        const haystack = [
          project?.projectName,
          project?.name,
          project?.id,
          dept,
          sector,
          getProjectSubcountyLabel(project),
          getProjectWardLabel(project),
          project?.tenderContractNo,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [projects, filters]);

  const mapMarkers = useMemo(
    () =>
      filteredProjects
        .map((project) => {
          const point = getProjectMapPoint(project);
          if (!point) return null;
          if (countyChecker && !countyChecker.isInsideMachakos(point.lat, point.lng)) return null;
          return { project, point };
        })
        .filter(Boolean),
    [filteredProjects, countyChecker]
  );

  const wardHighlightPolygons = useMemo(() => {
    if (!wardGeo?.features?.length || !filters.ward) return [];
    return wardGeo.features.flatMap((feature, index) => {
      const wardName = feature?.properties?.ward_name || feature?.properties?.COUNTY_A_1 || '';
      if (normalizeWardKey(wardName) !== filters.ward) return [];
      const pathsList = geometryToGooglePaths(feature.geometry);
      return pathsList.map((paths, pathIndex) => ({
        key: `ward-highlight-${index}-${pathIndex}`,
        paths,
      }));
    });
  }, [wardGeo, filters.ward]);

  const stats = useMemo(() => {
    const withCoords = projects.filter((p) => getProjectMapPoint(p)).length;
    const validInCounty = projects.filter((p) => {
      const point = getProjectMapPoint(p);
      return point && countyChecker?.isInsideMachakos(point.lat, point.lng);
    }).length;
    return {
      total: projects.length,
      withCoords,
      validInCounty,
      gisErrors: gisErrorProjects.length,
      filtered: filteredProjects.length,
      onMap: mapMarkers.length,
      missingCoords: filteredProjects.length - mapMarkers.length,
    };
  }, [projects, filteredProjects, mapMarkers, countyChecker, gisErrorProjects.length]);

  const fitMachakosCounty = useCallback(() => {
    if (!countyChecker?.bounds) return;
    fitGoogleMapToBounds(mapRef.current, countyChecker.bounds, 40);
  }, [countyChecker]);

  const fitMapToResults = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    if (mapMarkers.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      mapMarkers.forEach(({ point }) => bounds.extend(point));
      map.fitBounds(bounds, 56);
      return;
    }

    if (wardHighlightPolygons.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      wardHighlightPolygons.forEach((poly) => {
        (poly.paths || []).forEach((p) => bounds.extend(p));
      });
      map.fitBounds(bounds, 56);
      return;
    }

    if (filters.subCounty) {
      const subProjects = filteredProjects.filter((p) => projectMatchesSubcountyFilter(p, filters.subCounty));
      const subPoints = subProjects
        .map((p) => getProjectMapPoint(p))
        .filter((point) => point && countyChecker?.isInsideMachakos(point.lat, point.lng));
      const subBounds = computeBoundsFromPoints(subPoints);
      if (subBounds) {
        fitGoogleMapToBounds(map, subBounds, 56);
        return;
      }
    }

    fitMachakosCounty();
  }, [mapMarkers, wardHighlightPolygons, filters.subCounty, filteredProjects, countyChecker, fitMachakosCounty]);

  const zoomToGisError = useCallback((entry) => {
    if (!entry?.point || !mapRef.current || !window.google?.maps) return;
    setPreviewErrorMarker(entry);
    setActiveTab('map');
    setAutoZoom(false);
    mapRef.current.setCenter(entry.point);
    mapRef.current.setZoom(entry.issue === 'Outside Kenya' ? 5 : 14);
    setSelectedProject(entry);
  }, []);

  useEffect(() => {
    if (!autoZoom || loading || activeTab !== 'map') return;
    const timer = window.setTimeout(() => fitMapToResults(), 200);
    return () => window.clearTimeout(timer);
  }, [autoZoom, loading, activeTab, fitMapToResults, filters]);

  const handleMapCreated = useCallback((map) => {
    mapRef.current = map;
    setMapsReady(true);
    if (countyChecker?.bounds) {
      window.setTimeout(() => fitGoogleMapToBounds(map, countyChecker.bounds, 40), 100);
    }
  }, [countyChecker]);

  const clearFilters = () => {
    setFilters({
      search: '',
      status: '',
      sector: '',
      department: '',
      financialYear: '',
      subCounty: '',
      ward: '',
      coordinatesOnly: 'yes',
    });
  };

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'coordinatesOnly') return value !== 'yes';
    return Boolean(value);
  }).length;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="70vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading project locations...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 1.5 }, pb: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5} sx={{ mb: 1 }} alignItems={{ sm: 'baseline' }} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          Project GIS Map
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          Machakos project pins · filter by region · review coordinate errors
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ mb: 1 }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 42 }}
        >
          <Tab value="map" label="Map" sx={{ minHeight: 42, py: 0.5 }} />
          <Tab
            value="errors"
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <span>GIS Errors</span>
                {gisErrorProjects.length > 0 && (
                  <Chip size="small" color="error" label={gisErrorProjects.length} sx={{ height: 20, fontSize: '0.7rem' }} />
                )}
              </Stack>
            }
            sx={{ minHeight: 42, py: 0.5 }}
          />
        </Tabs>

        {activeTab === 'map' && (
          <Box sx={{ p: 1 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                <TextField
                  size="small"
                  label="Search projects"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  sx={{ minWidth: 200, flex: '1 1 220px' }}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Status</InputLabel>
                  <Select label="Status" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                    <MenuItem value="">All</MenuItem>
                    {filterOptions.statuses.map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Sector</InputLabel>
                  <Select label="Sector" value={filters.sector} onChange={(e) => setFilters((prev) => ({ ...prev, sector: e.target.value }))}>
                    <MenuItem value="">All</MenuItem>
                    {filterOptions.sectors.map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Department</InputLabel>
                  <Select label="Department" value={filters.department} onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))}>
                    <MenuItem value="">All</MenuItem>
                    {filterOptions.departments.map((d) => (
                      <MenuItem key={d} value={d}>{d}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Fin. year</InputLabel>
                  <Select label="Fin. year" value={filters.financialYear} onChange={(e) => setFilters((prev) => ({ ...prev, financialYear: e.target.value }))}>
                    <MenuItem value="">All</MenuItem>
                    {filterOptions.financialYears.map((fy) => (
                      <MenuItem key={fy} value={fy}>{fy}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Sub-county</InputLabel>
                  <Select
                    label="Sub-county"
                    value={filters.subCounty}
                    onChange={(e) => setFilters((prev) => ({ ...prev, subCounty: e.target.value, ward: '' }))}
                  >
                    <MenuItem value="">All</MenuItem>
                    {filterOptions.subCounties.map((sc) => (
                      <MenuItem key={sc.key} value={sc.key}>{sc.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Ward</InputLabel>
                  <Select label="Ward" value={filters.ward} onChange={(e) => setFilters((prev) => ({ ...prev, ward: e.target.value }))}>
                    <MenuItem value="">All</MenuItem>
                    {filterOptions.wards.map((w) => (
                      <MenuItem key={w.key} value={w.key}>{w.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Pins</InputLabel>
                  <Select
                    label="Pins"
                    value={filters.coordinatesOnly}
                    onChange={(e) => setFilters((prev) => ({ ...prev, coordinatesOnly: e.target.value }))}
                  >
                    <MenuItem value="yes">With coordinates only</MenuItem>
                    <MenuItem value="no">Include all matches</MenuItem>
                  </Select>
                </FormControl>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={mapBaseStyle}
                  onChange={(_, value) => {
                    if (value) setMapBaseStyle(value);
                  }}
                >
                  <ToggleButton value="roadmap">Map</ToggleButton>
                  <ToggleButton value="satellite">Satellite</ToggleButton>
                  <ToggleButton value="hybrid">Hybrid</ToggleButton>
                </ToggleButtonGroup>
                <Button size="small" variant="outlined" onClick={fitMapToResults}>
                  Zoom to results
                </Button>
                <Button size="small" variant="outlined" onClick={fitMachakosCounty}>
                  Zoom to Machakos
                </Button>
                <Button size="small" variant="text" onClick={clearFilters} disabled={activeFilterCount === 0}>
                  Clear filters
                </Button>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                <Chip size="small" label={`${stats.onMap} pins in Machakos`} color="primary" variant="outlined" />
                <Chip size="small" label={`${stats.validInCounty} valid coordinates`} />
                {stats.gisErrors > 0 && (
                  <Chip
                    size="small"
                    color="error"
                    label={`${stats.gisErrors} GIS errors`}
                    onClick={() => setActiveTab('errors')}
                    sx={{ cursor: 'pointer' }}
                  />
                )}
                <Chip
                  size="small"
                  label={autoZoom ? 'Auto-zoom on' : 'Auto-zoom off'}
                  onClick={() => setAutoZoom((v) => !v)}
                  variant={autoZoom ? 'filled' : 'outlined'}
                  sx={{ cursor: 'pointer' }}
                />
              </Stack>
            </Stack>
          </Box>
        )}

        {activeTab === 'errors' && (
          <Box sx={{ p: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Projects with coordinates that fall outside Machakos County boundaries (or outside Kenya). Fix these in the project location / map editor.
            </Typography>
            <TextField
              size="small"
              fullWidth
              label="Search GIS errors"
              value={errorSearch}
              onChange={(e) => setErrorSearch(e.target.value)}
              sx={{ mb: 1, maxWidth: 420 }}
            />
          </Box>
        )}
      </Paper>

      {activeTab === 'map' ? (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <GoogleMapComponent
            center={MACHAKOS_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: '72vh', minHeight: 420, width: '100%' }}
            mapTypeId={mapBaseStyle}
            searchPlacement="above"
            onCreated={handleMapCreated}
          >
            {countyPolygons.map((polygon) => (
              <PolygonF
                key={polygon.key}
                paths={polygon.paths}
                options={{
                  strokeColor: '#1E3A8A',
                  strokeOpacity: 0.85,
                  strokeWeight: 2,
                  fillColor: '#93C5FD',
                  fillOpacity: 0.06,
                  clickable: false,
                  zIndex: 1,
                }}
              />
            ))}

            {wardHighlightPolygons.map((polygon) => (
              <PolygonF
                key={polygon.key}
                paths={polygon.paths}
                options={{
                  strokeColor: '#2563EB',
                  strokeOpacity: 0.9,
                  strokeWeight: 2,
                  fillColor: '#93C5FD',
                  fillOpacity: 0.2,
                  clickable: false,
                  zIndex: 2,
                }}
              />
            ))}

            {mapsReady && mapMarkers.map(({ project, point }) => {
              const status = project?.status || project?.Status || 'Unknown';
              const fillColor = getProjectStatusBackgroundColor(status);
              return (
                <MarkerF
                  key={project.id || project.projectId || `${project.projectName}-${point.lat}-${point.lng}`}
                  position={point}
                  onClick={() => setSelectedProject({ project, point })}
                  icon={buildStatusDotMarkerIcon(fillColor)}
                />
              );
            })}

            {mapsReady && previewErrorMarker?.point && (
              <MarkerF
                key={`gis-error-preview-${previewErrorMarker.project?.id}`}
                position={previewErrorMarker.point}
                onClick={() => setSelectedProject(previewErrorMarker)}
                icon={buildErrorDotMarkerIcon()}
              />
            )}

            {selectedProject && (
              <InfoWindowF
                position={selectedProject.point}
                onCloseClick={() => setSelectedProject(null)}
              >
                <div style={{ maxWidth: 260 }}>
                  <strong>{selectedProject.project.projectName || 'Project'}</strong>
                  <br />
                  Status: {selectedProject.project.status || selectedProject.project.Status || '—'}
                  <br />
                  Department: {getProjectDepartmentLabel(selectedProject.project) || '—'}
                  <br />
                  Ward: {getProjectWardLabel(selectedProject.project) || '—'}
                  <br />
                  {selectedProject.issue && (
                    <>
                      <strong style={{ color: '#DC2626' }}>{selectedProject.issue}</strong>
                      <br />
                    </>
                  )}
                  Lat/Lng: {selectedProject.point.lat}, {selectedProject.point.lng}
                  <br />
                  Budget: KES {toMoney(selectedProject.project.costOfProject || selectedProject.project.budget)}
                  <br />
                  <Button
                    size="small"
                    sx={{ mt: 0.75, p: 0 }}
                    onClick={() => navigate(`${ROUTES.PROJECTS}/${selectedProject.project.id}`)}
                  >
                    Open project
                  </Button>
                </div>
              </InfoWindowF>
            )}
          </GoogleMapComponent>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          {filteredGisErrors.length === 0 ? (
            <Alert severity="success" sx={{ m: 2 }}>
              No coordinate errors found. All geolocated projects are within Machakos County.
            </Alert>
          ) : (
            <TableContainer sx={{ maxHeight: '72vh' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Project</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Issue</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Latitude</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Longitude</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Ward (record)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredGisErrors.map(({ project, point, issue }) => (
                    <TableRow key={project.id || project.projectId} hover>
                      <TableCell>{project.id}</TableCell>
                      <TableCell sx={{ minWidth: 220, fontWeight: 600 }}>{project.projectName || '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" color="error" label={issue} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{point.lat}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{point.lng}</TableCell>
                      <TableCell>{getProjectWardLabel(project) || '—'}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button size="small" onClick={() => zoomToGisError({ project, point })}>
                            View on map
                          </Button>
                          <Button size="small" onClick={() => navigate(`${ROUTES.PROJECTS}/${project.id}`)}>
                            Open
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}
    </Box>
  );
}

export default ProjectGisMapPage;
