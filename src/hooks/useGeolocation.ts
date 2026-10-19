import { useEffect, useState, useCallback } from 'react';
import type { LatLng } from '@/types';

export interface GeolocationError {
  code: number;
  message: string;
}

export interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  watch?: boolean; // Enable continuous tracking
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 0,
    watch = false,
  } = options;

  const [location, setLocation] = useState<LatLng | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords;
    console.log('📍 Browser geolocation received:', { latitude, longitude });
    console.log('🗺️ Setting location as:', { lat: latitude, lng: longitude });
    setLocation({ lat: latitude, lng: longitude });
    setError(null);
    setLoading(false);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    let message = 'Failed to get location';
    
    if (err.code === err.PERMISSION_DENIED) {
      message = 'Location permission denied. Please enable it in your browser settings.';
      setPermissionStatus('denied');
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      message = 'Location information is unavailable.';
    } else if (err.code === err.TIMEOUT) {
      message = 'Location request timed out.';
    }

    setError({ code: err.code, message });
    setLoading(false);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError({ code: 0, message: 'Geolocation is not supported by your browser' });
      return;
    }

    setLoading(true);
    setPermissionStatus('requesting');

    const options_obj: PositionOptions = {
      enableHighAccuracy,
      timeout,
      maximumAge,
    };

    if (watch) {
      navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        options_obj
      );
      setPermissionStatus('granted');
    } else {
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        options_obj
      );
    }
  }, [enableHighAccuracy, timeout, maximumAge, watch, handleSuccess, handleError]);

  // Auto-request on mount if watch is enabled
  useEffect(() => {
    if (watch) {
      requestLocation();
    }
  }, [watch, requestLocation]);

  return {
    location,
    error,
    loading,
    permissionStatus,
    requestLocation,
  };
}
