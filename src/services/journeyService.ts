import type { LatLng, Ride } from '@/types';
import { getDistance, getETA, getRouteDistance } from './locationService';

type JourneyRide = Pick<Ride, 'route' | 'distanceMeters' | 'durationSeconds'>;

export function getJourneyTotals(ride: JourneyRide) {
  const geometryDistance = ride.route.reduce((total, point, index) =>
    index === 0 ? total : total + getDistance(ride.route[index - 1], point), 0);
  const savedDistance = ride.distanceMeters;
  const savedDuration = ride.durationSeconds;
  const hasDistance = typeof savedDistance === 'number' && Number.isFinite(savedDistance) && savedDistance >= 0;
  const hasDuration = typeof savedDuration === 'number' && Number.isFinite(savedDuration) && savedDuration >= 0;
  if (!hasDistance && ride.route.length < 2) return null;
  const distance = hasDistance ? savedDistance : geometryDistance;
  return {
    distance,
    duration: hasDuration ? savedDuration : getETA(distance, 30),
    approximate: !hasDistance || !hasDuration,
    geometryDistance,
  };
}

export function getRemainingJourney(ride: JourneyRide, position: LatLng) {
  const totals = getJourneyTotals(ride);
  if (!totals || ride.route.length < 2) return null;
  const remainingGeometry = getRouteDistance(position, ride.route);
  const distance = totals.geometryDistance > 0
    ? remainingGeometry * totals.distance / totals.geometryDistance
    : remainingGeometry;
  return {
    distance,
    duration: totals.distance > 0
      ? totals.duration * distance / totals.distance
      : getETA(distance, 30),
  };
}
