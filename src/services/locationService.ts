import type { LatLng } from '@/types';

// Haversine formula for distance between two points
export function getDistance(a: LatLng, b: LatLng): number {
  const R = 6371000; // meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Route-based distance: sum of segments from point to destination along route
export function getRouteDistance(position: LatLng, route: LatLng[]): number {
  if (route.length < 2) return 0;
  
  // Find closest point on route
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < route.length; i++) {
    const d = getDistance(position, route[i]);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }

  // Sum remaining route distance
  let total = getDistance(position, route[closestIdx]);
  for (let i = closestIdx; i < route.length - 1; i++) {
    total += getDistance(route[i], route[i + 1]);
  }
  return total;
}

// ETA in seconds given distance (meters) and average speed (km/h)
export function getETA(distanceMeters: number, speedKmh: number): number {
  if (speedKmh <= 0) speedKmh = 30; // default assumption
  return (distanceMeters / 1000 / speedKmh) * 3600;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatETA(seconds: number): string {
  if (seconds < 60) return 'Less than 1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

// Check if rider is near the route (within threshold meters)
export function isOnRoute(position: LatLng, route: LatLng[], thresholdMeters = 100): boolean {
  if (route.length === 0) return true;
  for (const point of route) {
    if (getDistance(position, point) < thresholdMeters) return true;
  }
  return false;
}

// Throttle helper
export function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  }) as T;
}

// Generate a random ride code
export function generateRideCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
