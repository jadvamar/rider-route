import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import JoinRidePage from './JoinRidePage';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { getRideByCode, getRidesByUser, joinRide, type ApiRide } from '@/services/api';

vi.mock('@/services/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/api')>(),
  getRideByCode: vi.fn(),
  getRidesByUser: vi.fn(),
  joinRide: vi.fn(),
}));
vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    location: { lat: 12, lng: 77 }, error: null, loading: false, requestLocation: vi.fn(),
  }),
}));

const ride: ApiRide = {
  id: 'ride', name: 'Weekend trip', code: 'ABC123', leaderId: 'leader',
  startLocation: { lat: 12, lng: 77 }, destination: { lat: 13, lng: 78 },
  startAddress: 'Start town', destAddress: 'End town', route: [],
  distanceMeters: 125000, durationSeconds: 9000,
  status: 'WAITING', createdAt: '2026-10-15T10:00:00Z',
};

function renderPreview() {
  render(
    <MemoryRouter initialEntries={['/join/ABC123']}>
      <Routes>
        <Route path="/join/:code" element={<JoinRidePage />} />
        <Route path="/ride/:id" element={<p>Joined ride view</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ride details before joining', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRideStore.getState().leaveRide();
    useAuthStore.setState({
      user: { id: 'rider', name: 'Rider', email: 'rider@example.com' },
      isAuthenticated: true,
    });
  });
  afterEach(cleanup);

  it('shows saved totals in recent rides', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([ride]);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Weekend trip')).toBeInTheDocument();
    expect(screen.getByText(/125.0 km.*2h 30m estimated/)).toBeInTheDocument();
    expect(screen.getByText(/Start town.*End town/)).toBeInTheDocument();
  });

  it('loads details without joining, then joins only on confirmation', async () => {
    vi.mocked(getRideByCode).mockResolvedValue(ride);
    vi.mocked(joinRide).mockResolvedValue(ride);
    renderPreview();
    expect(await screen.findByText('Weekend trip')).toBeInTheDocument();
    expect(screen.getByText('Start town')).toBeInTheDocument();
    expect(screen.getByText('End town')).toBeInTheDocument();
    expect(screen.getByText(/125.0 km.*2h 30m estimated/)).toBeInTheDocument();
    expect(joinRide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Join Ride' }));
    await screen.findByText('Joined ride view');
    expect(joinRide).toHaveBeenCalledExactlyOnceWith('ride', {
      userId: 'rider', userName: 'Rider', leader: false,
    });
    expect(useRideStore.getState().currentRide?.distanceMeters).toBe(125000);
  });

  it('does not allow joining while the preview is loading', () => {
    vi.mocked(getRideByCode).mockReturnValue(new Promise(() => {}));
    renderPreview();
    expect(screen.getByRole('button', { name: 'Join Ride' })).toBeDisabled();
    expect(joinRide).not.toHaveBeenCalled();
  });

  it('shows a lookup error and prevents joining an invalid code', async () => {
    vi.mocked(getRideByCode).mockRejectedValue(new Error('Ride not found'));
    renderPreview();
    await screen.findByText(/Ride not found or backend/);
    expect(screen.getByRole('button', { name: 'Join Ride' })).toBeDisabled();
    expect(joinRide).not.toHaveBeenCalled();
  });

  it('previews completed rides but prevents joining them', async () => {
    vi.mocked(getRideByCode).mockResolvedValue({ ...ride, status: 'COMPLETED' });
    renderPreview();
    await waitFor(() => expect(screen.getByText('Weekend trip')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Join Ride' })).toBeDisabled();
    expect(screen.getByText(/This ride has completed/)).toBeInTheDocument();
  });
});
