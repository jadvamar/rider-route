import type { LatLng } from '@/types';

const OSRM_BASE = 'https://router.project-osrm.org';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export interface RouteOption {
  distance: number; // meters
  duration: number; // seconds
  geometry: LatLng[];
  summary: string;
}

// Decode OSRM polyline (precision 5)
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

// Fetch turn-by-turn routes from OSRM
export async function fetchRoutes(start: LatLng, end: LatLng): Promise<RouteOption[]> {
  const url = `${OSRM_BASE}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?alternatives=true&overview=full&geometries=polyline&steps=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch route');

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No routes found');
  }

  return data.routes.map((route: { distance: number; duration: number; geometry: string; legs: { summary: string }[] }) => ({
    distance: route.distance,
    duration: route.duration,
    geometry: decodePolyline(route.geometry),
    summary: route.legs?.[0]?.summary || 'Route',
  }));
}

// Geocode an address to coordinates using Nominatim
export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeAddress(query: string): Promise<GeocodingResult[]> {
  const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&limit=5`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'RideTrackApp/1.0' },
  });
  if (!res.ok) throw new Error('Geocoding failed');

  const data = await res.json();
  return data.map((item: { lat: string; lon: string; display_name: string }) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: item.display_name,
  }));
}

// Format distance for display
export function formatRouteDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Format duration for display
export function formatRouteDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}
