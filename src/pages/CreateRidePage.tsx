import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { generateRideCode } from '@/services/locationService';
import type { LatLng } from '@/types';

// Pre-defined demo routes (since we don't have a real routing API)
const DEMO_ROUTES: { name: string; start: LatLng; dest: LatLng; route: LatLng[] }[] = [
  {
    name: 'City Loop',
    start: { lat: 28.6139, lng: 77.209 },
    dest: { lat: 28.6329, lng: 77.2195 },
    route: [
      { lat: 28.6139, lng: 77.209 },
      { lat: 28.618, lng: 77.211 },
      { lat: 28.622, lng: 77.214 },
      { lat: 28.626, lng: 77.217 },
      { lat: 28.63, lng: 77.219 },
      { lat: 28.6329, lng: 77.2195 },
    ],
  },
  {
    name: 'Highway Run',
    start: { lat: 28.6139, lng: 77.209 },
    dest: { lat: 28.5563, lng: 77.1005 },
    route: [
      { lat: 28.6139, lng: 77.209 },
      { lat: 28.607, lng: 77.195 },
      { lat: 28.595, lng: 77.175 },
      { lat: 28.58, lng: 77.15 },
      { lat: 28.565, lng: 77.12 },
      { lat: 28.5563, lng: 77.1005 },
    ],
  },
];

export default function CreateRidePage() {
  const [rideName, setRideName] = useState('');
  const [startAddr, setStartAddr] = useState('');
  const [destAddr, setDestAddr] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const { user } = useAuthStore();
  const { createRide, addRider } = useRideStore();
  const navigate = useNavigate();

  const handleCreate = useCallback(() => {
    if (!user || selectedRoute === null) return;
    const demoRoute = DEMO_ROUTES[selectedRoute];
    const code = generateRideCode();
    const ride = {
      id: crypto.randomUUID(),
      name: rideName || demoRoute.name,
      code,
      leaderId: user.id,
      startLocation: demoRoute.start,
      destination: demoRoute.dest,
      startAddress: startAddr || 'Start point',
      destAddress: destAddr || 'Destination',
      route: demoRoute.route,
      status: 'waiting' as const,
      createdAt: Date.now(),
    };
    createRide(ride);
    addRider({
      userId: user.id,
      userName: user.name,
      isLeader: true,
      location: demoRoute.start,
      heading: 0,
      speed: 0,
      lastUpdate: Date.now(),
      isOnRoute: true,
      isOnline: true,
      routeFollowed: [],
    });
    navigate(`/ride/${ride.id}`);
  }, [user, rideName, startAddr, destAddr, selectedRoute, createRide, addRider, navigate]);

  return (
    <div className="min-h-screen bg-background p-6 max-w-lg mx-auto">
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-xl font-bold text-foreground mb-6">Create a Ride</h1>

      <div className="space-y-4">
        <div className="glass-strong rounded-xl p-4 space-y-3">
          <Input
            placeholder="Ride name (e.g., Sunday Cruise)"
            value={rideName}
            onChange={(e) => setRideName(e.target.value)}
            className="bg-background/50 border-border/50"
          />
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
            <Input
              placeholder="Start location"
              value={startAddr}
              onChange={(e) => setStartAddr(e.target.value)}
              className="bg-background/50 border-border/50 pl-9"
            />
          </div>
          <div className="relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive" />
            <Input
              placeholder="Destination"
              value={destAddr}
              onChange={(e) => setDestAddr(e.target.value)}
              className="bg-background/50 border-border/50 pl-9"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Select a route</h2>
          <div className="space-y-2">
            {DEMO_ROUTES.map((route, i) => (
              <button
                key={i}
                onClick={() => setSelectedRoute(i)}
                className={`w-full glass rounded-xl p-4 text-left transition-all ${
                  selectedRoute === i ? 'border-primary/50 glow-primary' : 'hover:border-border/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground text-sm">{route.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {route.route.length} waypoints · ~{(route.route.length * 2).toFixed(0)} km
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedRoute === i ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}
                  >
                    {selectedRoute === i && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleCreate}
          disabled={selectedRoute === null}
          className="w-full"
          size="lg"
        >
          Create Ride
        </Button>
      </div>
    </div>
  );
}
