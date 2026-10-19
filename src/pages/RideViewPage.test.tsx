import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RideViewPage from './RideViewPage';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { cancelSOS, getRideById, type ApiRide } from '@/services/api';
import { playSOSSound } from '@/lib/soundNotification';

const gps = vi.hoisted(() => ({ location: { lat: 12, lng: 77 } as { lat: number; lng: number } | null }));
vi.mock('@/components/map/RideMap', () => ({ default: () => null }));
vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: () => ({ location: gps.location, error: null }),
}));
vi.mock('@/lib/soundNotification', () => ({
  playSOSSound: vi.fn(),
  playAlertSound: vi.fn(),
}));
vi.mock('@/services/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/api')>(),
  getRideById: vi.fn(),
  triggerSOS: vi.fn(),
  cancelSOS: vi.fn(),
}));

const makeRide = (): ApiRide => ({
  id: 'ride-1',
  name: 'Group ride',
  code: 'ABC123',
  leaderId: 'sender',
  startLocation: { lat: 12, lng: 77 },
  destination: { lat: 13, lng: 78 },
  startAddress: 'Start',
  destAddress: 'Finish',
  route: [],
  status: 'ACTIVE',
  createdAt: '2026-10-15T10:00:00Z',
  activeSOS: {
    userId: 'sender',
    userName: 'Sender',
    timestamp: 1000,
    location: { lat: 12, lng: 77 },
  },
  riders: [
    { userId: 'receiver', userName: 'Receiver', leader: false },
    { userId: 'sender', userName: 'Sender', leader: true },
  ],
});

async function openRide() {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/ride/ride-1']}>
        <Routes>
          <Route path="/ride/:id" element={<RideViewPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
}

describe('received SOS notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    gps.location = { lat: 12, lng: 77 };
    useRideStore.getState().leaveRide();
    useAuthStore.setState({
      user: { id: 'receiver', name: 'Receiver', email: 'receiver@example.com' },
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows one notification and plays sound once across repeated polls', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();
    await poll();
    await poll();

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByText('Sender needs help')).toHaveLength(1);
    expect(screen.queryByText('SOS from Sender!')).not.toBeInTheDocument();
    expect(playSOSSound).toHaveBeenCalledTimes(1);
    expect(getRideById).toHaveBeenCalledTimes(3);
    expect(useRideStore.getState().alerts).toHaveLength(0);
  });

  it('keeps a cancelled notification closed without cancelling the sender SOS', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await poll();
    await poll();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(cancelSOS).not.toHaveBeenCalled();
    expect(useRideStore.getState().activeSOS?.userId).toBe('sender');
    expect(playSOSSound).toHaveBeenCalledTimes(1);
  });

  it('shows a new SOS from the same sender after dismissing the previous event', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue(ride);
    await openRide();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    vi.mocked(getRideById).mockResolvedValue({
      ...ride,
      activeSOS: { ...ride.activeSOS!, timestamp: 2000 },
    });
    await poll();

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(playSOSSound).toHaveBeenCalledTimes(2);
  });

  it('closes the notification when the sender cancels the SOS', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    vi.mocked(getRideById).mockResolvedValue({ ...makeRide(), activeSOS: undefined });
    await poll();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useRideStore.getState().activeSOS).toBeNull();
  });

  it('does not show a recipient notification or play a received sound for the sender', async () => {
    useAuthStore.setState({
      user: { id: 'sender', name: 'Sender', email: 'sender@example.com' },
    });
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();
    await poll();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ACTIVE' })).toBeInTheDocument();
    expect(playSOSSound).not.toHaveBeenCalled();
  });

  it('shows the rider GPS-based remaining journey in the collapsed bottom panel', async () => {
    gps.location = { lat: 0, lng: 0.05 };
    vi.mocked(getRideById).mockResolvedValue({
      ...makeRide(), activeSOS: undefined,
      route: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }],
      distanceMeters: 12000, durationSeconds: 1800,
    });
    await openRide();
    expect(screen.getByText('6.0 km left')).toBeInTheDocument();
    expect(screen.getByText('15 min estimated')).toBeInTheDocument();
    gps.location = { lat: 0, lng: 0.075 };
    await poll();
    expect(screen.getByText('3.0 km left')).toBeInTheDocument();
    expect(screen.getByText('8 min estimated')).toBeInTheDocument();
  });

  it('waits for actual GPS rather than showing simulated rider distance', async () => {
    gps.location = null;
    vi.mocked(getRideById).mockResolvedValue({ ...makeRide(), activeSOS: undefined });
    await openRide();
    expect(screen.getByText('Waiting for your GPS location...')).toBeInTheDocument();
    expect(screen.queryByText(/km left/)).not.toBeInTheDocument();
  });
});
