export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8083/api";
const TOKEN_KEY = "rider_route_token";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!res.ok) {
    let message = `API request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Ignore parse errors and keep fallback message
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export interface ApiLatLng {
  lat: number;
  lng: number;
}

export interface ApiRide {
  id: string;
  name: string;
  code: string;
  leaderId: string;
  startLocation: ApiLatLng;
  destination: ApiLatLng;
  startAddress: string;
  destAddress: string;
  route: ApiLatLng[];
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  status: "WAITING" | "ACTIVE" | "COMPLETED";
  createdAt: string;
  activeSOS?: {
    userId: string;
    userName: string;
    location?: ApiLatLng;
    timestamp: number;
  };
  riders?: {
    userId: string;
    userName: string;
    avatar?: string;
    leader: boolean;
    location?: ApiLatLng;
    heading?: number;
    speed?: number;
    lastUpdate?: string;
    onRoute?: boolean;
    online?: boolean;
    routeFollowed?: ApiLatLng[];
  }[];
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
}

export async function createRide(payload: {
  name: string;
  leaderId: string;
  startLocation: ApiLatLng;
  destination: ApiLatLng;
  startAddress: string;
  destAddress: string;
  route: ApiLatLng[];
  distanceMeters: number;
  durationSeconds: number;
}) {
  return request<ApiRide>("/rides", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRideByCode(code: string) {
  return request<ApiRide>(`/rides/by-code/${encodeURIComponent(code)}`);
}

export async function getRideById(rideId: string) {
  return request<ApiRide>(`/rides/${encodeURIComponent(rideId)}`);
}

export async function joinRide(
  rideId: string,
  payload: {
    userId: string;
    userName: string;
    avatar?: string;
    leader?: boolean;
  },
) {
  return request<ApiRide>(`/rides/${encodeURIComponent(rideId)}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRideStatus(
  rideId: string,
  status: "WAITING" | "ACTIVE" | "COMPLETED",
) {
  return request<ApiRide>(
    `/rides/${encodeURIComponent(rideId)}/status?status=${status}`,
    {
      method: "PATCH",
    },
  );
}

export async function getRidesByUser(userId: string) {
  return request<ApiRide[]>(`/rides/user/${encodeURIComponent(userId)}`);
}

export async function signup(payload: {
  name: string;
  email: string;
  password: string;
}) {
  return request<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function login(payload: { email: string; password: string }) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function me() {
  return request<ApiUser>("/auth/me");
}

// SOS alert functions
export async function triggerSOS(rideId: string, userId: string, userName: string, location?: ApiLatLng) {
  return request<ApiRide>(`/rides/${encodeURIComponent(rideId)}/sos`, {
    method: "POST",
    body: JSON.stringify({ userId, userName, location }),
  });
}

export async function cancelSOS(rideId: string, userId: string) {
  return request<ApiRide>(`/rides/${encodeURIComponent(rideId)}/sos/cancel`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}
