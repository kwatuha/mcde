import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, StandaloneSearchBox } from '@react-google-maps/api';
import { CircularProgress, Alert, TextField, Box } from '@mui/material';

// Define the Google Maps libraries you'll use
const libraries = ['places'];

function GoogleMapComponent({ children, center, zoom, style, onCreated, onSearchPlaceChanged, onClick, mapTypeId }) {
  const mapRef = useRef(null);
  const searchBoxRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  const apiKey = import.meta.env.VITE_MAPS_API_KEY;

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const onLoad = useCallback(map => {
    mapRef.current = map;
    setMapLoaded(true);
    
    // Ensure zoom controls are visible and properly positioned
    if (window.google && window.google.maps) {
      // Set map type if provided
      if (mapTypeId) {
        map.setMapTypeId(mapTypeId);
      }
      
      // Set zoom control position explicitly - do this after a small delay to ensure it takes effect
      setTimeout(() => {
        map.setOptions({
          zoomControl: true,
          zoomControlOptions: {
            position: window.google.maps.ControlPosition.RIGHT_CENTER,
          },
        });
      }, 100);
    }
    
    if (onCreated) {
      onCreated(map);
    }
  }, [onCreated, mapTypeId]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !window.google?.maps) return;
    const id = mapTypeId || 'roadmap';
    mapRef.current.setMapTypeId(id);
  }, [mapTypeId, mapLoaded]);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
    setMapLoaded(false);
  }, []);

  // Update map center and zoom when props change
  useEffect(() => {
    if (mapRef.current && mapLoaded && center && typeof center === 'object' && 
        center.lat !== undefined && center.lng !== undefined && 
        !isNaN(center.lat) && !isNaN(center.lng) && zoom) {
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(zoom);
    }
  }, [center, zoom, mapLoaded]);

  const onPlacesChanged = useCallback(() => {
    if (searchBoxRef.current) {
      const places = searchBoxRef.current.getPlaces();
      if (places && places.length > 0) {
        const place = places[0];
        if (mapRef.current) {
          mapRef.current.panTo(place.geometry.location);
          mapRef.current.setZoom(15);
        }
        if (onSearchPlaceChanged) {
          onSearchPlaceChanged(place);
        }
      }
    }
  }, [onSearchPlaceChanged]);


  if (loadError) {
    return <Alert severity="error">Error loading Google Maps: {loadError.message}</Alert>;
  }

  if (!isLoaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: style.height || '500px' }}>
        <CircularProgress />
        <Box sx={{ ml: 2 }}>Loading map...</Box>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', ...style }}>
      <StandaloneSearchBox
        onLoad={ref => searchBoxRef.current = ref}
        onPlacesChanged={onPlacesChanged}
      >
        <TextField
          type="text"
          placeholder="Search for a location..."
          sx={{
            boxSizing: `border-box`,
            border: `1px solid transparent`,
            width: `240px`,
            height: `40px`,
            padding: `0 12px`,
            borderRadius: `3px`,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.3)`,
            fontSize: `14px`,
            outline: `none`,
            textOverflow: `ellipses`,
            position: "absolute",
            left: "50%",
            marginLeft: "-120px",
            top: "10px",
            zIndex: 10,
            backgroundColor: "white",
          }}
        />
      </StandaloneSearchBox>

      <GoogleMap
        mapContainerStyle={style}
        center={center}
        zoom={zoom}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={onClick}
        options={{
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
          zoomControlOptions: {
            position: window.google?.maps?.ControlPosition?.RIGHT_CENTER || 10,
          },
          disableDefaultUI: false,
          mapTypeId: mapTypeId || 'roadmap',
        }}
      >
        {children}
      </GoogleMap>
    </Box>
  );
}

export default GoogleMapComponent;