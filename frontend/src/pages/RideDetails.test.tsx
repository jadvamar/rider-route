import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import JoinRidePage from './JoinRidePage';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { getRideByCode, getRidesByUser, joinRide, removeRideFromHistory, type ApiRide } from '@/services/api';

vi.mock('@/services/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/api')>(),
  getRideByCode: vi.fn(),
  getRidesByUser: vi.fn(),
  removeRideFromHistory: vi.fn(),
  joinRide: vi.fn(),
}));
vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    location: { lat: 12, lng: 77 }, error: null, loading: false, requestLocation: vi.fn(),
  }),
}));

vi.mock('@/components/map/RoutePreviewMap', () => ({
  default: ({ start, destination, route }: { start: unknown; destination: unknown; route: unknown[] }) => (
    <div data-testid="route-preview-map">{JSON.stringify({ start, destination, points: route.length })}</div>
  ),
}));

const ride: ApiRide = {
  id: 'ride', name: 'Weekend trip', code: 'ABC123', leaderId: 'leader',
  startLocation: { lat: 12, lng: 77 }, destination: { lat: 13, lng: 78 },
  startAddress: 'Start town', destAddress: 'End town', route: [{ lat: 12, lng: 77 }, { lat: 12.5, lng: 77.5 }, { lat: 13, lng: 78 }],
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

  it('replaces the Join Ride option with a ride code form that opens the preview', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/join/ABC123" element={<p>Ride code preview</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('No rides yet');
    expect(screen.queryByRole('button', { name: /Join Ride/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    const code = screen.getByRole('textbox', { name: 'Ride Code' });
    fireEvent.change(code, { target: { value: 'abc123' } });
    expect(code).toHaveValue('ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Ride code preview')).toBeInTheDocument();
    expect(joinRide).not.toHaveBeenCalled();
  });

  it('shows saved totals in recent rides', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([ride]);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Weekend trip')).toBeInTheDocument();
    expect(screen.getByText(/125.0 km.*2h 30m estimated/)).toBeInTheDocument();
    expect(screen.getByText(/Start town.*End town/)).toBeInTheDocument();
    expect(screen.getByText('Ongoing')).toHaveClass('text-green-500');
  });

  it('shows only the leader name on recent ride cards', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([{
      ...ride,
      riders: [
        { userId: 'rider', userName: 'Rider', leader: false },
        { userId: 'leader', userName: 'Asha', leader: true },
        { userId: 'other', userName: 'Ravi', leader: false },
      ],
    }]);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Leader: Asha')).toBeInTheDocument();
    expect(screen.queryByText(/Riders:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ravi/)).not.toBeInTheDocument();
  });

  it('marks completed rides as closed in red on the home page', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([{ ...ride, id: 'done', name: 'Old trip', status: 'COMPLETED' }]);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Old trip')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toHaveClass('text-red-500');
    expect(screen.queryByText('Ongoing')).not.toBeInTheDocument();
  });

  it.each(['closed', 'left'] as const)('shows You Left only for the rider whose %s flag is set', async (flag) => {
    const shared: ApiRide = {
      ...ride,
      status: 'ACTIVE',
      riders: [
        { userId: 'leader', userName: 'Leader', leader: true },
        { userId: 'rider', userName: 'Rider', leader: false, [flag]: true },
      ],
    };
    vi.mocked(getRidesByUser).mockResolvedValue([shared]);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('You Left')).toHaveClass('text-amber-500');
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    cleanup();

    useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Ongoing')).toHaveClass('text-green-500');
  });

  it('shows Closed instead of You Left when the leader has ended the ride', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([{
      ...ride, status: 'COMPLETED',
      riders: [{ userId: 'rider', userName: 'Rider', leader: false, closed: true, left: true }],
    }]);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Closed')).toHaveClass('text-red-500');
    expect(screen.queryByText('You Left')).not.toBeInTheDocument();
  });

  it('shows Edit only on the leader\'s own rides that are still ongoing', async () => {
    useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
    vi.mocked(getRidesByUser).mockResolvedValue([
      ride,
      { ...ride, id: 'done', name: 'Old trip', status: 'COMPLETED' },
      { ...ride, id: 'joined', name: 'Friend trip', leaderId: 'friend' },
    ]);
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/ride/:id/edit" element={<p>Edit page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Friend trip');
    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    expect(editButtons).toHaveLength(1);
    fireEvent.click(editButtons[0]);
    expect(await screen.findByText('Edit page')).toBeInTheDocument();
  });

  it('deletes a ride from my history only after confirming', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([ride, { ...ride, id: 'other', name: 'Other trip' }]);
    vi.mocked(removeRideFromHistory).mockResolvedValue(undefined);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByText('Weekend trip');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Weekend trip from history' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Want to delete ride?');
    expect(screen.getByText('It is only removed from your history. Other riders keep it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(removeRideFromHistory).not.toHaveBeenCalled();
    expect(screen.getByText('Weekend trip')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Weekend trip from history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() => expect(screen.queryByText('Weekend trip')).not.toBeInTheDocument());
    expect(removeRideFromHistory).toHaveBeenCalledWith('rider', 'ride');
    expect(screen.getByText('Other trip')).toBeInTheDocument();
  });

  it('opens a ride by tapping its card, and the corner X does not open it', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([ride]);
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/ride/:id" element={<p>Ride screen</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Weekend trip');
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Weekend trip from history' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByText('Ride screen')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Weekend trip'));
    expect(await screen.findByText('Ride screen')).toBeInTheDocument();
  });

  it('keeps the ride listed and explains when delete fails', async () => {
    vi.mocked(getRidesByUser).mockResolvedValue([ride]);
    vi.mocked(removeRideFromHistory).mockRejectedValue(new Error('offline'));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByText('Weekend trip');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Weekend trip from history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(await screen.findByText('Could not delete this ride. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Weekend trip' })).toBeInTheDocument();
  });

  it('loads details without joining, then joins only on confirmation', async () => {
    vi.mocked(getRideByCode).mockResolvedValue(ride);
    vi.mocked(joinRide).mockResolvedValue(ride);
    renderPreview();
    expect(await screen.findByText('Weekend trip')).toBeInTheDocument();
    expect(screen.getByText('Start town')).toBeInTheDocument();
    expect(screen.getByText('End town')).toBeInTheDocument();
    expect(screen.getByText(/125.0 km.*2h 30m estimated/)).toBeInTheDocument();
    expect(screen.getByTestId('route-preview-map')).toHaveTextContent(
      JSON.stringify({ start: { lat: 12, lng: 77 }, destination: { lat: 13, lng: 78 }, points: 3 }),
    );
    expect(joinRide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Join Ride' }));
    await screen.findByText('Joined ride view');
    expect(joinRide).toHaveBeenCalledExactlyOnceWith('ride', {
      userId: 'rider', userName: 'Rider', leader: false, location: { lat: 12, lng: 77 },
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
