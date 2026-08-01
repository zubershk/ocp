import { useState, useEffect, useCallback } from 'react';

interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
  error?: string;
  loading: boolean;
}

// Mira Road East center coordinates
const RESTAURANT_LAT = 19.2919;
const RESTAURANT_LNG = 72.8611;
const MAX_DELIVERY_KM = 8;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeoLocation() {
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
        const km = haversineDistance(RESTAURANT_LAT, RESTAURANT_LNG, lat, lng);
        setLocation({
          lat,
          lng,
          loading: false,
          error: km > MAX_DELIVERY_KM ? `You're ${Math.round(km)} km away — delivery may not be available in your area.` : undefined,
        });
      },
      (err) => {
        setLocation((prev) => ({ ...prev, loading: false, error: err.message }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const distance = location.lat && location.lng
    ? haversineDistance(RESTAURANT_LAT, RESTAURANT_LNG, location.lat, location.lng)
    : null;

  const inRange = distance !== null && distance <= MAX_DELIVERY_KM;

  return { ...location, detect, distance, inRange };
}
