import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF, PolygonF, PolylineF } from '@react-google-maps/api';
import { CircularProgress, Alert, Box, ToggleButton, ToggleButtonGroup, Paper } from '@mui/material';
import { Map, Terrain } from '@mui/icons-material';

// Define the Google Maps libraries
const libraries = ['places'];

// Helper function to extract all coordinates from a GeoJSON geometry object
const extractCoordinates = (geometry) => {
    if (!geometry) return [];
    if (geometry.type === 'Point') return [geometry.coordinates];
    if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') return geometry.coordinates;
    if (geometry.type === 'Polygon') return geometry.coordinates[0];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(Infinity);
    return [];
};

// Helper function to calculate center and bounds from GeoJSON
const calculateMapBounds = (geoJson) => {
    if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
        return null;
    }

    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
    let hasValidCoords = false;

    geoJson.features.forEach(feature => {
        const coords = extractCoordinates(feature.geometry);
        coords.forEach(coord => {
            const [lng, lat] = coord;
            if (isFinite(lat) && isFinite(lng)) {
                minLat = Math.min(minLat, lat);
                minLng = Math.min(minLng, lng);
                maxLat = Math.max(maxLat, lat);
                maxLng = Math.max(maxLng, lng);
                hasValidCoords = true;
            }
        });
    });

    if (!hasValidCoords) return null;

    const center = {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2
    };

    const bounds = {
        north: maxLat,
        south: minLat,
        east: maxLng,
        west: minLng
    };

    return { center, bounds };
};

