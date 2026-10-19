import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import CreateRidePage from './CreateRidePage';
import { useAuthStore } from '@/store/useAuthStore';
import { createRide, joinRide, type ApiRide } from '@/services/api';
import { fetchRoutes, geocodeAddress, reverseGeocodeAddress } from '@/services/routingService';

vi.mock('@/services/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/api')>(),
  createRide: vi.fn(),
  joinRide: vi.fn(),
}));
vi.mock('@/services/routingService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/routingService')>(),
  fetchRoutes: vi.fn(),
  geocodeAddress: vi.fn(),
  reverseGeocodeAddress: vi.fn(),
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
  vi.mocked(fetchRoutes).mockResolvedValue([
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
