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

// Fetch turn-by-turn routes from OSRM, optionally forced through via points
export async function fetchRoutes(start: LatLng, end: LatLng, via: LatLng[] = []): Promise<RouteOption[]> {
  const coords = [start, ...via, end].map((p) => `${p.lng},${p.lat}`).join(';');
  const alternatives = via.length === 0 ? '3' : 'false';
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?alternatives=${alternatives}&overview=full&geometries=polyline&steps=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch route');

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No routes found');
  }

  return data.routes.map((route: { distance: number; duration: number; geometry: string; legs?: { summary: string }[] }) => {
    const names = [...new Set((route.legs || []).flatMap((leg) => leg.summary.split(',')).map((s) => s.trim()).filter(Boolean))];
    return {
      distance: route.distance,
      duration: route.duration,
      geometry: decodePolyline(route.geometry),
      summary: names.slice(0, 2).join(', ') || 'Route',
    };
  });
}

function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  // Local flat projection in metres around p is accurate enough at road scale.
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lng - p.lng) * mPerLng, ay = (a.lat - p.lat) * mPerLat;
  const bx = (b.lng - p.lng) * mPerLng, by = (b.lat - p.lat) * mPerLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function samplePoints(points: LatLng[], count: number): LatLng[] {
  if (points.length <= count) return points;
  const step = (points.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => points[Math.round(i * step)]);
}

// Two routes are treated as the same if most of one lies on top of the other.
export function routesOverlap(a: RouteOption, b: RouteOption, toleranceMeters = 80, threshold = 0.85): boolean {
  const probe = samplePoints(a.geometry, 40);
  const target = samplePoints(b.geometry, 400);
  if (probe.length === 0 || target.length === 0) return false;
  const near = (p: LatLng) =>
    target.length === 1
      ? metersBetween(p, target[0]) <= toleranceMeters
      : target.slice(1).some((q, i) => distanceToSegment(p, target[i], q) <= toleranceMeters);
  const close = probe.filter(near).length;
  return close / probe.length >= threshold;
}

// Points beside the midpoint of the straight line, used to coax out genuinely different roads.
export function detourViaPoints(start: LatLng, end: LatLng, factors = [0.25, -0.25]): LatLng[] {
  const midLat = (start.lat + end.lat) / 2;
  const midLng = (start.lng + end.lng) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180) || 1;
  const dx = (end.lng - start.lng) * cos;
  const dy = end.lat - start.lat;
  return factors.map((f) => ({ lat: midLat + dx * f, lng: midLng + (-dy * f) / cos }));
}

/**
 * Up to `max` distinct route choices, fastest first, similar to a map app's
 * "suggested routes". Detours are only kept if they are not unreasonably long.
 */
export async function fetchRouteOptions(start: LatLng, end: LatLng, max = 3): Promise<RouteOption[]> {
  const options: RouteOption[] = [];
  const addIfDistinct = (route: RouteOption) => {
    if (options.length >= max) return;
    if (options.some((o) => routesOverlap(route, o) || routesOverlap(o, route))) return;
    options.push(route);
  };

  (await fetchRoutes(start, end)).forEach(addIfDistinct);

  if (options.length < max) {
    const best = options[0];
    const vias = detourViaPoints(start, end, [0.08, -0.08, 0.15, -0.15, 0.25, -0.25]);
    const detours = await Promise.allSettled(vias.map((via) => fetchRoutes(start, end, [via])));
    detours
      .flatMap((result) => (result.status === 'fulfilled' ? result.value.slice(0, 1) : []))
      .filter((route) => route.duration <= best.duration * 1.5 && route.distance <= best.distance * 1.5)
      .sort((a, b) => a.duration - b.duration)
      .forEach(addIfDistinct);
  }

  return options.sort((a, b) => a.duration - b.duration);
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

// Reverse geocode coordinates to address using Nominatim
export async function reverseGeocodeAddress(coords: LatLng): Promise<string> {
  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'RideTrackApp/1.0' },
  });
  if (!res.ok) throw new Error('Reverse geocoding failed');

  const data = await res.json();
  return data.display_name || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
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
