import { afterEach, describe, expect, it, vi } from 'vitest';
import { detourViaPoints, fetchRouteOptions, routesOverlap, type RouteOption } from './routingService';

const line = (from: [number, number], to: [number, number], n = 20) =>
  Array.from({ length: n }, (_, i) => ({
    lat: from[0] + ((to[0] - from[0]) * i) / (n - 1),
    lng: from[1] + ((to[1] - from[1]) * i) / (n - 1),
  }));

const route = (geometry: RouteOption['geometry'], duration: number, distance = 10000): RouteOption =>
  ({ geometry, duration, distance, summary: 'r' });

// Minimal polyline encoder so the mocked OSRM response can be decoded by the real code.
function encode(points: { lat: number; lng: number }[]): string {
  let out = '', pLat = 0, pLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5), lng = Math.round(p.lng * 1e5);
    out += enc(lat - pLat) + enc(lng - pLng);
    pLat = lat; pLng = lng;
  }
  return out;
}

const osrm = (routes: { geometry: { lat: number; lng: number }[]; duration: number; distance: number }[]) =>
  ({ ok: true, json: async () => ({ code: 'Ok', routes: routes.map((r) => ({ ...r, geometry: encode(r.geometry), legs: [{ summary: 'Road' }] })) }) });

afterEach(() => vi.unstubAllGlobals());

describe('route options', () => {
  it('treats routes on the same road as overlapping and different roads as distinct', () => {
    const a = route(line([12, 77], [12.1, 77.1]), 600);
    const b = route(line([12, 77], [12.1, 77.1], 35), 620);
    const c = route([...line([12, 77], [12.1, 77]), ...line([12.1, 77], [12.1, 77.1])], 700);
    expect(routesOverlap(a, b)).toBe(true);
    expect(routesOverlap(c, a)).toBe(false);
  });

  it('places detour points on both sides of the straight line', () => {
    const [left, right] = detourViaPoints({ lat: 12, lng: 77 }, { lat: 12, lng: 78 });
    expect(left.lat).toBeGreaterThan(12);
    expect(right.lat).toBeLessThan(12);
    expect(left.lng).toBeCloseTo(77.5);
  });

  it('adds distinct detour routes when the router returns only one, fastest first', async () => {
    const direct = line([12, 77], [12, 77.2]);
    const north = [...line([12, 77], [12.05, 77.1]), ...line([12.05, 77.1], [12, 77.2])];
    const south = [...line([12, 77], [11.95, 77.1]), ...line([11.95, 77.1], [12, 77.2])];
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes(';') || url.split(';').length === 2) return osrm([{ geometry: direct, duration: 1000, distance: 20000 }]);
      const via = url.split('/driving/')[1].split(';')[1];
      const viaLat = Number(via.split(',')[1]);
      return osrm([{ geometry: viaLat > 12 ? north : south, duration: viaLat > 12 ? 1300 : 1200, distance: 23000 }]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const options = await fetchRouteOptions({ lat: 12, lng: 77 }, { lat: 12, lng: 77.2 });
    expect(options.map((o) => o.duration)).toEqual([1000, 1200, 1300]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('drops detours that are much slower than the best route', async () => {
    const direct = line([12, 77], [12, 77.2]);
    const far = [...line([12, 77], [12.3, 77.1]), ...line([12.3, 77.1], [12, 77.2])];
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.split(';').length === 2
        ? osrm([{ geometry: direct, duration: 1000, distance: 20000 }])
        : osrm([{ geometry: far, duration: 2500, distance: 60000 }])));

    const options = await fetchRouteOptions({ lat: 12, lng: 77 }, { lat: 12, lng: 77.2 });
    expect(options).toHaveLength(1);
  });
});
