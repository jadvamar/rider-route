import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Navigation, Search, Loader2, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { generateRideCode } from '@/services/locationService';
import { fetchRoutes, geocodeAddress, formatRouteDistance, formatRouteDuration } from '@/services/routingService';
import type { LatLng } from '@/types';
import type { RouteOption, GeocodingResult } from '@/services/routingService';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface LocationInputProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onSelect: (result: GeocodingResult) => void;
  icon: React.ReactNode;
}

function LocationInput({ placeholder, value, onChange, onSelect, icon }: LocationInputProps) {
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debouncedValue = useDebounce(value, 500);

  useEffect(() => {
    if (debouncedValue.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    geocodeAddress(debouncedValue)
      .then((results) => {
        if (!cancelled) setSuggestions(results);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedValue]);

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</div>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        className="bg-background/50 border-border/50 pl-9 pr-9"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
      )}
      {focused && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 glass-strong rounded-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2.5 text-xs text-foreground hover:bg-secondary/50 transition-colors border-b border-border/20 last:border-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(s);
                onChange(s.displayName.split(',').slice(0, 2).join(','));
                setSuggestions([]);
              }}
            >
              <div className="truncate">{s.displayName}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CreateRidePage() {
  const [rideName, setRideName] = useState('');
  const [startAddr, setStartAddr] = useState('');
  const [destAddr, setDestAddr] = useState('');
  const [startCoord, setStartCoord] = useState<LatLng | null>(null);
  const [destCoord, setDestCoord] = useState<LatLng | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routeError, setRouteError] = useState('');
  const { user } = useAuthStore();
  const { createRide, addRider } = useRideStore();
  const navigate = useNavigate();

  // Fetch routes when both coordinates are set
  const handleFetchRoutes = useCallback(async () => {
    if (!startCoord || !destCoord) return;
    setLoadingRoutes(true);
    setRouteError('');
    setRoutes([]);
    setSelectedRoute(null);
    try {
      const result = await fetchRoutes(startCoord, destCoord);
      setRoutes(result);
      if (result.length > 0) setSelectedRoute(0);
    } catch {
      setRouteError('Could not find routes. Try different locations.');
    } finally {
      setLoadingRoutes(false);
    }
  }, [startCoord, destCoord]);

  // Auto-fetch routes when both coords are set
  useEffect(() => {
    if (startCoord && destCoord) {
      handleFetchRoutes();
    }
  }, [startCoord, destCoord, handleFetchRoutes]);

  const handleCreate = useCallback(() => {
    if (!user || selectedRoute === null || !startCoord || !destCoord) return;
    const chosen = routes[selectedRoute];
    const code = generateRideCode();
    const ride = {
      id: crypto.randomUUID(),
      name: rideName || chosen.summary || 'My Ride',
      code,
      leaderId: user.id,
      startLocation: startCoord,
      destination: destCoord,
      startAddress: startAddr || 'Start point',
      destAddress: destAddr || 'Destination',
      route: chosen.geometry,
      status: 'waiting' as const,
      createdAt: Date.now(),
    };
    createRide(ride);
    addRider({
      userId: user.id,
      userName: user.name,
      isLeader: true,
      location: startCoord,
      heading: 0,
      speed: 0,
      lastUpdate: Date.now(),
      isOnRoute: true,
      isOnline: true,
      routeFollowed: [],
    });
    navigate(`/ride/${ride.id}`);
  }, [user, rideName, startAddr, destAddr, startCoord, destCoord, selectedRoute, routes, createRide, addRider, navigate]);

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
          <LocationInput
            placeholder="Search start location..."
            value={startAddr}
            onChange={setStartAddr}
            onSelect={(r) => setStartCoord({ lat: r.lat, lng: r.lng })}
            icon={<MapPin className="w-4 h-4 text-success" />}
          />
          <LocationInput
            placeholder="Search destination..."
            value={destAddr}
            onChange={setDestAddr}
            onSelect={(r) => setDestCoord({ lat: r.lat, lng: r.lng })}
            icon={<Navigation className="w-4 h-4 text-destructive" />}
          />
        </div>

        {/* Route loading state */}
        {loadingRoutes && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Finding best routes...</span>
          </div>
        )}

        {/* Route error */}
        {routeError && (
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-sm text-destructive">{routeError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleFetchRoutes}>
              Retry
            </Button>
          </div>
        )}

        {/* Route options */}
        {routes.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Route className="w-4 h-4" />
              {routes.length} route{routes.length > 1 ? 's' : ''} found
            </h2>
            <div className="space-y-2">
              {routes.map((route, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedRoute(i)}
                  className={`w-full glass rounded-xl p-4 text-left transition-all ${
                    selectedRoute === i ? 'border-primary/50 glow-primary' : 'hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground text-sm truncate">
                          {route.summary || `Route ${i + 1}`}
                        </h3>
                        {i === 0 && (
                          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-semibold shrink-0">
                            FASTEST
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatRouteDistance(route.distance)}
                        </span>
                        <span className="text-xs text-primary font-semibold">
                          {formatRouteDuration(route.duration)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {route.geometry.length} points
                        </span>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
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
        )}

        {/* Hint when no coordinates yet */}
        {!startCoord && !destCoord && !loadingRoutes && routes.length === 0 && (
          <div className="glass rounded-xl p-6 text-center">
            <Search className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Search and select both locations to see real road routes</p>
          </div>
        )}

        <Button
          onClick={handleCreate}
          disabled={selectedRoute === null || !startCoord || !destCoord}
          className="w-full"
          size="lg"
        >
          Create Ride
        </Button>
      </div>
    </div>
  );
}
