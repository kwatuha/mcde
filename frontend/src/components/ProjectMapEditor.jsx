import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, Paper, TextField, ToggleButton,
  ToggleButtonGroup, Alert, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, FormHelperText, Stack, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Snackbar
} from '@mui/material';
import { Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon, Close as CloseIcon, LocationOn as LocationOnIcon, Map as MapIcon, Satellite as SatelliteIcon } from '@mui/icons-material';
import GoogleMapComponent from './gis/GoogleMapComponent';
import { MarkerF, PolylineF, PolygonF } from '@react-google-maps/api';
import apiService from '../api';
import { INITIAL_MAP_POSITION } from '../configs/appConfig';
import { normalizeWardKey } from '../utils/projectWardKey';

// Helper function for safe date formatting
const formatDateSafe = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'N/A';
    }
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', dateString, error);
    return 'N/A';
  }
};

const MACHAKOS_CENTER = { lat: -1.277062, lng: 37.412018 };

const flattenGeometryCoordinates = (geometry) => {
  if (!geometry?.type || !geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates.flat(1);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2);
  return [];
};

const getWardCentroidFromFeature = (feature) => {
  const coords = flattenGeometryCoordinates(feature?.geometry).filter(
    (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))
  );
  if (!coords.length) return null;
  const lng = coords.reduce((sum, c) => sum + Number(c[0]), 0) / coords.length;
  const lat = coords.reduce((sum, c) => sum + Number(c[1]), 0) / coords.length;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const makeMarkerIcon = (url, size = 32) => {
  if (typeof window !== 'undefined' && window.google?.maps?.Size) {
    return { url, scaledSize: new window.google.maps.Size(size, size) };
  }
  // Safe fallback before Google Maps SDK is ready.
  return { url };
};

