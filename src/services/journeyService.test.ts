import { describe, expect, it } from 'vitest';
import { getJourneyTotals, getRemainingJourney } from './journeyService';
import { mapApiRideToRide } from './rideMapper';
import type { ApiRide } from './api';

const route = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }];
const ride = { route, distanceMeters: 12000, durationSeconds: 1800 };

describe('journey metrics', () => {
  it('preserves the chosen route totals instead of recomputing them', () => {
    expect(getJourneyTotals(ride)).toMatchObject({
      distance: 12000, duration: 1800, approximate: false,
    });
    const apiRide: ApiRide = {
      ...ride, id: 'ride', name: 'Ride', code: 'ABC123', leaderId: 'leader',
      startLocation: route[0], destination: route[1], startAddress: 'Start',
      destAddress: 'Finish', createdAt: '2026-10-15T10:00:00Z', status: 'WAITING',
    };
    expect(mapApiRideToRide(apiRide)).toMatchObject({
      distanceMeters: 12000, durationSeconds: 1800,
    });
  });

  it('projects onto sparse route segments and updates distance and time with progress', () => {
    expect(getRemainingJourney(ride, route[0])).toEqual({ distance: 12000, duration: 1800 });
    const halfway = getRemainingJourney(ride, { lat: 0, lng: 0.05 });
    expect(halfway?.distance).toBeCloseTo(6000);
    expect(halfway?.duration).toBeCloseTo(900);
    expect(getRemainingJourney(ride, route[1])).toEqual({ distance: 0, duration: 0 });
  });

  it('includes distance back to the route when off route', () => {
    const remaining = getRemainingJourney(ride, { lat: 0.01, lng: 0.05 });
    expect(remaining?.distance).toBeGreaterThan(6000);
    expect(remaining?.duration).toBeGreaterThan(900);
  });

  it('labels legacy estimates approximate and does not invent totals for missing routes', () => {
    const legacy = getJourneyTotals({ route });
    expect(legacy?.approximate).toBe(true);
    expect(legacy?.distance).toBeGreaterThan(11000);
    expect(legacy?.duration).toBeCloseTo(legacy!.distance / 1000 / 30 * 3600);
    expect(getJourneyTotals({ route: [], distanceMeters: null, durationSeconds: null })).toBeNull();
    expect(getRemainingJourney({ ...ride, route: [] }, route[0])).toBeNull();
  });

  it('handles zero-length routes and saved zero totals without NaN', () => {
    expect(getRemainingJourney({
      route: [route[0], route[0]], distanceMeters: 0, durationSeconds: 0,
    }, route[0])).toEqual({ distance: 0, duration: 0 });
  });
});
