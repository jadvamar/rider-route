import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreateRidePage from './CreateRidePage';
import { useAuthStore } from '@/store/useAuthStore';
import { createRide, joinRide, getRideById, updateRide, type ApiRide } from '@/services/api';
import { fetchRouteOptions, geocodeAddress, reverseGeocodeAddress } from '@/services/routingService';

vi.mock('@/services/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/api')>(),
  createRide: vi.fn(),
  joinRide: vi.fn(),
  getRideById: vi.fn(),
  updateRide: vi.fn(),
}));
vi.mock('@/services/routingService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/routingService')>(),
  fetchRouteOptions: vi.fn(),
  geocodeAddress: vi.fn(),
  reverseGeocodeAddress: vi.fn(),
}));
vi.mock('@/components/map/RouteOptionsMap', () => ({
  default: ({ routes, selectedIndex, onSelect }: { routes: { summary: string }[]; selectedIndex: number | null; onSelect: (i: number) => void }) => (
    <div data-testid="route-options-map">
      {routes.map((r, i) => (
        <span key={i} data-selected={selectedIndex === i} onClick={() => onSelect(i)}>map:{r.summary}</span>
      ))}
    </div>
  ),
}));
vi.mock('@/hooks/useGeolocation', () => {
  const location = { lat: 12, lng: 77 };
  return {
    useGeolocation: () => ({ location, error: null, loading: false, requestLocation: vi.fn() }),
  };
});

afterEach(cleanup);