const ProjectMapEditor = ({ projectId, projectName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  
  const [mapData, setMapData] = useState(null);
  const [projectGeoDetails, setProjectGeoDetails] = useState({ constituency: '', ward: '' });
  const [geometryType, setGeometryType] = useState('Point');
  const [coordinates, setCoordinates] = useState({
    latitude: '',
    longitude: '',
    multiPointData: ''
  });

  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const polygonRef = useRef(null);
  const latestEditedPathRef = useRef(null); // Store the latest edited path
  const mapCenterRef = useRef(null); // Store latest map center for onCreated callback
  const mapZoomRef = useRef(null); // Store latest map zoom for onCreated callback
  const machakosWardsGeoRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [tempMarkerPosition, setTempMarkerPosition] = useState(null);
  const [markerIcon, setMarkerIcon] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: INITIAL_MAP_POSITION[0], lng: INITIAL_MAP_POSITION[1] });
  const [mapZoom, setMapZoom] = useState(6);
  const [mapHeight, setMapHeight] = useState(600); // Default height in pixels
  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' | 'satellite' | 'hybrid'
  const [selectedPointIndex, setSelectedPointIndex] = useState(null); // Index of selected point for editing
  const [editingPoints, setEditingPoints] = useState(false); // Whether we're in point editing mode

  // Calculate map height based on viewport when modal opens
  useEffect(() => {
    if (mapModalOpen) {
      // Calculate height: 90vh - 140px (dialog title + padding)
      const calculatedHeight = Math.max(600, window.innerHeight * 0.9 - 140);
      setMapHeight(calculatedHeight);
    }
  }, [mapModalOpen]);

  // Fetch existing map data
  useEffect(() => {
    const fetchMapData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiService.projectMaps.getProjectMap(projectId);
        if (data && data.map) {
          const geoJson = typeof data.map === 'string' ? JSON.parse(data.map) : data.map;
          setMapData(data);
          
          // Parse GeoJSON to extract coordinates
          if (geoJson.features && geoJson.features.length > 0) {
            const feature = geoJson.features[0];
            const { type, coordinates: coords } = feature.geometry;
            
            setGeometryType(type === 'MultiPoint' ? 'MultiPoint' : type === 'LineString' ? 'LineString' : type === 'Polygon' ? 'Polygon' : 'Point');
            
            if (type === 'Point') {
              setCoordinates({
                latitude: coords[1].toFixed(6),
                longitude: coords[0].toFixed(6),
                multiPointData: ''
              });
              setMapCenter({ lat: coords[1], lng: coords[0] });
              setMapZoom(15);
            } else if (type === 'Polygon') {
              // Polygon coordinates are nested: [[[lng, lat], ...]]
              // Extract the outer ring (first array)
              const outerRing = coords[0] || [];
              const multiPointStr = outerRing.map(coord => {
                return `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`;
              }).join('\n');
              setCoordinates({
                latitude: '',
                longitude: '',
                multiPointData: multiPointStr
              });
              
              // Calculate center and zoom for polygon
              if (outerRing.length > 0) {
                const lats = outerRing.map(c => c[1]);
                const lngs = outerRing.map(c => c[0]);
                const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
                const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                setMapCenter({ lat: centerLat, lng: centerLng });
                setMapZoom(13);
              }
            } else {
              // For MultiPoint, LineString
              const multiPointStr = coords.map(coord => {
                return `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`;
              }).join('\n');
              setCoordinates({
                latitude: '',
                longitude: '',
                multiPointData: multiPointStr
              });
              
              // Calculate center and zoom for LineString/MultiPoint
              if (coords.length > 0) {
                const lats = coords.map(c => c[1]);
                const lngs = coords.map(c => c[0]);
                const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
                const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                setMapCenter({ lat: centerLat, lng: centerLng });
                // Use appropriate zoom based on spread of coordinates
                const latRange = Math.max(...lats) - Math.min(...lats);
                const lngRange = Math.max(...lngs) - Math.min(...lngs);
                const maxRange = Math.max(latRange, lngRange);
                // Adjust zoom based on coordinate spread (smaller spread = higher zoom)
                const calculatedZoom = maxRange > 0.1 ? 11 : maxRange > 0.05 ? 13 : 15;
                setMapZoom(calculatedZoom);
              }
            }
          }
        }
      } catch (err) {
        // Check if it's a 404 (no map data exists in projectmap table - this is expected/OK)
        // The axios interceptor now includes status in the error object
        if (err.status === 404 || (err.message && err.message.toLowerCase().includes('not found'))) {
          // 404 means no map data exists yet - this is normal, not an error
          setMapData(null);
          // No error message is shown - the UI will display an informational message instead
        } else {
          // Actual error occurred (network issue, server error, 500, etc.)
          console.error('Error fetching project map:', err);
          let errorMessage = 'An error occurred while loading map data from the server.';
          
          // Check for timeout or network errors (these have specific axios error codes)
          if (err.code === 'ECONNABORTED') {
            errorMessage = 'Request timeout: The server took too long to respond. Please try again.';
          } else if (err.code === 'ERR_NETWORK' || err.code === 'ERR_INTERNET_DISCONNECTED') {
            errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
          } else if (!err.status && err.request && !err.response) {
            // Network error (request sent but no response received)
            errorMessage = 'Network error: Unable to reach the server. The server may be temporarily unavailable. Please try again later.';
          } else if (err.message && typeof err.message === 'string') {
            // Error with message from backend or interceptor
            errorMessage = err.message;
          } else if (err.status) {
            // Server error with status code
            const statusMsg = err.message || errorMessage;
            errorMessage = `Server error (${err.status}): ${statusMsg} Please try again or contact support if the problem persists.`;
          }
          
          setError(errorMessage);
        }
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchMapData();
    }
  }, [projectId]);

  // Fetch project geographical labels (for top summary cards).
  useEffect(() => {
    let mounted = true;
    const fetchProjectGeoDetails = async () => {
      if (!projectId) return;
      try {
        const project = await apiService.projects.getProjectById(projectId);
        if (!mounted) return;
        setProjectGeoDetails({
          constituency:
            project?.constituency ||
            project?.constituencyName ||
            project?.constituencyNames ||
            project?.location?.constituency ||
            '',
          ward:
            project?.ward ||
            project?.wardName ||
            project?.wardNames ||
            project?.location?.ward ||
            '',
        });
      } catch (geoErr) {
        console.warn('[ProjectMapEditor] Unable to load project geo details:', geoErr?.message || geoErr);
        if (mounted) {
          setProjectGeoDetails({ constituency: '', ward: '' });
        }
      }
    };
    fetchProjectGeoDetails();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  // Update map center when coordinates change
  useEffect(() => {
    if (coordinates.latitude && coordinates.longitude && mapRef.current) {
      const lat = parseFloat(coordinates.latitude);
      const lng = parseFloat(coordinates.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        setMapCenter({ lat, lng });
        if (mapZoom < 10) setMapZoom(15);
      }
    }
  }, [coordinates.latitude, coordinates.longitude, mapZoom]);

  // Update refs when mapCenter or mapZoom changes
  useEffect(() => {
    mapCenterRef.current = mapCenter;
    mapZoomRef.current = mapZoom;
  }, [mapCenter, mapZoom]);

  // Update map when mapCenter or mapZoom changes and map is ready
  useEffect(() => {
    if (mapRef.current && mapReady && mapModalOpen) {
      // Use refs first (most up-to-date), then state, then initial position
      const centerToUse = (mapCenterRef.current && mapCenterRef.current.lat && mapCenterRef.current.lng) 
        ? mapCenterRef.current 
        : ((mapCenter && mapCenter.lat && mapCenter.lng)
          ? mapCenter
          : { lat: INITIAL_MAP_POSITION[0], lng: INITIAL_MAP_POSITION[1] });
      const zoomToUse = mapZoomRef.current || mapZoom || 6;
      
      mapRef.current.setCenter(centerToUse);
      mapRef.current.setZoom(zoomToUse);
      console.log('[ProjectMapEditor] Map updated via useEffect:', centerToUse, 'zoom:', zoomToUse);
    }
  }, [mapCenter, mapZoom, mapReady, mapModalOpen]);

  const handleEdit = async () => {
    console.log('[ProjectMapEditor] ========== handleEdit STARTED ==========');
    console.log('[ProjectMapEditor] Opening map modal');
    
    // Reset the edited path ref when starting a new edit session
    latestEditedPathRef.current = null;
    
    setError('');
    setSuccess('');
    
    // If map data exists, center map on saved coordinates
    if (mapData && mapData.map) {
      try {
        const geoJson = typeof mapData.map === 'string' ? JSON.parse(mapData.map) : mapData.map;
        if (geoJson.features && geoJson.features.length > 0) {
          const feature = geoJson.features[0];
          const { type, coordinates: coords } = feature.geometry;
          
          if (type === 'Point' && coords && coords.length === 2) {
            // Center on Point coordinates
            const lat = coords[1];
            const lng = coords[0];
            setMapCenter({ lat, lng });
            setMapZoom(15);
            console.log('[ProjectMapEditor] Centering map on saved Point coordinates:', { lat, lng });
          } else if ((type === 'LineString' || type === 'MultiPoint') && coords && coords.length > 0) {
            // Center on first coordinate of LineString/MultiPoint
            const firstCoord = Array.isArray(coords[0]) ? coords[0] : coords;
            if (firstCoord && firstCoord.length >= 2) {
              const lat = firstCoord[1];
              const lng = firstCoord[0];
              setMapCenter({ lat, lng });
              setMapZoom(13);
              console.log('[ProjectMapEditor] Centering map on saved LineString/MultiPoint coordinates:', { lat, lng });
            }
          } else if (type === 'Polygon' && coords && coords.length > 0 && coords[0] && coords[0].length > 0) {
            // Center on first coordinate of Polygon
            const firstCoord = coords[0][0] || coords[0];
            if (firstCoord && firstCoord.length >= 2) {
              const lat = firstCoord[1];
              const lng = firstCoord[0];
              setMapCenter({ lat, lng });
              setMapZoom(13);
              console.log('[ProjectMapEditor] Centering map on saved Polygon coordinates:', { lat, lng });
            }
          }
        }
      } catch (err) {
        console.error('[ProjectMapEditor] Error parsing map data for centering:', err);
      }
    }
    // If there's no existing map data, try to zoom to the selected ward location first.
    if (!mapData && projectId) {
      console.log('[ProjectMapEditor] No map data exists, will fetch ward coordinates for project:', projectId);
      try {
        let centered = false;
        let centeredLabel = null;

        // 1) Prefer exact ward geometry centroid from Machakos GIS ward polygons (same source as GIS dashboard).
        try {
          const project = await apiService.projects.getProjectById(projectId);
          const projectWard =
            project?.ward ||
            project?.wardName ||
            project?.ward_name ||
            project?.location?.ward ||
            null;
          const wardKey = projectWard ? normalizeWardKey(projectWard) : '';

          if (wardKey) {
            if (!machakosWardsGeoRef.current) {
              const wardRes = await fetch('/gis/machakos/machakos-wards.geojson');
              if (wardRes.ok) {
                machakosWardsGeoRef.current = await wardRes.json();
              }
            }
            const wardFeatures = machakosWardsGeoRef.current?.features || [];
            const matched = wardFeatures.find((f) => {
              const name = f?.properties?.ward_name || f?.properties?.COUNTY_A_1 || '';
              return normalizeWardKey(name) === wardKey;
            });
            const centroid = getWardCentroidFromFeature(matched);
            if (centroid) {
              const newCenter = centroid;
              const newZoom = 13;
              setMapCenter(newCenter);
              setMapZoom(newZoom);
              mapCenterRef.current = newCenter;
              mapZoomRef.current = newZoom;
              centered = true;
              centeredLabel = projectWard;
            }
          }
        } catch (geoWardErr) {
          console.warn('[ProjectMapEditor] Ward-geometry centering skipped:', geoWardErr?.message || geoWardErr);
        }

        // 2) Fallback to project ward junction geo coordinates.
        if (!centered) {
          const wards = await apiService.junctions.getProjectWards(projectId);
          const wardWithCoords = Array.isArray(wards)
            ? wards.find((w) => w.geoLat && w.geoLon && w.geoLat !== null && w.geoLon !== null)
            : null;
          if (wardWithCoords) {
            const targetLat = parseFloat(wardWithCoords.geoLat);
            const targetLng = parseFloat(wardWithCoords.geoLon);
            if (!Number.isNaN(targetLat) && !Number.isNaN(targetLng)) {
              const newCenter = { lat: targetLat, lng: targetLng };
              const newZoom = 15;
              setMapCenter(newCenter);
              setMapZoom(newZoom);
              mapCenterRef.current = newCenter;
              mapZoomRef.current = newZoom;
              centered = true;
              centeredLabel = wardWithCoords.wardName || 'Ward location';
            }
          }
        }

        // 3) Fallback to project subcounty coordinates.
        if (!centered) {
          try {
            const subcounties = await apiService.junctions.getProjectSubcounties(projectId);
            const subcountyWithCoords = Array.isArray(subcounties)
              ? subcounties.find((sc) => sc.geoLat && sc.geoLon && sc.geoLat !== null && sc.geoLon !== null)
              : null;
            if (subcountyWithCoords) {
              const targetLat = parseFloat(subcountyWithCoords.geoLat);
              const targetLng = parseFloat(subcountyWithCoords.geoLon);
              if (!Number.isNaN(targetLat) && !Number.isNaN(targetLng)) {
                const newCenter = { lat: targetLat, lng: targetLng };
                const newZoom = 13;
                setMapCenter(newCenter);
                setMapZoom(newZoom);
                mapCenterRef.current = newCenter;
                mapZoomRef.current = newZoom;
                centered = true;
                centeredLabel = subcountyWithCoords.subcountyName || 'Subcounty location';
              }
            }
          } catch (subcountyErr) {
            console.error('[ProjectMapEditor] Error fetching subcounty coordinates:', subcountyErr);
          }
        }

        // 4) Final fallback to Machakos center.
        if (!centered) {
          setMapCenter(MACHAKOS_CENTER);
          setMapZoom(10);
          mapCenterRef.current = MACHAKOS_CENTER;
          mapZoomRef.current = 10;
          centeredLabel = 'Machakos county';
        }

        if (centeredLabel) {
          setSuccess(`Map will center on: ${centeredLabel}`);
        }
      } catch (err) {
        console.error('[ProjectMapEditor] Error fetching ward coordinates:', err);
        // Keep editing flow smooth and still center to Machakos if lookup fails.
        setMapCenter(MACHAKOS_CENTER);
        setMapZoom(10);
        mapCenterRef.current = MACHAKOS_CENTER;
        mapZoomRef.current = 10;
      }
    } else {
      console.log('[ProjectMapEditor] Map data exists or projectId missing - skipping ward fetch');
    }
    
    // Open the modal AFTER setting the map center (so map initializes with correct location)
    // Use a small delay to ensure state updates are processed
    await new Promise(resolve => setTimeout(resolve, 50));
    setMapModalOpen(true);
    setEditing(true);
    
    console.log('[ProjectMapEditor] ========== handleEdit COMPLETED ==========');
  };

  const handleCancel = () => {
    setEditing(false);
    setMapModalOpen(false);
    setError('');
    setSuccess('');
    // Reload original data
    if (mapData && mapData.map) {
      const geoJson = typeof mapData.map === 'string' ? JSON.parse(mapData.map) : mapData.map;
      if (geoJson.features && geoJson.features.length > 0) {
        const feature = geoJson.features[0];
        const { type, coordinates: coords } = feature.geometry;
        if (type === 'Point') {
          setCoordinates({
            latitude: coords[1].toFixed(6),
            longitude: coords[0].toFixed(6),
            multiPointData: ''
          });
        }
      }
    } else {
      setCoordinates({ latitude: '', longitude: '', multiPointData: '' });
      setGeometryType('Point');
    }
  };

  const handleGeometryTypeChange = (event, newType) => {
    if (newType !== null) {
      setGeometryType(newType);
      if (newType === 'Point') {
        setCoordinates(prev => ({ ...prev, multiPointData: '' }));
      } else {
        setCoordinates(prev => ({ ...prev, latitude: '', longitude: '' }));
      }
    }
  };

  const handleCoordinateChange = (e) => {
    const { name, value } = e.target;
    setCoordinates(prev => ({ ...prev, [name]: value }));
  };

  const handleMapClick = useCallback((e) => {
    if (!editing) return;
    
    // Don't handle map clicks for LineString/MultiPoint/Polygon - they're handled by onClick on the shape itself
    // Only handle clicks for Point geometry or empty areas
    if (geometryType === 'Point') {
      const clickedLat = e.latLng.lat();
      const clickedLng = e.latLng.lng();
      setCoordinates({
        latitude: clickedLat.toFixed(6),
        longitude: clickedLng.toFixed(6),
        multiPointData: ''
      });
      setMapCenter({ lat: clickedLat, lng: clickedLng });
      setMapZoom(15);
      setTempMarkerPosition([clickedLat, clickedLng]);
    }
    // For other geometries, clicking on empty space can still add points
    else {
      // Check if we have existing points by reading current coordinates state
      setCoordinates(prev => {
        const hasExistingPoints = prev.multiPointData && prev.multiPointData.trim().length > 0;
        if (!hasExistingPoints || selectedPointIndex === null) {
          const clickedLat = e.latLng.lat();
          const clickedLng = e.latLng.lng();
          const newPoint = `${clickedLng.toFixed(6)}, ${clickedLat.toFixed(6)}`;
          console.log('[ProjectMapEditor] handleMapClick - Adding new point:', newPoint);
          const updated = {
            ...prev,
            multiPointData: prev.multiPointData ? `${prev.multiPointData}\n${newPoint}` : newPoint
          };
          console.log('[ProjectMapEditor] handleMapClick - Updated coordinates:', updated);
          // Update the ref so save can use the latest coordinates
          latestEditedPathRef.current = updated.multiPointData;
          setTempMarkerPosition([clickedLat, clickedLng]);
          return updated;
        }
        return prev;
      });
    }
  }, [editing, geometryType, selectedPointIndex]);

  const getGeoJsonFromCoordinates = (coordsOverride = null) => {
    // Use provided coordinates override, or fall back to state
    const coords = coordsOverride || coordinates;
    
    if (geometryType === 'Point') {
      if (!coords.latitude || !coords.longitude) return null;
      const lat = parseFloat(coords.latitude);
      const lng = parseFloat(coords.longitude);
      if (isNaN(lat) || isNaN(lng)) return null;

      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { name: projectName || 'Project Location' },
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          }
        }]
      };
    } else {
      if (!coords.multiPointData) return null;
      
      const lines = coords.multiPointData.split('\n').filter(line => line.trim());
      if (lines.length === 0) return null;

      const parsedCoords = lines.map(line => {
        const parts = line.split(',').map(p => parseFloat(p.trim()));
        return [parts[0], parts[1]]; // [lng, lat]
      });

      let geoType = 'LineString';
      if (geometryType === 'Polygon') {
        // Ensure polygon is closed (first and last points are the same)
        if (parsedCoords.length > 0 && (parsedCoords[0][0] !== parsedCoords[parsedCoords.length - 1][0] || parsedCoords[0][1] !== parsedCoords[parsedCoords.length - 1][1])) {
          parsedCoords.push(parsedCoords[0]);
        }
        geoType = 'Polygon';
        return {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { name: projectName || 'Project Area' },
            geometry: {
              type: 'Polygon',
              coordinates: [parsedCoords]
            }
          }]
        };
      } else if (geometryType === 'MultiPoint') {
        return {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { name: projectName || 'Project Points' },
            geometry: {
              type: 'MultiPoint',
              coordinates: parsedCoords
            }
          }]
        };
      } else {
        return {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { name: projectName || 'Project Route' },
            geometry: {
              type: 'LineString',
              coordinates: parsedCoords
            }
          }]
        };
      }
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    
    // For LineString/MultiPoint/Polygon, we need to get the latest coordinates from the actual map components
    // since dragging might not have updated state yet
    let coordinatesToUse = coordinates;
    
    if (geometryType === 'LineString' || geometryType === 'MultiPoint' || geometryType === 'Polygon') {
      // Try to get coordinates directly from the polyline/polygon refs if they exist
      let pathFromMap = null;
      
      if (geometryType === 'LineString' || geometryType === 'MultiPoint') {
        if (polylineRef.current && polylineRef.current.getPath) {
          try {
            const path = polylineRef.current.getPath();
            const newPath = [];
            path.forEach((latLng) => {
              newPath.push(`${latLng.lng().toFixed(6)}, ${latLng.lat().toFixed(6)}`);
            });
            pathFromMap = newPath.join('\n');
            console.log('[ProjectMapEditor] handleSave - Got path from polyline ref:', pathFromMap);
          } catch (err) {
            console.warn('[ProjectMapEditor] handleSave - Could not get path from polyline ref:', err);
          }
        }
      } else if (geometryType === 'Polygon') {
        if (polygonRef.current && polygonRef.current.getPath) {
          try {
            const path = polygonRef.current.getPath();
            const newPath = [];
            path.forEach((latLng) => {
              newPath.push(`${latLng.lng().toFixed(6)}, ${latLng.lat().toFixed(6)}`);
            });
            // Remove duplicate closing point if present
            if (newPath.length > 1 && newPath[0] === newPath[newPath.length - 1]) {
              newPath.pop();
            }
            pathFromMap = newPath.join('\n');
            console.log('[ProjectMapEditor] handleSave - Got path from polygon ref:', pathFromMap);
          } catch (err) {
            console.warn('[ProjectMapEditor] handleSave - Could not get path from polygon ref:', err);
          }
        }
      }
      
      // Use path from map if available, otherwise use ref, otherwise use state
      if (pathFromMap) {
        coordinatesToUse = {
          ...coordinates,
          multiPointData: pathFromMap
        };
        console.log('[ProjectMapEditor] handleSave - Using coordinates from map component');
      } else if (latestEditedPathRef.current) {
        coordinatesToUse = {
          ...coordinates,
          multiPointData: latestEditedPathRef.current
        };
        console.log('[ProjectMapEditor] handleSave - Using latest edited path from ref:', latestEditedPathRef.current);
      } else {
        console.log('[ProjectMapEditor] handleSave - Using coordinates from state');
      }
      
      // Update state for consistency
      setCoordinates(coordinatesToUse);
      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      // For Point, just use state
      await new Promise(resolve => setTimeout(resolve, 50));
      coordinatesToUse = coordinates;
    }
    
    // Log current coordinates state before building GeoJSON
    console.log('[ProjectMapEditor] handleSave - Current coordinates state:', coordinatesToUse);
    console.log('[ProjectMapEditor] handleSave - Geometry type:', geometryType);
    
    // Build GeoJSON using the coordinates (either from ref or state)
    const geoJson = getGeoJsonFromCoordinates(coordinatesToUse);
    if (!geoJson) {
      let errorMsg = 'Please provide valid coordinates. ';
      if (geometryType === 'Point') {
        errorMsg += 'For a Point, please enter both latitude and longitude, or click on the map.';
      } else {
        errorMsg += `For a ${geometryType}, please add at least one point by clicking on the map, or enter coordinates manually.`;
      }
      setError(errorMsg);
      setSnackbarMessage(errorMsg);
      setSnackbarOpen(true);
      return;
    }
    
    // Log the GeoJSON that will be saved
    console.log('[ProjectMapEditor] handleSave - GeoJSON to save:', JSON.stringify(geoJson, null, 2));
    
    // Clear the ref after using it
    latestEditedPathRef.current = null;

    setSaving(true);
    try {
      console.log('[ProjectMapEditor] Saving map data for projectId:', projectId);
      console.log('[ProjectMapEditor] GeoJSON to save:', geoJson);
      const geoJsonString = JSON.stringify(geoJson);
      console.log('[ProjectMapEditor] Stringified GeoJSON length:', geoJsonString.length);
      
      const savedData = await apiService.projectMaps.updateProjectMap(projectId, geoJsonString);
      console.log('[ProjectMapEditor] Save response:', savedData);
      
      if (!savedData || !savedData.map) {
        throw new Error('Save succeeded but no data returned from server');
      }
      
      // Reload map data to get the latest from database
      const data = await apiService.projectMaps.getProjectMap(projectId);
      console.log('[ProjectMapEditor] Reloaded map data:', data);
      
      if (data && data.map) {
        setMapData(data);
        
        // Re-parse coordinates from the saved data to update the form
        const savedGeoJson = typeof data.map === 'string' ? JSON.parse(data.map) : data.map;
        if (savedGeoJson.features && savedGeoJson.features.length > 0) {
          const feature = savedGeoJson.features[0];
          const { type, coordinates: coords } = feature.geometry;
          
          setGeometryType(type === 'MultiPoint' ? 'MultiPoint' : type === 'LineString' ? 'LineString' : type === 'Polygon' ? 'Polygon' : 'Point');
          
          if (type === 'Point') {
            setCoordinates({
              latitude: coords[1].toFixed(6),
              longitude: coords[0].toFixed(6),
              multiPointData: ''
            });
            setMapCenter({ lat: coords[1], lng: coords[0] });
            setMapZoom(15);
          } else if (type === 'Polygon') {
            const outerRing = coords[0] || [];
            const multiPointStr = outerRing.map(coord => {
              return `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`;
            }).join('\n');
            setCoordinates({
              latitude: '',
              longitude: '',
              multiPointData: multiPointStr
            });
          } else {
            const multiPointStr = coords.map(coord => {
              return `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`;
            }).join('\n');
            setCoordinates({
              latitude: '',
              longitude: '',
              multiPointData: multiPointStr
            });
          }
        }
      } else {
        setMapData(data);
      }
      
      // Close modal first
      setEditing(false);
      setMapModalOpen(false);
      
      // Show success notification in Snackbar (persists after modal closes)
      setSnackbarMessage('Map coordinates saved successfully!');
      setSnackbarOpen(true);
      setSuccess('Map data saved successfully!');
    } catch (err) {
      console.error('Error saving map data:', err);
      console.error('Error details:', {
        message: err.message,
        status: err.status,
        response: err.response?.data,
        fullError: err
      });
      
      // Handle error from axios interceptor (which preserves status)
      let errorMessage = 'Failed to save map data. Please check the console for details.';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message && typeof err.message === 'string') {
        errorMessage = err.message;
      } else if (err.status) {
        errorMessage = `Error (${err.status}): ${errorMessage} Please try again.`;
      }
      
      setError(errorMessage);
      setSnackbarMessage(`Error: ${errorMessage}`);
      setSnackbarOpen(true);
    } finally {
      setSaving(false);
    }
  };

  // Helper functions for rendering map features
  const getPointCoordinates = () => {
    if (geometryType !== 'Point' || !coordinates.latitude || !coordinates.longitude) return null;
    const lat = parseFloat(coordinates.latitude);
    const lng = parseFloat(coordinates.longitude);
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
  };

  const getMultiPointPath = () => {
    if (geometryType === 'Point' || !coordinates.multiPointData) return [];
    return coordinates.multiPointData
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split(',').map(p => parseFloat(p.trim()));
        return { lat: parts[1], lng: parts[0] };
      });
  };

  const getPolygonPath = () => {
    if (geometryType !== 'Polygon' || !coordinates.multiPointData) return [];
    const path = getMultiPointPath();
    // Ensure polygon is closed
    if (path.length > 0 && (path[0].lat !== path[path.length - 1].lat || path[0].lng !== path[path.length - 1].lng)) {
      return [...path, path[0]];
    }
    return path;
  };

  // Don't block rendering with loading - show the map immediately
  // The map will show a loading state internally if Google Maps API isn't ready
  // if (loading) {
  //   return (
  //     <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
  //       <CircularProgress />
  //     </Box>
  //   );
  // }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h6">Project Location & Coordinates</Typography>
          {!mapData && !editing && !loading && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              No map data available. Click "Add Map Data" to create coordinates for this project.
            </Typography>
          )}
        </Box>
        {!editing && (
          <Button
            startIcon={<EditIcon />}
            variant="contained"
            color="primary"
            onClick={() => {
              console.log('[ProjectMapEditor] Add Map Data button clicked');
              handleEdit();
            }}
          >
            {mapData ? 'Edit Map' : 'Add Map Data'}
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Display existing map data if available */}
      {mapData && (
        <>
          <Paper elevation={2} sx={{ p: 2.5, mt: 2, mb: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1.4fr 1.2fr 1fr 1fr' },
                gap: 2,
                width: '100%',
              }}
            >
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <LocationOnIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" fontWeight={700}>
                      Coordinates
                    </Typography>
                  </Stack>
                  {geometryType === 'Point' && coordinates.latitude && coordinates.longitude ? (
                    <>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Latitude: {coordinates.latitude}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Longitude: {coordinates.longitude}
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {geometryType === 'Polygon' ? 'Polygon' : geometryType === 'LineString' ? 'Line' : 'Multi-Point'} with{' '}
                      {coordinates.multiPointData.split('\n').filter(l => l.trim()).length} point
                      {coordinates.multiPointData.split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''}
                    </Typography>
                  )}
                </Paper>

              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    Geometry Type
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    {geometryType}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Last updated
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateSafe(mapData.updatedAt || mapData.updated_at || mapData.createdAt || mapData.created_at)}
                  </Typography>
                </Paper>

              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <LocationOnIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" fontWeight={700}>
                      Geographical Details
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Constituency: {projectGeoDetails.constituency || 'N/A'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Ward: {projectGeoDetails.ward || 'N/A'}
                  </Typography>
                </Paper>

              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    Quick Actions
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Need to refine placement or shape?
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<EditIcon />}
                    onClick={handleEdit}
                    fullWidth
                  >
                    Edit Map
                  </Button>
                </Paper>
            </Box>
          </Paper>

          {/* Read-only map display */}
          <Paper elevation={2} sx={{ mt: 2, mb: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">
                  Project Location Map
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {projectName || 'Project'} location displayed on map
                </Typography>
              </Box>
              <ToggleButtonGroup
                value={mapType}
                exclusive
                onChange={(e, newType) => {
                  if (newType !== null) {
                    setMapType(newType);
                  }
                }}
                size="small"
                aria-label="map view type"
              >
                <ToggleButton value="roadmap" aria-label="roadmap view">
                  <MapIcon sx={{ mr: 0.5 }} fontSize="small" />
                  Map
                </ToggleButton>
                <ToggleButton value="satellite" aria-label="satellite view">
                  <SatelliteIcon sx={{ mr: 0.5 }} fontSize="small" />
                  Satellite
                </ToggleButton>
                <ToggleButton value="hybrid" aria-label="hybrid view">
                  <SatelliteIcon sx={{ mr: 0.5 }} fontSize="small" />
                  Hybrid
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ height: '500px', width: '100%', position: 'relative' }}>
              <GoogleMapComponent
                key={`readonly-map-${mapData?.mapId || 'new'}-${geometryType}-${coordinates.multiPointData ? coordinates.multiPointData.substring(0, 50) : coordinates.latitude || ''}-${mapData?.updatedAt || mapData?.updated_at || ''}`}
                center={mapCenter}
                zoom={mapZoom}
                mapTypeId={mapType}
                style={{ 
                  height: '500px', 
                  width: '100%'
                }}
                onCreated={map => {
                  if (window.google && window.google.maps) {
                    // For Point geometry, center and zoom
                    if (geometryType === 'Point' && getPointCoordinates()) {
                      map.setCenter(getPointCoordinates());
                      map.setZoom(15);
                    }
                    // For LineString, MultiPoint, or Polygon, use fitBounds to show all coordinates
                    else if ((geometryType === 'LineString' || geometryType === 'MultiPoint') && getMultiPointPath().length > 0) {
                      const bounds = new window.google.maps.LatLngBounds();
                      getMultiPointPath().forEach(point => {
                        bounds.extend(point);
                      });
                      map.fitBounds(bounds);
                      // Add padding around the bounds
                      const boundsData = window.google.maps.event.addListener(map, 'bounds_changed', () => {
                        window.google.maps.event.removeListener(boundsData);
                        map.setZoom(Math.min(map.getZoom(), 16)); // Cap zoom at 16
                      });
                    }
                    else if (geometryType === 'Polygon' && getPolygonPath().length > 0) {
                      const bounds = new window.google.maps.LatLngBounds();
                      getPolygonPath().forEach(point => {
                        bounds.extend(point);
                      });
                      map.fitBounds(bounds);
                      // Add padding around the bounds
                      const boundsData = window.google.maps.event.addListener(map, 'bounds_changed', () => {
                        window.google.maps.event.removeListener(boundsData);
                        map.setZoom(Math.min(map.getZoom(), 16)); // Cap zoom at 16
                      });
                    }
                    // Fallback to state values
                    else {
                      const centerToUse = (mapCenter.lat && mapCenter.lng) 
                        ? mapCenter 
                        : { lat: INITIAL_MAP_POSITION[0], lng: INITIAL_MAP_POSITION[1] };
                      const zoomToUse = mapZoom || 6;
                      map.setCenter(centerToUse);
                      map.setZoom(zoomToUse);
                    }
                  }
                }}
              >
                {/* Render Point Marker */}
                {geometryType === 'Point' && getPointCoordinates() && (
                  <MarkerF
                    position={getPointCoordinates()}
                    icon={makeMarkerIcon('http://maps.google.com/mapfiles/ms/icons/red-dot.png', 32)}
                    title={projectName || 'Project Location'}
                  />
                )}

                {/* Render LineString or MultiPoint as Polyline */}
                {(geometryType === 'LineString' || geometryType === 'MultiPoint') && getMultiPointPath().length > 0 && (
                  <PolylineF
                    path={getMultiPointPath()}
                    options={{
                      strokeColor: "#FF0000",
                      strokeWeight: 4,
                      strokeOpacity: 0.8
                    }}
                  />
                )}

                {/* Render Polygon */}
                {geometryType === 'Polygon' && getPolygonPath().length > 0 && (
                  <PolygonF
                    paths={getPolygonPath()}
                    options={{
                      fillColor: "#FF0000",
                      fillOpacity: 0.35,
                      strokeColor: "#FF0000",
                      strokeWeight: 2,
                      strokeOpacity: 0.8
                    }}
                  />
                )}
              </GoogleMapComponent>
            </Box>
          </Paper>
        </>
      )}

      {/* Map Editor Modal */}
      <Dialog
        open={mapModalOpen}
        onClose={handleCancel}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            maxHeight: '90vh',
            borderRadius: 2
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          bgcolor: 'primary.main',
          color: 'white'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocationOnIcon />
            <Typography variant="h6" fontWeight="bold">
              {mapData ? 'Edit Project Location' : 'Add Project Location'}
            </Typography>
          </Box>
          <IconButton
            onClick={handleCancel}
            sx={{ color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'row', height: `${mapHeight}px`, width: '100%', overflow: 'hidden' }}>
          {/* Left Column - Form */}
          <Box sx={{ 
            width: { xs: '100%', md: '33.333%' }, 
            borderRight: { md: 1 }, 
            borderColor: 'divider', 
            p: 3, 
            overflowY: 'auto',
            flexShrink: 0
          }}>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Coordinate Information
              </Typography>
              
              <Box sx={{ mb: 3, mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>Geometry Type:</Typography>
                <ToggleButtonGroup
                  value={geometryType}
                  exclusive
                  onChange={handleGeometryTypeChange}
                  color="primary"
                  fullWidth
                >
                  <ToggleButton value="Point">Point</ToggleButton>
                  <ToggleButton value="LineString">Line</ToggleButton>
                  <ToggleButton value="Polygon">Polygon</ToggleButton>
                  <ToggleButton value="MultiPoint">Multi-Point</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>Map View:</Typography>
                <ToggleButtonGroup
                  value={mapType}
                  exclusive
                  onChange={(e, newType) => {
                    if (newType !== null) {
                      setMapType(newType);
                    }
                  }}
                  color="primary"
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="roadmap">
                    <MapIcon sx={{ mr: 0.5 }} fontSize="small" />
                    Map
                  </ToggleButton>
                  <ToggleButton value="satellite">
                    <SatelliteIcon sx={{ mr: 0.5 }} fontSize="small" />
                    Satellite
                  </ToggleButton>
                  <ToggleButton value="hybrid">
                    <SatelliteIcon sx={{ mr: 0.5 }} fontSize="small" />
                    Hybrid
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {geometryType === 'Point' ? (
                <>
                  <TextField
                    fullWidth
                    label="Latitude"
                    name="latitude"
                    value={coordinates.latitude}
                    onChange={handleCoordinateChange}
                    sx={{ mb: 2 }}
                    helperText="Click on the map or enter latitude manually"
                  />
                  <TextField
                    fullWidth
                    label="Longitude"
                    name="longitude"
                    value={coordinates.longitude}
                    onChange={handleCoordinateChange}
                    helperText="Click on the map or enter longitude manually"
                  />
                </>
              ) : (
                <TextField
                  fullWidth
                  multiline
                  rows={10}
                  label={`${geometryType === 'Polygon' ? 'Polygon' : geometryType === 'LineString' ? 'Line' : 'Multi-Point'} Coordinates`}
                  name="multiPointData"
                  value={coordinates.multiPointData}
                  onChange={handleCoordinateChange}
                  placeholder='Enter coordinates as "longitude, latitude" (one per line)'
                  helperText={`Click on the map to add points. For polygon, ensure first and last points match.`}
                />
              )}

              <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.5 }}>
                  Instructions:
                </Typography>
                {geometryType === 'Point' ? (
                  <Typography variant="caption" display="block">
                    • Click on the map to set the location
                  </Typography>
                ) : (
                  <>
                    <Typography variant="caption" display="block">
                      • Click on the map to add new points
                    </Typography>
                    <Typography variant="caption" display="block">
                      • Drag the blue vertex markers to adjust point positions
                    </Typography>
                    <Typography variant="caption" display="block">
                      • Click on the {geometryType === 'Polygon' ? 'polygon' : 'line'} to add points along the path
                    </Typography>
                    <Typography variant="caption" display="block">
                      • Click a blue marker to select and edit that point
                    </Typography>
                    <Typography variant="caption" display="block">
                      • Or enter coordinates manually in the fields above
                    </Typography>
                    {geometryType === 'Polygon' && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        • The polygon will automatically close (first and last points connect)
                      </Typography>
                    )}
                  </>
                )}
              </Box>
              
              {/* Point editing controls for LineString/MultiPoint/Polygon */}
              {(geometryType === 'LineString' || geometryType === 'MultiPoint' || geometryType === 'Polygon') && 
               coordinates.multiPointData && 
               getMultiPointPath().length > 0 && 
               selectedPointIndex !== null && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                  <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                    Editing Point {selectedPointIndex + 1}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      label="Latitude"
                      value={getMultiPointPath()[selectedPointIndex]?.lat.toFixed(6) || ''}
                      onChange={(e) => {
                        const newLat = parseFloat(e.target.value);
                        if (!isNaN(newLat)) {
                          const path = getMultiPointPath();
                          path[selectedPointIndex] = { ...path[selectedPointIndex], lat: newLat };
                          const newPath = path.map(p => `${p.lng.toFixed(6)}, ${p.lat.toFixed(6)}`);
                          setCoordinates(prev => ({
                            ...prev,
                            multiPointData: newPath.join('\n')
                          }));
                        }
                      }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Longitude"
                      value={getMultiPointPath()[selectedPointIndex]?.lng.toFixed(6) || ''}
                      onChange={(e) => {
                        const newLng = parseFloat(e.target.value);
                        if (!isNaN(newLng)) {
                          const path = getMultiPointPath();
                          path[selectedPointIndex] = { ...path[selectedPointIndex], lng: newLng };
                          const newPath = path.map(p => `${p.lng.toFixed(6)}, ${p.lat.toFixed(6)}`);
                          setCoordinates(prev => ({
                            ...prev,
                            multiPointData: newPath.join('\n')
                          }));
                        }
                      }}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => {
                        const path = getMultiPointPath();
                        if (path.length > 2) { // Keep at least 2 points
                          path.splice(selectedPointIndex, 1);
                          const newPath = path.map(p => `${p.lng.toFixed(6)}, ${p.lat.toFixed(6)}`);
                          setCoordinates(prev => ({
                            ...prev,
                            multiPointData: newPath.join('\n')
                          }));
                          setSelectedPointIndex(null);
                        } else {
                          setError('Cannot delete point. A ' + (geometryType === 'Polygon' ? 'polygon' : 'line') + ' needs at least 2 points.');
                        }
                      }}
                    >
                      Delete
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedPointIndex(null)}
                    >
                      Done
                    </Button>
                  </Stack>
                </Box>
              )}
          </Box>

          {/* Right Column - Map */}
          <Box sx={{ 
              position: 'relative', 
              width: { xs: '100%', md: '66.667%' },
              height: '100%',
              backgroundColor: '#e3f2fd', // Light blue background for debugging
              border: '2px solid #2196f3', // Blue border for visibility
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 1
            }}>
              <Box sx={{ 
                position: 'absolute', 
                top: 10, 
                left: 10, 
                bgcolor: 'info.main', 
                color: 'white',
                p: 1, 
                borderRadius: 1,
                zIndex: 1000,
                boxShadow: 2,
                maxWidth: '300px'
              }}>
                <Typography variant="caption" fontWeight="bold">
                  Click on the map to {geometryType === 'Point' ? 'set location' : 'add points'}
                </Typography>
              </Box>
              
              {/* Map container - fill the Grid item */}
              <Box sx={{
                width: '100%',
                height: '100%',
                flex: 1,
                backgroundColor: '#fff3cd', // Yellow background for debugging map component
                border: '2px solid #ff9800' // Orange border
              }}>
                <GoogleMapComponent
                key={`map-modal-${editing}-${mapCenter.lat}-${mapCenter.lng}-${mapType}`}
                center={mapCenter}
                zoom={mapZoom}
                mapTypeId={mapType}
                style={{ 
                  height: `${mapHeight}px`, 
                  width: '100%'
                }}
                onCreated={map => {
                  console.log('[ProjectMapEditor] Map created in modal, current mapCenter state:', mapCenter, 'mapZoom:', mapZoom);
                  console.log('[ProjectMapEditor] Refs - mapCenterRef:', mapCenterRef.current, 'mapZoomRef:', mapZoomRef.current);
                  mapRef.current = map;
                  setMapReady(true);
                  if (window.google && window.google.maps) {
                    setMarkerIcon(makeMarkerIcon('http://maps.google.com/mapfiles/ms/icons/red-dot.png', 32));
                    
                    // Ensure zoom controls are visible and properly positioned
                    map.setOptions({
                      zoomControl: true,
                      zoomControlOptions: {
                        position: window.google.maps.ControlPosition.RIGHT_CENTER,
                      },
                    });
                    
                    // Function to center the map - will be called multiple times to ensure it works
                    const centerMap = () => {
                      if (mapRef.current) {
                        // Check refs first (most up-to-date), then state, then initial position
                        const centerToUse = (mapCenterRef.current && mapCenterRef.current.lat && mapCenterRef.current.lng) 
                          ? mapCenterRef.current 
                          : ((mapCenter && mapCenter.lat && mapCenter.lng)
                            ? mapCenter
                            : { lat: INITIAL_MAP_POSITION[0], lng: INITIAL_MAP_POSITION[1] });
                        const zoomToUse = mapZoomRef.current || mapZoom || 6;
                        
                        console.log('[ProjectMapEditor] Centering map to:', centerToUse, 'zoom:', zoomToUse);
                        mapRef.current.setCenter(centerToUse);
                        mapRef.current.setZoom(zoomToUse);
                      }
                    };
                    
                    // Try immediately
                    centerMap();
                    
                    // Try again after a short delay (in case refs/state haven't updated yet)
                    setTimeout(centerMap, 100);
                    
                    // Try again after a longer delay (for async ward fetching)
                    setTimeout(centerMap, 500);
                  }
                }}
                onClick={handleMapClick}
              >
                {/* Render Point Marker */}
                {geometryType === 'Point' && getPointCoordinates() && markerIcon && (
                  <MarkerF
                    position={getPointCoordinates()}
                    icon={markerIcon}
                    title={projectName || 'Project Location'}
                  />
                )}

                {/* Render temporary marker for clicks */}
                {tempMarkerPosition && markerIcon && (
                  <MarkerF
                    position={{ lat: tempMarkerPosition[0], lng: tempMarkerPosition[1] }}
                    icon={makeMarkerIcon('http://maps.google.com/mapfiles/ms/icons/blue-dot.png', 32)}
                  />
                )}

                {/* Render LineString or MultiPoint as Polyline */}
                {(geometryType === 'LineString' || geometryType === 'MultiPoint') && getMultiPointPath().length > 0 && (
                  <>
                    <PolylineF
                      key={`polyline-${coordinates.multiPointData ? coordinates.multiPointData.substring(0, 50) : ''}`}
                      ref={polylineRef}
                      path={getMultiPointPath()}
                      editable={editing}
                      draggable={false}
                      onEdit={(e) => {
                        if (editing && e && e.getPath) {
                          try {
                            const path = e.getPath();
                            const newPath = [];
                            path.forEach((latLng) => {
                              newPath.push(`${latLng.lng().toFixed(6)}, ${latLng.lat().toFixed(6)}`);
                            });
                            const updatedMultiPointData = newPath.join('\n');
                            console.log('[ProjectMapEditor] Polyline edited, new path:', updatedMultiPointData);
                            console.log('[ProjectMapEditor] Number of points:', newPath.length);
                            // Store in ref for immediate access (critical for save)
                            latestEditedPathRef.current = updatedMultiPointData;
                            // Also update state
                            setCoordinates(prev => {
                              const updated = {
                                ...prev,
                                multiPointData: updatedMultiPointData
                              };
                              console.log('[ProjectMapEditor] Updated coordinates state:', updated);
                              return updated;
                            });
                          } catch (err) {
                            console.error('[ProjectMapEditor] Error in onEdit handler:', err);
                          }
                        }
                      }}
                      onEditEnd={(e) => {
                        // Capture final edited state when user finishes editing
                        if (editing && e && e.getPath) {
                          try {
                            const path = e.getPath();
                            const newPath = [];
                            path.forEach((latLng) => {
                              newPath.push(`${latLng.lng().toFixed(6)}, ${latLng.lat().toFixed(6)}`);
                            });
                            const updatedMultiPointData = newPath.join('\n');
                            console.log('[ProjectMapEditor] Polyline edit ended, final path:', updatedMultiPointData);
                            // Store in ref for immediate access (critical for save)
                            latestEditedPathRef.current = updatedMultiPointData;
                            // Also update state
                            setCoordinates(prev => ({
                              ...prev,
                              multiPointData: updatedMultiPointData
                            }));
                          } catch (err) {
                            console.error('[ProjectMapEditor] Error in onEditEnd handler:', err);
                          }
                        }
                      }}
                      onClick={(e) => {
                        if (editing && e.latLng) {
                          // Add a new point at the clicked location
                          const clickedLat = e.latLng.lat();
                          const clickedLng = e.latLng.lng();
                          const newPoint = `${clickedLng.toFixed(6)}, ${clickedLat.toFixed(6)}`;
                          setCoordinates(prev => {
                            const updated = {
                              ...prev,
                              multiPointData: prev.multiPointData ? `${prev.multiPointData}\n${newPoint}` : newPoint
                            };
                            // Update the ref so save can use the latest coordinates
                            latestEditedPathRef.current = updated.multiPointData;
                            return updated;
                          });
                        }
                      }}
                      options={{
                        strokeColor: "#FF0000",
                        strokeWeight: 4,
                        strokeOpacity: 0.8
                      }}
                    />
                    {/* Render vertex markers when editing */}
                    {editing && getMultiPointPath().map((point, index) => (
                      <MarkerF
                        key={`vertex-${index}`}
                        position={point}
                        icon={makeMarkerIcon('http://maps.google.com/mapfiles/ms/icons/blue-dot.png', 20)}
                        draggable={true}
                        onDragEnd={(e) => {
                          if (e.latLng) {
                            const newLat = e.latLng.lat();
                            const newLng = e.latLng.lng();
                            const path = getMultiPointPath();
                            path[index] = { lat: newLat, lng: newLng };
                            const newPath = path.map(p => `${p.lng.toFixed(6)}, ${p.lat.toFixed(6)}`);
                            const updatedMultiPointData = newPath.join('\n');
                            console.log('[ProjectMapEditor] Vertex dragged, updated path:', updatedMultiPointData);
                            // Store in ref for immediate access
                            latestEditedPathRef.current = updatedMultiPointData;
                            setCoordinates(prev => ({
                              ...prev,
                              multiPointData: updatedMultiPointData
                            }));
                          }
                        }}
                        onClick={() => {
                          setSelectedPointIndex(index);
                        }}
                        title={`Point ${index + 1} - Click to select, drag to move`}
                        zIndex={1000}
                      />
                    ))}
                  </>
                )}

                {/* Render Polygon */}
                {geometryType === 'Polygon' && getPolygonPath().length > 0 && (
                  <>
                    <PolygonF
                      key={`polygon-${coordinates.multiPointData ? coordinates.multiPointData.substring(0, 50) : ''}`}
                      ref={polygonRef}
                      paths={getPolygonPath()}
                      editable={editing}
                      draggable={false}
                      onEdit={(e) => {
                        if (editing && e && e.getPath) {
                          try {
                            const path = e.getPath();
                            const newPath = [];
                            path.forEach((latLng) => {
                              newPath.push(`${latLng.lng().toFixed(6)}, ${latLng.lat().toFixed(6)}`);
                            });
                            // Remove duplicate last point (polygon closing point)
                            if (newPath.length > 1 && newPath[0] === newPath[newPath.length - 1]) {
                              newPath.pop();
                            }
                            const updatedMultiPointData = newPath.join('\n');
                            console.log('[ProjectMapEditor] Polygon edited, new path:', updatedMultiPointData);
                            console.log('[ProjectMapEditor] Number of vertices:', newPath.length);
                            // Store in ref for immediate access (critical for save)
                            latestEditedPathRef.current = updatedMultiPointData;
                            // Also update state
                            setCoordinates(prev => {
                              const updated = {
                                ...prev,
                                multiPointData: updatedMultiPointData
                              };
                              console.log('[ProjectMapEditor] Updated coordinates state:', updated);
                              return updated;
                            });
                          } catch (err) {
                            console.error('[ProjectMapEditor] Error in polygon onEdit handler:', err);
                          }
                        }
                      }}
                      onEditEnd={(e) => {
                        // Capture final edited state when user finishes editing
                        if (editing && e && e.getPath) {
                          try {
                            const path = e.getPath();
                            const newPath = [];
                            path.forEach((latLng) => {
                              newPath.push(`${latLng.lng().toFixed(6)}, ${latLng.lat().toFixed(6)}`);
                            });
                            // Remove duplicate last point (polygon closing point)
                            if (newPath.length > 1 && newPath[0] === newPath[newPath.length - 1]) {
                              newPath.pop();
                            }
                            const updatedMultiPointData = newPath.join('\n');
                            console.log('[ProjectMapEditor] Polygon edit ended, final path:', updatedMultiPointData);
                            // Store in ref for immediate access (critical for save)
                            latestEditedPathRef.current = updatedMultiPointData;
                            // Also update state
                            setCoordinates(prev => ({
                              ...prev,
                              multiPointData: updatedMultiPointData
                            }));
                          } catch (err) {
                            console.error('[ProjectMapEditor] Error in polygon onEditEnd handler:', err);
                          }
                        }
                      }}
                      onClick={(e) => {
                        if (editing && e.latLng) {
                          // Add a new point at the clicked location
                          const clickedLat = e.latLng.lat();
                          const clickedLng = e.latLng.lng();
                          const newPoint = `${clickedLng.toFixed(6)}, ${clickedLat.toFixed(6)}`;
                          setCoordinates(prev => {
                            const updated = {
                              ...prev,
                              multiPointData: prev.multiPointData ? `${prev.multiPointData}\n${newPoint}` : newPoint
                            };
                            // Update the ref so save can use the latest coordinates
                            latestEditedPathRef.current = updated.multiPointData;
                            return updated;
                          });
                        }
                      }}
                      options={{
                        fillColor: "#FF0000",
                        fillOpacity: 0.35,
                        strokeColor: "#FF0000",
                        strokeWeight: 2,
                        strokeOpacity: 0.8
                      }}
                    />
                    {/* Render vertex markers when editing (excluding duplicate closing point) */}
                    {editing && getMultiPointPath().map((point, index) => (
                      <MarkerF
                        key={`vertex-${index}`}
                        position={point}
                        icon={makeMarkerIcon('http://maps.google.com/mapfiles/ms/icons/blue-dot.png', 20)}
                        draggable={true}
                        onDragEnd={(e) => {
                          if (e.latLng) {
                            const newLat = e.latLng.lat();
                            const newLng = e.latLng.lng();
                            const path = getMultiPointPath();
                            const realPath = path.slice(0, -1); // Remove closing point for editing
                            realPath[index] = { lat: newLat, lng: newLng };
                            const newPath = realPath.map(p => `${p.lng.toFixed(6)}, ${p.lat.toFixed(6)}`);
                            const updatedMultiPointData = newPath.join('\n');
                            console.log('[ProjectMapEditor] Polygon vertex dragged, updated path:', updatedMultiPointData);
                            // Store in ref for immediate access
                            latestEditedPathRef.current = updatedMultiPointData;
                            setCoordinates(prev => ({
                              ...prev,
                              multiPointData: updatedMultiPointData
                            }));
                          }
                        }}
                        onClick={() => {
                          setSelectedPointIndex(index);
                        }}
                        title={`Vertex ${index + 1} - Click to select, drag to move`}
                        zIndex={1000}
                      />
                    ))}
                  </>
                )}
              </GoogleMapComponent>
              </Box>
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 2, bgcolor: 'background.default' }}>
          <Button
            onClick={handleCancel}
            variant="outlined"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            disabled={saving}
          >
            {saving ? <CircularProgress size={24} /> : 'Save Location'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar - shows after modal closes */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity="success" 
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

ProjectMapEditor.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  projectName: PropTypes.string
};

export default ProjectMapEditor;