function ReadOnlyMapComponentWithApiKey({ apiKey, geoJson, projectName, style = { height: '400px', width: '100%' } }) {
    const mapRef = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapType, setMapType] = useState('roadmap'); // 'roadmap' or 'terrain'

    // Debug: Log the geoJson prop to see what we're receiving
    useEffect(() => {
        if (geoJson) {
            console.log('[ReadOnlyMapComponent] Received geoJson:', geoJson);
            console.log('[ReadOnlyMapComponent] Has features?', geoJson.features);
            console.log('[ReadOnlyMapComponent] Features count:', geoJson.features?.length);
        } else {
            console.log('[ReadOnlyMapComponent] No geoJson provided');
        }
    }, [geoJson]);

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey,
        libraries,
    });

    const mapBounds = useMemo(() => {
        return geoJson ? calculateMapBounds(geoJson) : null;
    }, [geoJson]);

    const defaultCenter = useMemo(() => {
        // Default center for Kenya if no map data
        return { lat: 0.0236, lng: 37.9062 };
    }, []);

    const center = mapBounds?.center || defaultCenter;
    const defaultZoom = mapBounds ? 12 : 6;

    const onLoad = useCallback((map) => {
        mapRef.current = map;
        setMapLoaded(true);
        
        // Fit bounds if we have map data - use setTimeout to ensure map is fully initialized
        if (mapBounds && mapBounds.bounds && window.google && window.google.maps) {
            setTimeout(() => {
                try {
                    const bounds = new window.google.maps.LatLngBounds(
                        new window.google.maps.LatLng(mapBounds.bounds.south, mapBounds.bounds.west),
                        new window.google.maps.LatLng(mapBounds.bounds.north, mapBounds.bounds.east)
                    );
                    map.fitBounds(bounds, { padding: 50 });
                    console.log('[ReadOnlyMapComponent] Fitted bounds to:', mapBounds.bounds);
                } catch (error) {
                    console.error('[ReadOnlyMapComponent] Error fitting bounds:', error);
                }
            }, 100);
        }
    }, [mapBounds]);

    const onUnmount = useCallback(() => {
        mapRef.current = null;
        setMapLoaded(false);
    }, []);

    const handleMapTypeChange = (event, newMapType) => {
        if (newMapType !== null) {
            setMapType(newMapType);
            if (mapRef.current) {
                mapRef.current.setMapTypeId(newMapType === 'terrain' ? 'terrain' : 'roadmap');
            }
        }
    };

    // Update map type when it changes
    useEffect(() => {
        if (mapRef.current && mapLoaded) {
            mapRef.current.setMapTypeId(mapType === 'terrain' ? 'terrain' : 'roadmap');
        }
    }, [mapType, mapLoaded]);

    // Force map to redraw overlays when geoJson changes
    useEffect(() => {
        if (mapRef.current && mapLoaded && geoJson && geoJson.features) {
            // Small delay to ensure map is ready
            setTimeout(() => {
                if (mapRef.current) {
                    // Trigger a redraw by briefly changing zoom
                    const currentZoom = mapRef.current.getZoom();
                    mapRef.current.setZoom(currentZoom);
                    console.log('[ReadOnlyMapComponent] Forced map redraw');
                }
            }, 500);
        }
    }, [geoJson, mapLoaded]);

    if (loadError) {
        return (
            <Alert severity="error" sx={{ m: 1 }}>
                Error loading Google Maps: {loadError.message}. Check the key, billing, and HTTP referrer restrictions
                for this origin.
            </Alert>
        );
    }

    if (!isLoaded) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: style.height || '400px' }}>
                <CircularProgress />
                <Box sx={{ ml: 2 }}>Loading map...</Box>
            </Box>
        );
    }

    if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
        return (
            <Box sx={{ position: 'relative', ...style }}>
                <GoogleMap
                    mapContainerStyle={style}
                    center={center}
                    zoom={defaultZoom}
                    onLoad={onLoad}
                    onUnmount={onUnmount}
                    options={{
                        fullscreenControl: false,
                        mapTypeControl: false,
                        streetViewControl: false,
                        zoomControl: true,
                        mapTypeId: mapType === 'terrain' ? 'terrain' : 'roadmap',
                        disableDefaultUI: false,
                    }}
                />
                <Paper 
                    elevation={3}
                    sx={{ 
                        position: 'absolute', 
                        top: 10, 
                        right: 10, 
                        zIndex: 10,
                        p: 0.5
                    }}
                >
                    <ToggleButtonGroup
                        value={mapType}
                        exclusive
                        onChange={handleMapTypeChange}
                        aria-label="map type"
                        size="small"
                    >
                        <ToggleButton value="roadmap" aria-label="map">
                            <Map sx={{ fontSize: 18, mr: 0.5 }} />
                            Map
                        </ToggleButton>
                        <ToggleButton value="terrain" aria-label="terrain">
                            <Terrain sx={{ fontSize: 18, mr: 0.5 }} />
                            Terrain
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Paper>
                <Alert severity="info" sx={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 10 }}>
                    No location data available for this project
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', ...style }}>
            <GoogleMap
                mapContainerStyle={style}
                center={center}
                zoom={defaultZoom}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                    fullscreenControl: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                    zoomControl: true,
                    mapTypeId: mapType === 'terrain' ? 'terrain' : 'roadmap',
                    disableDefaultUI: false,
                }}
            >
                {geoJson.features.map((feature, index) => {
                    if (!feature || !feature.geometry) {
                        console.warn('[ReadOnlyMapComponent] Feature missing geometry:', feature);
                        return null;
                    }
                    
                    const { type, coordinates } = feature.geometry;
                    const key = `feature-${index}-${type}`;
                    
                    if (!type || !coordinates) {
                        console.warn('[ReadOnlyMapComponent] Feature missing type or coordinates:', feature);
                        return null;
                    }
                    
                    console.log(`[ReadOnlyMapComponent] Rendering ${type} with`, coordinates.length, 'coordinates');
                    console.log(`[ReadOnlyMapComponent] First coordinate:`, coordinates[0]);
                    console.log(`[ReadOnlyMapComponent] Last coordinate:`, coordinates[coordinates.length - 1]);

                    switch (type) {
                        case 'Point':
                            const pointPosition = { lat: coordinates[1], lng: coordinates[0] };
                            console.log('[ReadOnlyMapComponent] Rendering Point at:', pointPosition);
                            return (
                                <MarkerF
                                    key={key}
                                    position={pointPosition}
                                    title={projectName || feature.properties?.name || 'Project Location'}
                                    icon={{
                                        url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                                        scaledSize: window.google?.maps ? new window.google.maps.Size(40, 40) : undefined,
                                        anchor: window.google?.maps ? new window.google.maps.Point(20, 40) : undefined,
                                    }}
                                />
                            );
                        case 'LineString':
                            const linePath = coordinates.map(coord => {
                                // Handle both [lng, lat] and [lat, lng] formats
                                // GeoJSON uses [lng, lat] format
                                if (Array.isArray(coord) && coord.length >= 2) {
                                    const lat = parseFloat(coord[1]);
                                    const lng = parseFloat(coord[0]);
                                    if (isNaN(lat) || isNaN(lng)) {
                                        console.warn('[ReadOnlyMapComponent] Invalid coordinate:', coord);
                                        return null;
                                    }
                                    return { lat, lng };
                                }
                                return null;
                            }).filter(Boolean);
                            
                            if (linePath.length === 0) {
                                console.warn('[ReadOnlyMapComponent] LineString has no valid coordinates');
                                return null;
                            }
                            
                            console.log('[ReadOnlyMapComponent] Rendering LineString with', linePath.length, 'points');
                            console.log('[ReadOnlyMapComponent] LineString path sample (first 3):', linePath.slice(0, 3));
                            console.log('[ReadOnlyMapComponent] LineString path sample (last 3):', linePath.slice(-3));
                            
                            // Ensure we have valid coordinates
                            const validPath = linePath.filter(p => 
                                typeof p.lat === 'number' && 
                                typeof p.lng === 'number' && 
                                !isNaN(p.lat) && 
                                !isNaN(p.lng) &&
                                p.lat >= -90 && p.lat <= 90 &&
                                p.lng >= -180 && p.lng <= 180
                            );
                            
                            if (validPath.length === 0) {
                                console.error('[ReadOnlyMapComponent] No valid coordinates after filtering');
                                return null;
                            }
                            
                            console.log('[ReadOnlyMapComponent] Valid path length:', validPath.length);
                            
                            // Convert to Google Maps LatLng objects if available
                            let pathToUse = validPath;
                            if (window.google && window.google.maps) {
                                try {
                                    pathToUse = validPath.map(p => 
                                        new window.google.maps.LatLng(p.lat, p.lng)
                                    );
                                    console.log('[ReadOnlyMapComponent] Converted to LatLng objects');
                                } catch (e) {
                                    console.warn('[ReadOnlyMapComponent] Error creating LatLng objects, using plain objects:', e);
                                }
                            }
                            
                            // Enhanced styling for better visibility
                            const polylineOptions = {
                                strokeColor: '#E63946', // Vibrant red for maximum visibility
                                strokeOpacity: 0.9,
                                strokeWeight: 8, // Thicker line
                                zIndex: 1000,
                                // Add a white outline/shadow effect for better contrast
                                geodesic: false,
                            };
                            
                            // Add directional arrows for better visibility (optional, only if API is available)
                            if (window.google && window.google.maps && window.google.maps.SymbolPath) {
                                polylineOptions.icons = [{
                                    icon: {
                                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                                        scale: 5,
                                        strokeColor: '#E63946',
                                        fillColor: '#E63946',
                                        fillOpacity: 1.0,
                                        strokeWeight: 2,
                                    },
                                    offset: '50%',
                                    repeat: '80px' // More frequent arrows
                                }];
                            }
                            
                            return (
                                <>
                                    {/* Render a thicker white/light outline for contrast */}
                                    {window.google && window.google.maps && (
                                        <PolylineF
                                            key={`${key}-outline`}
                                            path={pathToUse}
                                            options={{
                                                strokeColor: '#FFFFFF',
                                                strokeOpacity: 0.8,
                                                strokeWeight: 12, // White outline
                                                zIndex: 999,
                                                geodesic: false,
                                            }}
                                        />
                                    )}
                                    {/* Main colored line */}
                                    <PolylineF
                                        key={key}
                                        path={pathToUse}
                                        options={polylineOptions}
                                    />
                                </>
                            );
                        case 'Polygon':
                            const polygonPath = coordinates[0].map(coord => ({ lat: coord[1], lng: coord[0] }));
                            console.log('[ReadOnlyMapComponent] Rendering Polygon with', polygonPath.length, 'points');
                            return (
                                <>
                                    {/* Render a white outline for better contrast */}
                                    {window.google && window.google.maps && (
                                        <PolygonF
                                            key={`${key}-outline`}
                                            paths={polygonPath}
                                            options={{
                                                strokeColor: '#FFFFFF',
                                                strokeOpacity: 0.9,
                                                strokeWeight: 8, // White outline
                                                fillColor: '#FFFFFF',
                                                fillOpacity: 0.3,
                                                zIndex: 999,
                                            }}
                                        />
                                    )}
                                    {/* Main colored polygon */}
                                    <PolygonF
                                        key={key}
                                        paths={polygonPath}
                                        options={{
                                            strokeColor: '#E63946', // Vibrant red for maximum visibility
                                            strokeOpacity: 1.0,
                                            strokeWeight: 5,
                                            fillColor: '#E63946',
                                            fillOpacity: 0.35,
                                            zIndex: 1000,
                                        }}
                                    />
                                </>
                            );
                        case 'MultiPoint':
                            return (
                                <React.Fragment key={key}>
                                    {coordinates.map((coord, coordIndex) => (
                                        <MarkerF
                                            key={`${key}-${coordIndex}`}
                                            position={{ lat: coord[1], lng: coord[0] }}
                                            title={projectName || feature.properties?.name || 'Project Location'}
                                            icon={{
                                                url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                                                scaledSize: window.google?.maps ? new window.google.maps.Size(32, 32) : undefined,
                                                anchor: window.google?.maps ? new window.google.maps.Point(16, 32) : undefined,
                                            }}
                                        />
                                    ))}
                                </React.Fragment>
                            );
                        case 'MultiPolygon':
                            return (
                                <React.Fragment key={key}>
                                    {coordinates.map((polygon, polyIndex) => {
                                        const polygonPath = polygon[0].map(coord => ({ lat: coord[1], lng: coord[0] }));
                                        return (
                                            <React.Fragment key={`${key}-${polyIndex}`}>
                                                {/* White outline for contrast */}
                                                {window.google && window.google.maps && (
                                                    <PolygonF
                                                        key={`${key}-${polyIndex}-outline`}
                                                        paths={polygonPath}
                                                        options={{
                                                            strokeColor: '#FFFFFF',
                                                            strokeOpacity: 0.9,
                                                            strokeWeight: 8,
                                                            fillColor: '#FFFFFF',
                                                            fillOpacity: 0.3,
                                                            zIndex: 999,
                                                        }}
                                                    />
                                                )}
                                                {/* Main colored polygon */}
                                                <PolygonF
                                                    key={`${key}-${polyIndex}`}
                                                    paths={polygonPath}
                                                    options={{
                                                        strokeColor: '#E63946', // Vibrant red for maximum visibility
                                                        strokeOpacity: 1.0,
                                                        strokeWeight: 5,
                                                        fillColor: '#E63946',
                                                        fillOpacity: 0.35,
                                                        zIndex: 1000,
                                                    }}
                                                />
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        default:
                            console.warn(`Unknown geometry type: ${type}`);
                            return null;
                    }
                })}
            </GoogleMap>
            
            {/* Map Type Toggle */}
            <Paper 
                elevation={3}
                sx={{ 
                    position: 'absolute', 
                    top: 10, 
                    right: 10, 
                    zIndex: 10,
                    p: 0.5
                }}
            >
                <ToggleButtonGroup
                    value={mapType}
                    exclusive
                    onChange={handleMapTypeChange}
                    aria-label="map type"
                    size="small"
                >
                    <ToggleButton value="roadmap" aria-label="map">
                        <Map sx={{ fontSize: 18, mr: 0.5 }} />
                        Map
                    </ToggleButton>
                    <ToggleButton value="terrain" aria-label="terrain">
                        <Terrain sx={{ fontSize: 18, mr: 0.5 }} />
                        Terrain
                    </ToggleButton>
                </ToggleButtonGroup>
            </Paper>
        </Box>
    );
}

function ReadOnlyMapComponent(props) {
    const apiKey = String(import.meta.env.VITE_MAPS_API_KEY || '').trim();
    if (!apiKey) {
        return (
            <Alert severity="warning" sx={{ m: 1 }}>
                Google Maps is not configured. Set <code style={{ userSelect: 'all' }}>VITE_MAPS_API_KEY</code> in{' '}
                <code style={{ userSelect: 'all' }}>public-dashboard/.env.development</code> (or your deploy env),
                restart Vite, and allow this web origin on the API key.
            </Alert>
        );
    }
    return <ReadOnlyMapComponentWithApiKey apiKey={apiKey} {...props} />;
}

export default ReadOnlyMapComponent;




