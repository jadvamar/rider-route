import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ride, RiderSession, Alert, LatLng } from '@/types';

export interface RescueRoute {
  sosId: string;
  targetName: string;
  geometry: LatLng[];
  distance: number;
  duration: number;
  direct: boolean;
}

interface SOSAlert {
  userId: string;
  userName: string;
  location?: LatLng;
  timestamp: number;
}

interface RideState {
  currentRide: Ride | null;
  riders: Map<string, RiderSession>;
  alerts: Alert[];
  rideHistory: Ride[];
  activeSOS: SOSAlert | null;
  notificationReceipts: Record<string, true>;
  rescueRoutes: Record<string, RescueRoute>;
  acknowledgeNotification: (id: string) => void;
  saveRescueRoute: (id: string, route: RescueRoute | null) => void;

  createRide: (ride: Ride) => void;
  joinRide: (ride: Ride, rider: RiderSession) => void;
  leaveRide: () => void;
  updateRiderLocation: (userId: string, location: LatLng, heading: number, speed: number) => void;
  addRider: (rider: RiderSession) => void;
  removeRider: (userId: string) => void;
  addAlert: (alert: Alert) => void;
  dismissAlert: (alertId: string) => void;
  setActiveSOS: (sos: SOSAlert | null) => void;
  startRide: () => void;
  endRide: () => void;
  setRiderOnRoute: (userId: string, isOnRoute: boolean) => void;
  hydrateRide: (ride: Ride, riders: RiderSession[]) => void;
}

export const useRideStore = create<RideState>()(persist((set, get) => ({
  currentRide: null,
  riders: new Map(),
  alerts: [],
  rideHistory: [],
  activeSOS: null,
  notificationReceipts: {},
  rescueRoutes: {},

  acknowledgeNotification: (id) => {
    set({ notificationReceipts: { ...get().notificationReceipts, [id]: true } });
  },

  saveRescueRoute: (id, route) => {
    const rescueRoutes = { ...get().rescueRoutes };
    if (route) rescueRoutes[id] = route;
    else delete rescueRoutes[id];
    set({ rescueRoutes });
  },

  createRide: (ride) => {
    set({ currentRide: ride, riders: new Map() });
  },

  joinRide: (ride, rider) => {
    const riders = new Map(get().riders);
    riders.set(rider.userId, rider);
    set({ currentRide: ride, riders });
  },

  leaveRide: () => {
    set({ currentRide: null, riders: new Map(), alerts: [], activeSOS: null });
  },

  updateRiderLocation: (userId, location, heading, speed) => {
    const riders = new Map(get().riders);
    const rider = riders.get(userId);
    if (rider) {
      riders.set(userId, {
        ...rider,
        location,
        heading,
        speed,
        lastUpdate: Date.now(),
        routeFollowed: [...rider.routeFollowed, location],
      });
      set({ riders });
    }
  },

  addRider: (rider) => {
    const riders = new Map(get().riders);
    riders.set(rider.userId, rider);
    set({ riders });
  },

  removeRider: (userId) => {
    const riders = new Map(get().riders);
    riders.delete(userId);
    set({ riders });
  },

  addAlert: (alert) => {
    set({ alerts: [alert, ...get().alerts].slice(0, 20) });
  },

  dismissAlert: (alertId) => {
    set({ alerts: get().alerts.filter((a) => a.id !== alertId) });
  },

  setActiveSOS: (sos) => {
    set({ activeSOS: sos });
  },

  startRide: () => {
    const ride = get().currentRide;
    if (ride) set({ currentRide: { ...ride, status: 'active' } });
  },

  endRide: () => {
    const ride = get().currentRide;
    if (ride) {
      set({
        currentRide: { ...ride, status: 'completed' },
        rideHistory: [...get().rideHistory, { ...ride, status: 'completed' }],
        activeSOS: null,
      });
    }
  },

  setRiderOnRoute: (userId, isOnRoute) => {
    const riders = new Map(get().riders);
    const rider = riders.get(userId);
    if (rider) {
      riders.set(userId, { ...rider, isOnRoute });
      set({ riders });
    }
  },

  hydrateRide: (ride, ridersList) => {
    const riders = new Map<string, RiderSession>();
    ridersList.forEach((r) => riders.set(r.userId, r));
    set({ currentRide: ride, riders });
  },
}), {
  name: 'rider-route-notifications',
  partialize: (state) => ({ notificationReceipts: state.notificationReceipts, rescueRoutes: state.rescueRoutes }),
}));
