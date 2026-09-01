import { useState, useEffect, useCallback } from 'react';
import { useRestaurant } from '../context/RestaurantContext';

interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
  error?: string;
  loading: boolean;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeoLocation() {
  const { config } = useRestaurant();
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