it('saves the selected alternative route distance and time, not the fastest route totals', async () => {
  useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
  vi.mocked(reverseGeocodeAddress).mockResolvedValue('Start town');
  vi.mocked(geocodeAddress).mockImplementation(async (query) =>
    query === 'Finish' ? [{ lat: 13, lng: 78, displayName: 'Finish town' }] : []);
  const geometry = [{ lat: 12, lng: 77 }, { lat: 13, lng: 78 }];
  vi.mocked(fetchRouteOptions).mockResolvedValue([
    { distance: 100000, duration: 7200, geometry, summary: 'Fast highway' },
    { distance: 125000, duration: 9000, geometry, summary: 'Scenic road' },
  ]);
  const ride: ApiRide = {
    id: 'new-ride', name: 'Scenic road', code: 'ABC123', leaderId: 'leader',
    startLocation: geometry[0], destination: geometry[1],
    startAddress: 'Start town', destAddress: 'Finish town', route: geometry,
    distanceMeters: 125000, durationSeconds: 9000,
    status: 'WAITING', createdAt: '2026-10-15T10:00:00Z',
  };
  vi.mocked(createRide).mockResolvedValue(ride);
  vi.mocked(joinRide).mockResolvedValue(ride);
  render(<MemoryRouter><CreateRidePage /></MemoryRouter>);

  const destination = screen.getByPlaceholderText('Search destination...');
  fireEvent.focus(destination);
  fireEvent.change(destination, { target: { value: 'Finish' } });
  fireEvent.click(await screen.findByText('Finish town'));
  fireEvent.click(await screen.findByRole('button', { name: /Scenic road/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Ride' }));
  await screen.findByText('Start location set: 12.0000, 77.0000');
  expect(createRide).toHaveBeenCalledWith(expect.objectContaining({
    route: geometry, distanceMeters: 125000, durationSeconds: 9000,
  }));
});


it('shows route options on a map and lets the rider pick one there', async () => {
  useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
  vi.mocked(createRide).mockClear();
  vi.mocked(reverseGeocodeAddress).mockResolvedValue('Start town');
  vi.mocked(geocodeAddress).mockImplementation(async (query) =>
    query === 'Finish' ? [{ lat: 13, lng: 78, displayName: 'Finish town' }] : []);
  const geometry = [{ lat: 12, lng: 77 }, { lat: 13, lng: 78 }];
  vi.mocked(fetchRouteOptions).mockResolvedValue([
    { distance: 100000, duration: 7200, geometry, summary: 'Fast highway' },
    { distance: 90000, duration: 8400, geometry, summary: 'Village road' },
    { distance: 125000, duration: 9000, geometry, summary: 'Scenic road' },
  ]);
  vi.mocked(createRide).mockRejectedValue(new Error('stop'));
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  render(<MemoryRouter><CreateRidePage /></MemoryRouter>);

  const destination = screen.getByPlaceholderText('Search destination...');
  fireEvent.focus(destination);
  fireEvent.change(destination, { target: { value: 'Finish' } });
  fireEvent.click(await screen.findByText('Finish town'));

  expect(await screen.findByTestId('route-options-map')).toBeTruthy();
  expect(screen.getByText('3 routes found')).toBeTruthy();
  expect(screen.getByText('SHORTEST')).toBeTruthy();
  expect(screen.getByText('map:Fast highway').getAttribute('data-selected')).toBe('true');

  fireEvent.click(screen.getByText('map:Village road'));
  expect(screen.getByText('map:Village road').getAttribute('data-selected')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Create Ride' }));
  await vi.waitFor(() => expect(createRide).toHaveBeenCalledWith(expect.objectContaining({
    distanceMeters: 90000, durationSeconds: 8400,
  })));
});

describe('editing a ride', () => {
  const savedRoute = [{ lat: 12, lng: 77 }, { lat: 12.5, lng: 77.5 }, { lat: 13, lng: 78 }];
  const existing: ApiRide = {
    id: 'ride-9', name: 'Sunday Cruise', code: 'XYZ789', leaderId: 'leader',
    startLocation: savedRoute[0], destination: savedRoute[2],
    startAddress: 'Start town', destAddress: 'Finish town', route: savedRoute,
    distanceMeters: 150000, durationSeconds: 7200,
    status: 'ACTIVE', createdAt: '2026-10-15T10:00:00Z', riders: [],
  };

  const renderEdit = () => render(
    <MemoryRouter initialEntries={['/ride/ride-9/edit']}>
      <Routes>
        <Route path="/ride/:id/edit" element={<CreateRidePage />} />
        <Route path="/ride/:id" element={<p>Ride screen</p>} />
      </Routes>
    </MemoryRouter>,
  );

  beforeEach(() => {
    vi.mocked(fetchRouteOptions).mockReset();
    vi.mocked(updateRide).mockReset();
    vi.mocked(getRideById).mockResolvedValue(existing);
  });

  it('pre-fills the ride and saves edits for the leader without changing the route', async () => {
    useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
    vi.mocked(updateRide).mockResolvedValue({ ...existing, name: 'Sunset Cruise' });
    renderEdit();

    const name = await screen.findByDisplayValue('Sunday Cruise');
    expect(screen.getByText('Edit Ride')).toBeTruthy();
    expect(screen.getByDisplayValue('Start town')).toBeTruthy();
    expect(screen.getByDisplayValue('Finish town')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Current route/ })).toBeTruthy();
    expect(fetchRouteOptions).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: 'Sunset Cruise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(updateRide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Save' }));

    await screen.findByText('Ride screen');
    expect(updateRide).toHaveBeenCalledWith('ride-9', expect.objectContaining({
      userId: 'leader', name: 'Sunset Cruise', route: savedRoute,
      startLocation: savedRoute[0], destination: savedRoute[2],
      distanceMeters: 150000, durationSeconds: 7200,
    }));
  });

  it('finds new routes when the destination changes and saves the chosen one', async () => {
    useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
    const newGeometry = [{ lat: 12, lng: 77 }, { lat: 14, lng: 79 }];
    vi.mocked(geocodeAddress).mockImplementation(async (query) =>
      query === 'New place' ? [{ lat: 14, lng: 79, displayName: 'New place, State' }] : []);
    vi.mocked(fetchRouteOptions).mockResolvedValue([
      { distance: 300000, duration: 12000, geometry: newGeometry, summary: 'Long highway' },
    ]);
    vi.mocked(updateRide).mockResolvedValue(existing);
    renderEdit();

    const destination = await screen.findByDisplayValue('Finish town');
    fireEvent.focus(destination);
    fireEvent.change(destination, { target: { value: 'New place' } });
    fireEvent.click(await screen.findByText('New place, State'));
    await screen.findByRole('button', { name: /Long highway/ });
    expect(fetchRouteOptions).toHaveBeenCalledWith(savedRoute[0], { lat: 14, lng: 79 }, 3);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Save' }));
    await screen.findByText('Ride screen');
    await vi.waitFor(() => expect(updateRide).toHaveBeenCalledWith('ride-9', expect.objectContaining({
      destination: { lat: 14, lng: 79 }, route: newGeometry, distanceMeters: 300000, durationSeconds: 12000,
    })));
  });

  it('keeps edits when the save confirmation is cancelled', async () => {
    useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
    renderEdit();
    fireEvent.change(await screen.findByDisplayValue('Sunday Cruise'), { target: { value: 'Unsaved name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Unsaved name')).toBeInTheDocument();
    expect(updateRide).not.toHaveBeenCalled();
  });

  it.each(['Discard Changes', 'Back'])('confirms discarding edits through %s without saving', async (button) => {
    useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
    renderEdit();
    fireEvent.change(await screen.findByDisplayValue('Sunday Cruise'), { target: { value: 'Unsaved name' } });
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(screen.getByDisplayValue('Unsaved name')).toBeInTheDocument();
    expect(screen.queryByText('Ride screen')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: button }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Discard' }));

    expect(await screen.findByText('Ride screen')).toBeInTheDocument();
    expect(updateRide).not.toHaveBeenCalled();
  });

  it('blocks riders who are not the leader', async () => {
    useAuthStore.setState({ user: { id: 'someone-else', name: 'Rider', email: 'rider@example.com' } });
    renderEdit();

    expect(await screen.findByText('Only the ride leader can edit this ride.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
  });

  it('blocks editing a closed ride', async () => {
    useAuthStore.setState({ user: { id: 'leader', name: 'Leader', email: 'leader@example.com' } });
    vi.mocked(getRideById).mockResolvedValue({ ...existing, status: 'COMPLETED' });
    renderEdit();

    expect(await screen.findByText('This ride is closed and can no longer be edited.')).toBeTruthy();
  });
});