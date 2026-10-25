import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RideViewPage from './RideViewPage';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { alertWrongRoute, cancelSOS, closeRideForRider, getRideById, joinRide, updateRiderLocation, type ApiRide } from '@/services/api';
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
  joinRide: vi.fn(),
  alertWrongRoute: vi.fn(),
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

beforeEach(() => {
  useRideStore.setState({ notificationReceipts: {}, rescueRoutes: {} });
});

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

  it('shows one notification without playing sound across repeated polls', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();
    await poll();
    await poll();

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByText('Sender needs help')).toHaveLength(1);
    expect(screen.queryByText('SOS from Sender!')).not.toBeInTheDocument();
    expect(playSOSSound).not.toHaveBeenCalled();
    expect(getRideById).toHaveBeenCalledTimes(3);
    expect(useRideStore.getState().alerts).toHaveLength(0);
  });

  it.each([
    { userId: 'sender', isLeader: true },
    { userId: 'receiver', isLeader: false },
  ])('shows the waiting popup only to the creator: $userId', async ({ userId, isLeader }) => {
    useAuthStore.setState({ user: { id: userId, name: userId, email: `${userId}@example.com` } });
    vi.mocked(getRideById).mockResolvedValue({ ...makeRide(), status: 'WAITING', activeSOS: undefined });
    await openRide();
    await poll();

    if (isLeader) {
      expect(screen.getByRole('heading', { name: 'Waiting for riders' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('heading', { name: 'Waiting for riders' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Waiting for the ride to start' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Copy Code' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Start Ride' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show riders' })).toBeInTheDocument();
    }
    vi.mocked(getRideById).mockResolvedValue({ ...makeRide(), status: 'ACTIVE', activeSOS: undefined });
    await poll();
    expect(screen.queryByRole('heading', { name: /Waiting for/ })).not.toBeInTheDocument();
  });

  it('does not repeat an already received SOS or route automatically after returning', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    const geometry = [{ lat: 12, lng: 77 }, { lat: 12.1, lng: 77.1 }];
    vi.mocked(fetchRoutes).mockResolvedValue([{ distance: 1500, duration: 150, geometry, summary: 'Rescue' }]);
    await openRide();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    cleanup();
    useRideStore.getState().leaveRide();
    await openRide();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mapProps.last?.rescueRoute).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Route' })).toBeInTheDocument();
    await poll();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchRoutes).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    });
    expect(fetchRoutes).toHaveBeenCalledTimes(1);
    expect(mapProps.last?.rescueRoute).toEqual(geometry);
  });

  it('does not repeat an SOS even when the rider leaves before dismissing its popup', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    vi.mocked(fetchRoutes).mockRejectedValue(new Error('offline'));
    await openRide();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    cleanup();
    await openRide();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mapProps.last?.rescueRoute).toBeUndefined();
    expect(fetchRoutes).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Route' })).toBeInTheDocument();
  });

  it('preserves a selected SOS route when returning to the ride', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    const geometry = [{ lat: 12, lng: 77 }, { lat: 12.1, lng: 77.1 }];
    vi.mocked(fetchRoutes).mockResolvedValue([{ distance: 1500, duration: 150, geometry, summary: 'Rescue' }]);
    await openRide();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Route to Sender' }));
    });
    cleanup();
    useRideStore.getState().leaveRide();
    await openRide();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mapProps.last?.rescueRoute).toEqual(geometry);
    expect(fetchRoutes).toHaveBeenCalledTimes(1);
  });

  it('closes the SOS route bar and overlay and keeps them closed after polling and reopening', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue(ride);
    const geometry = [{ lat: 12, lng: 77 }, { lat: 12.1, lng: 77.1 }];
    vi.mocked(fetchRoutes).mockResolvedValue([{ distance: 1500, duration: 150, geometry, summary: 'Rescue' }]);
    await openRide();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Route to Sender' }));
    });
    expect(screen.getByTestId('rescue-route-bar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear route' }));
    expect(screen.queryByTestId('rescue-route-bar')).not.toBeInTheDocument();
    expect(mapProps.last?.rescueRoute).toBeUndefined();
    await poll();
    expect(screen.queryByTestId('rescue-route-bar')).not.toBeInTheDocument();

    cleanup();
    useRideStore.getState().leaveRide();
    await openRide();
    await poll();
    expect(screen.queryByTestId('rescue-route-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mapProps.last?.rescueRoute).toBeUndefined();
    expect(fetchRoutes).toHaveBeenCalledTimes(1);
    expect(cancelSOS).not.toHaveBeenCalled();

    vi.mocked(getRideById).mockResolvedValue({ ...ride, activeSOS: { ...ride.activeSOS!, timestamp: 2000 } });
    await poll();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('cancels the SOS route prompt without routing or cancelling the sender SOS', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    await openRide();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Route' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('rescue-route-bar')).not.toBeInTheDocument();
    await poll();
    cleanup();
    useRideStore.getState().leaveRide();
    await openRide();

    expect(screen.queryByTestId('rescue-route-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchRoutes).not.toHaveBeenCalled();
    expect(cancelSOS).not.toHaveBeenCalled();
    expect(useRideStore.getState().activeSOS?.userId).toBe('sender');
  });

  it('restores acknowledged SOS events and their routes from browser storage after a reload', async () => {
    vi.mocked(getRideById).mockResolvedValue(makeRide());
    const geometry = [{ lat: 12, lng: 77 }, { lat: 12.1, lng: 77.1 }];
    vi.mocked(fetchRoutes).mockResolvedValue([{ distance: 1500, duration: 150, geometry, summary: 'Rescue' }]);
    await openRide();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Route to Sender' }));
    });
    cleanup();
    const persisted = localStorage.getItem('rider-route-notifications');
    expect(persisted).not.toBeNull();
    useRideStore.getState().leaveRide();
    useRideStore.setState({ notificationReceipts: {}, rescueRoutes: {} });
    localStorage.setItem('rider-route-notifications', persisted!);
    await useRideStore.persist.rehydrate();
    await openRide();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mapProps.last?.rescueRoute).toEqual(geometry);
    expect(fetchRoutes).toHaveBeenCalledTimes(1);
  });

  it('does not suppress the same SOS for a different recipient', async () => {
    const ride = { ...makeRide(), riders: [...makeRide().riders!, { userId: 'other', userName: 'Other', leader: false }] };
    vi.mocked(getRideById).mockResolvedValue(ride);
    await openRide();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    cleanup();
    useRideStore.getState().leaveRide();
    useAuthStore.setState({ user: { id: 'other', name: 'Other', email: 'other@example.com' } });
    await openRide();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Sender needs help')).toBeInTheDocument();
  });

  it('receives a targeted off-route alert once and keeps it dismissed across polls', async () => {
    const ride = makeRide();
    const notification = { id: 'route-alert-1', fromUserId: 'sender', fromUserName: 'Sender', timestamp: 1000 };
    vi.mocked(getRideById).mockResolvedValue({
      ...ride, activeSOS: undefined,
      riders: [{ ...ride.riders![0], onRoute: false, wrongRouteAlert: notification }, ride.riders![1]],
    });
    await openRide();
    await poll();
    expect(screen.getAllByText(/You are on the wrong route!/)).toHaveLength(1);
    expect(screen.getByText('From Sender')).toBeInTheDocument();
    expect(playSOSSound).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss alert' }));
    await poll();
    expect(screen.queryByText(/You are on the wrong route!/)).not.toBeInTheDocument();

    cleanup();
    useRideStore.getState().leaveRide();
    await openRide();
    await poll();
    expect(screen.queryByText(/You are on the wrong route!/)).not.toBeInTheDocument();

    vi.mocked(getRideById).mockResolvedValue({
      ...ride, activeSOS: undefined,
      riders: [{ ...ride.riders![0], wrongRouteAlert: { ...notification, id: 'route-alert-2' } }, ride.riders![1]],
    });
    await poll();
    expect(screen.getByText(/You are on the wrong route!/)).toBeInTheDocument();
  });

  it('does not show an off-route alert intended for another rider', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue({
      ...ride, activeSOS: undefined,
      riders: [ride.riders![0], {
        ...ride.riders![1],
        wrongRouteAlert: { id: 'other-alert', fromUserId: 'receiver', fromUserName: 'Receiver', timestamp: 1000 },
      }],
    });
    await openRide();
    expect(screen.queryByText(/You are on the wrong route!/)).not.toBeInTheDocument();
  });

  it('sends an off-route alert through the backend instead of only storing it locally', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue({
      ...ride, activeSOS: undefined,
      riders: [ride.riders![0], { ...ride.riders![1], onRoute: false }],
    });
    vi.mocked(alertWrongRoute).mockResolvedValue(ride);
    await openRide();
    fireEvent.click(screen.getByRole('button', { name: 'Show riders' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alert Sender' }));
    });
    expect(alertWrongRoute).toHaveBeenCalledWith('ride-1', 'sender', 'receiver');
    expect(screen.getByText('Alert sent to Sender.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alert Sender' })).toBeDisabled();
  });

  it('shows a send failure and allows retrying the off-route alert', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue({
      ...ride, activeSOS: undefined,
      riders: [ride.riders![0], { ...ride.riders![1], onRoute: false }],
    });
    vi.mocked(alertWrongRoute).mockRejectedValue(new Error('offline'));
    await openRide();
    fireEvent.click(screen.getByRole('button', { name: 'Show riders' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alert Sender' }));
    });
    expect(screen.getByText('Failed to alert Sender. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alert Sender' })).toBeEnabled();
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
    expect(playSOSSound).not.toHaveBeenCalled();
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
    expect(playSOSSound).not.toHaveBeenCalled();
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
      fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    });

    expect(closeRideForRider).toHaveBeenCalledWith('ride-1', 'receiver');
    expect(screen.getByRole('heading', { name: 'You Left' })).toBeInTheDocument();
    expect(screen.getByText('You left this ride. It continues for the other riders.')).toBeInTheDocument();
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
      fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
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

    expect(screen.getByRole('heading', { name: 'You Left' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
  });

  it.each(['closed', 'left'] as const)('rejoins an open ride after the rider has %s it', async (flag) => {
    const ride = { ...makeRide(), activeSOS: undefined };
    vi.mocked(getRideById).mockResolvedValue({
      ...ride,
      riders: [{ ...ride.riders![0], [flag]: true }, ride.riders![1]],
    });
    vi.mocked(joinRide).mockResolvedValue(ride);
    await openRide();
    expect(screen.getByRole('heading', { name: 'You Left' })).toBeInTheDocument();
    expect(updateRiderLocation).not.toHaveBeenCalled();

    vi.mocked(getRideById).mockResolvedValue(ride);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join Back' }));
    });
    await poll();

    expect(joinRide).toHaveBeenCalledWith('ride-1', {
      userId: 'receiver', userName: 'Receiver', leader: false, location: gps.location,
    });
    expect(screen.queryByRole('heading', { name: 'You Left' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    expect(useRideStore.getState().riders.get('receiver')?.hasLeft).toBe(false);
    expect(updateRiderLocation).toHaveBeenCalled();
  });

  it('keeps the preview and shows an error if rejoining fails', async () => {
    const ride = makeRide();
    vi.mocked(getRideById).mockResolvedValue({
      ...ride, activeSOS: undefined,
      riders: [{ ...ride.riders![0], closed: true }, ride.riders![1]],
    });
    vi.mocked(joinRide).mockRejectedValue(new Error('Completed rides cannot be joined'));
    await openRide();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join Back' }));
    });

    expect(screen.getByRole('heading', { name: 'You Left' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Completed rides cannot be joined');
    expect(screen.getByRole('button', { name: 'Join Back' })).toBeEnabled();
  });

  it('removes the rejoin option when the creator completes the ride', async () => {
    const ride = makeRide();
    const closedRide = {
      ...ride, activeSOS: undefined,
      riders: [{ ...ride.riders![0], closed: true }, ride.riders![1]],
    };
    vi.mocked(getRideById).mockResolvedValue(closedRide);
    await openRide();
    expect(screen.getByRole('button', { name: 'Join Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Dashboard' })).not.toBeInTheDocument();

    vi.mocked(getRideById).mockResolvedValue({ ...closedRide, status: 'COMPLETED' });
    await poll();

    expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Back' })).not.toBeInTheDocument();
    expect(joinRide).not.toHaveBeenCalled();
  });
});