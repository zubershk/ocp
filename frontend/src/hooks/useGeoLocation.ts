import { useState, useCallback } from 'react';
import { useRestaurant } from '../context/RestaurantContext';

interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
  error?: string;
  loading: boolean;
}

export function useGeoLocation() {
  const { config: _config } = useRestaurant();
  const [location, setLocation] = useState<GeoLocation>({ lat: 0, lng: 0, loading: false });

  const detect = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation((prev) => ({ ...prev, error: 'Geolocation not supported', loading: false }));
      return;
    }
    setLocation((prev) => ({ ...prev, loading: true, error: undefined }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng, loading: false });
      },
      (err) => {
        setLocation((prev) => ({ ...prev, loading: false, error: err.message }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return { ...location, detect };
}
