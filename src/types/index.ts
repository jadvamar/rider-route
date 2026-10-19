export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Ride {
  id: string;
  name: string;
  code: string;
  leaderId: string;
  startLocation: LatLng;
  destination: LatLng;
  startAddress: string;
  destAddress: string;
  route: LatLng[];
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  status: 'waiting' | 'active' | 'completed';
  createdAt: number;
  activeSOS?: {
    userId: string;
    userName: string;
    location?: LatLng;
    timestamp: number;
  };
}

export interface RiderSession {
  userId: string;
  userName: string;
  avatar?: string;
  isLeader: boolean;
  location: LatLng;
  heading: number;
  speed: number; // km/h
  lastUpdate: number;
  isOnRoute: boolean;
  isOnline: boolean;
  routeFollowed: LatLng[];
  /** Closed the ride or removed it from history: location is no longer shared. */
  hasLeft?: boolean;
}

export interface RiderDistance {
  riderId: string;
  distance: number; // meters
  eta: number; // seconds
}

export interface Alert {
  id: string;
  type: 'wrong_route' | 'sos' | 'info';
  fromUserId: string;
  fromUserName: string;
  toUserId?: string;
  message: string;
  location?: LatLng;
  timestamp: number;
}

// WebSocket event types
export type WSEvent =
  | { type: 'JOIN_RIDE'; payload: { rideId: string; rider: RiderSession } }
  | { type: 'LEAVE_RIDE'; payload: { rideId: string; userId: string } }
  | { type: 'LOCATION_UPDATE'; payload: { rideId: string; userId: string; location: LatLng; heading: number; speed: number } }
  | { type: 'SEND_ALERT'; payload: Alert }
  | { type: 'SOS_TRIGGER'; payload: Alert }
  | { type: 'RIDE_START'; payload: { rideId: string } }
  | { type: 'RIDE_END'; payload: { rideId: string } };
