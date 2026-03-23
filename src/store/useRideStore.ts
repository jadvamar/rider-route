import { create } from 'zustand';
import type { Ride, RiderSession, Alert, LatLng } from '@/types';

interface RideState {
  currentRide: Ride | null;
  riders: Map<string, RiderSession>;
  alerts: Alert[];
  rideHistory: Ride[];

  createRide: (ride: Ride) => void;
  joinRide: (ride: Ride, rider: RiderSession) => void;
  leaveRide: () => void;
  updateRiderLocation: (userId: string, location: LatLng, heading: number, speed: number) => void;
  addRider: (rider: RiderSession) => void;
  removeRider: (userId: string) => void;
  addAlert: (alert: Alert) => void;
  dismissAlert: (alertId: string) => void;
  startRide: () => void;
  endRide: () => void;
  setRiderOnRoute: (userId: string, isOnRoute: boolean) => void;
}

export const useRideStore = create<RideState>((set, get) => ({
  currentRide: null,
  riders: new Map(),
  alerts: [],
  rideHistory: [],

  createRide: (ride) => {
    set({ currentRide: ride, riders: new Map() });
  },

  joinRide: (ride, rider) => {
    const riders = new Map(get().riders);
    riders.set(rider.userId, rider);
    set({ currentRide: ride, riders });
  },

  leaveRide: () => {
    set({ currentRide: null, riders: new Map(), alerts: [] });
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
}));
