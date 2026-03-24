export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
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
  status: 'WAITING' | 'ACTIVE' | 'COMPLETED';
  createdAt: string;
}

export async function createRide(payload: {
  name: string;
  leaderId: string;
  startLocation: ApiLatLng;
  destination: ApiLatLng;
  startAddress: string;
  destAddress: string;
  route: ApiLatLng[];
}) {
  return request<ApiRide>('/rides', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRideByCode(code: string) {
  return request<ApiRide>(`/rides/by-code/${encodeURIComponent(code)}`);
}
