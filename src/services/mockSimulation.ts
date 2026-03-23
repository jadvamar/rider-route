import type { LatLng, RiderSession } from '@/types';

// Simulates other riders moving along a route for demo purposes
const DEMO_RIDERS: Omit<RiderSession, 'location' | 'lastUpdate' | 'routeFollowed'>[] = [
  { userId: 'demo-1', userName: 'Alex', isLeader: false, heading: 0, speed: 35, isOnRoute: true, isOnline: true },
  { userId: 'demo-2', userName: 'Jordan', isLeader: false, heading: 0, speed: 28, isOnRoute: true, isOnline: true },
  { userId: 'demo-3', userName: 'Sam', isLeader: false, heading: 0, speed: 42, isOnRoute: true, isOnline: true },
];

// Generate positions around a center point
function randomOffset(center: LatLng, radius: number): LatLng {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return {
    lat: center.lat + (r * Math.cos(angle)) / 111000,
    lng: center.lng + (r * Math.sin(angle)) / (111000 * Math.cos((center.lat * Math.PI) / 180)),
  };
}

export function createDemoRiders(center: LatLng): RiderSession[] {
  return DEMO_RIDERS.map((r) => ({
    ...r,
    location: randomOffset(center, 500),
    lastUpdate: Date.now(),
    routeFollowed: [],
  }));
}

// Simulate smooth movement
export function simulateMovement(rider: RiderSession, destination: LatLng): RiderSession {
  const dx = destination.lng - rider.location.lng;
  const dy = destination.lat - rider.location.lat;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 0.0001) return rider;
  
  // Move a small step toward destination with some randomness
  const step = 0.0002 + Math.random() * 0.0001;
  const jitter = (Math.random() - 0.5) * 0.00005;
  
  const newLocation: LatLng = {
    lat: rider.location.lat + (dy / dist) * step + jitter,
    lng: rider.location.lng + (dx / dist) * step + jitter,
  };
  
  const heading = (Math.atan2(dx, dy) * 180) / Math.PI;
  
  return {
    ...rider,
    location: newLocation,
    heading,
    speed: 25 + Math.random() * 20,
    lastUpdate: Date.now(),
    routeFollowed: [...rider.routeFollowed.slice(-50), newLocation],
  };
}
