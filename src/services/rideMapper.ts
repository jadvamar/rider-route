import type { Ride, RiderSession } from '@/types';
import type { ApiRide } from '@/services/api';

function mapStatus(status: ApiRide['status']): Ride['status'] {
  if (status === 'ACTIVE') return 'active';
  if (status === 'COMPLETED') return 'completed';
  return 'waiting';
}

export function mapApiRideToRide(apiRide: ApiRide): Ride {
  return {
    id: apiRide.id,
    name: apiRide.name,
    code: apiRide.code,
    leaderId: apiRide.leaderId,
    startLocation: apiRide.startLocation,
    destination: apiRide.destination,
    startAddress: apiRide.startAddress,
    destAddress: apiRide.destAddress,
    route: apiRide.route,
    distanceMeters: apiRide.distanceMeters,
    durationSeconds: apiRide.durationSeconds,
    status: mapStatus(apiRide.status),
    createdAt: new Date(apiRide.createdAt).getTime(),
    activeSOS: apiRide.activeSOS ? {
      userId: apiRide.activeSOS.userId,
      userName: apiRide.activeSOS.userName,
      location: apiRide.activeSOS.location,
      timestamp: apiRide.activeSOS.timestamp,
    } : undefined,
  };
}

export function mapApiRidersToSessions(apiRide: ApiRide): RiderSession[] {
  return (apiRide.riders || []).map((r) => ({
    userId: r.userId,
    userName: r.userName,
    avatar: r.avatar,
    isLeader: r.leader,
    location: r.location || apiRide.startLocation,
    heading: r.heading || 0,
    speed: r.speed || 0,
    lastUpdate: r.lastUpdate ? new Date(r.lastUpdate).getTime() : Date.now(),
    isOnRoute: r.onRoute ?? true,
    isOnline: r.online ?? true,
    routeFollowed: r.routeFollowed || [],
  }));
}
