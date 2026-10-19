import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RideViewPage from './RideViewPage';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { cancelSOS, closeRideForRider, getRideById, updateRiderLocation, type ApiRide } from '@/services/api';
import { playSOSSound } from '@/lib/soundNotification';
import { fetchRoutes } from '@/services/routingService';

const gps = vi.hoisted(() => ({ location: { lat: 12, lng: 77 } as { lat: number; lng: number } | null }));
const mapProps = vi.hoisted(() => ({ last: null as null | { rescueRoute?: { lat: number; lng: number }[] } }));
vi.mock('@/components/map/RideMap', () => ({
  default: (props: { rescueRoute?: { lat: number; lng: number }[] }) => {
    mapProps.last = props;
    return null;
  },
}));
vi.mock('@/services/routingService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/routingService')>(),
  fetchRoutes: vi.fn(),
}));
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
  updateRiderLocation: vi.fn().mockResolvedValue({}),
  triggerSOS: vi.fn(),
  cancelSOS: vi.fn(),
  closeRideForRider: vi.fn(),
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

  it('keeps my GPS location instead of the ride start and syncs it to the backend', async () => {
    gps.location = { lat: 19.07, lng: 72.87 };
    vi.mocked(getRideById).mockResolvedValue({ ...makeRide(), activeSOS: undefined });
    await openRide();
    await poll();
    await poll();

    const state = useRideStore.getState();
    expect(state.riders.get('receiver')?.location).toEqual({ lat: 19.07, lng: 72.87 });
    expect(state.currentRide?.startLocation).toEqual({ lat: 12, lng: 77 });
    expect(state.currentRide?.destination).toEqual({ lat: 13, lng: 78 });
    expect(updateRiderLocation).toHaveBeenCalledWith('ride-1', 'receiver', expect.objectContaining({
      location: { lat: 19.07, lng: 72.87 },
    }));
  });

  it('shows other riders at their reported location', async () => {
    vi.mocked(getRideById).mockResolvedValue({
      ...makeRide(), activeSOS: undefined,
      riders: [
        { userId: 'receiver', userName: 'Receiver', leader: false },
        { userId: 'sender', userName: 'Sender', leader: true, location: { lat: 28.6, lng: 77.2 } },
      ],
    });
    await openRide();
    expect(useRideStore.getState().riders.get('sender')?.location).toEqual({ lat: 28.6, lng: 77.2 });
  });

  it('routes the receiver from their GPS to the SOS rider in light red, and clears it when SOS ends', async () => {
    gps.location = { lat: 12.1, lng: 77.1 };
    const rescuePath = [{ lat: 12.1, lng: 77.1 }, { lat: 12.05, lng: 77.05 }, { lat: 12, lng: 77 }];
    vi.mocked(fetchRoutes).mockResolvedValue([{ distance: 15200, duration: 1500, geometry: rescuePath, summary: 'x' } as never]);
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Route to Sender' }));
    });

    expect(fetchRoutes).toHaveBeenCalledWith({ lat: 12.1, lng: 77.1 }, { lat: 12, lng: 77 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mapProps.last?.rescueRoute).toEqual(rescuePath);
    expect(screen.getByTestId('rescue-route-bar')).toHaveTextContent('Route to Sender');
    expect(screen.getByTestId('rescue-route-bar')).toHaveTextContent('15.2 km · 25 min');
    expect(cancelSOS).not.toHaveBeenCalled();

    vi.mocked(getRideById).mockResolvedValue({ ...makeRide(), activeSOS: undefined });
    await poll();
    expect(mapProps.last?.rescueRoute).toBeUndefined();
    expect(screen.queryByTestId('rescue-route-bar')).not.toBeInTheDocument();
  });

  it('offers the route button after the popup is closed and falls back to a straight line', async () => {
    gps.location = { lat: 12.1, lng: 77 };
    vi.mocked(fetchRoutes).mockRejectedValue(new Error('offline'));
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    });

    expect(mapProps.last?.rescueRoute).toEqual([{ lat: 12.1, lng: 77 }, { lat: 12, lng: 77 }]);
    expect(screen.getByTestId('rescue-route-bar')).toHaveTextContent('(straight line)');
  });

  it('does not show a rescue route option to the rider who raised the SOS', async () => {
    useAuthStore.setState({ user: { id: 'sender', name: 'Sender', email: 'sender@example.com' } });
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();
    expect(screen.queryByRole('button', { name: /Route/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('rescue-route-bar')).not.toBeInTheDocument();
  });
});

describe('non-leader closing a ride', () => {
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

  it('saves the close for this rider and shows it as closed', async () => {
    const ride = { ...makeRide(), activeSOS: undefined };
    vi.mocked(getRideById).mockResolvedValue(ride);
    vi.mocked(closeRideForRider).mockResolvedValue(ride);
    await openRide();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Close Ride/ }));
    });

    expect(closeRideForRider).toHaveBeenCalledWith('ride-1', 'receiver');
    expect(screen.getByText(/^Ride Closed/)).toBeInTheDocument();
    expect(screen.getByText('You closed this ride. It continues for the other riders.')).toBeInTheDocument();
  });

  it('hides riders who closed or deleted the ride from the live map but keeps their name on the closed screen', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue({
      ...ride,
      activeSOS: undefined,
      riders: [
        ride.riders![0],
        { ...ride.riders![1], location: { lat: 12.5, lng: 77.5 } },
        { userId: 'gone', userName: 'Gone Rider', leader: false, left: true },
      ],
    });
    vi.mocked(closeRideForRider).mockResolvedValue(ride);
    await openRide();

    const mapRiders = (mapProps.last as unknown as { riders: { userId: string }[] }).riders.map((r) => r.userId);
    expect(mapRiders).toContain('sender');
    expect(mapRiders).not.toContain('gone');
    expect(screen.getByText('2 riders')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Close Ride/ }));
    });
    expect(screen.getByText('Gone Rider')).toBeInTheDocument();
    expect(screen.getByText('Left ride')).toBeInTheDocument();
  });

  it('stays closed after reopening when the backend says this rider closed it', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue({
      ...ride,
      activeSOS: undefined,
      riders: [{ ...ride.riders![0], closed: true }, ride.riders![1]],
    });
    await openRide();

    expect(screen.getByText(/^Ride Closed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close Ride/ })).not.toBeInTheDocument();
  });
});