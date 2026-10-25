import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { useEffect, useState } from 'react';
import { getRideByCode, joinRide as joinRideApi, type ApiRide } from '@/services/api';
import { JourneySummary } from '@/components/ride/JourneySummary';
import RoutePreviewMap from '@/components/map/RoutePreviewMap';
import { mapApiRideToRide, mapApiRidersToSessions } from '@/services/rideMapper';
import { useGeolocation } from '@/hooks/useGeolocation';

export default function JoinRidePage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuthStore();
  const { hydrateRide } = useRideStore();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ApiRide | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [pendingJoin, setPendingJoin] = useState(false);
  
  // Geolocation hook
  const { location: currentLocation, error: geoError, loading: geoLoading, requestLocation } = useGeolocation();

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const handleJoin = async (joinLocation = currentLocation) => {
    if (!user || !code || !preview || loadingPreview || preview.status === 'COMPLETED') return;
    
    // Wait for the rider's real position; joining resumes once it arrives
    if (!joinLocation) {
      setPendingJoin(true);
      requestLocation();
      return;
    }

    setPendingJoin(false);
    setJoining(true);
    setError('');
    try {
      const joined = await joinRideApi(preview.id, {
        userId: user.id,
        userName: user.name,
        leader: false,
        location: joinLocation,
      });

      const ride = mapApiRideToRide(joined);
      const mappedRiders = mapApiRidersToSessions(joined);
      const me = mappedRiders.find((r) => r.userId === user.id);
      
      // Use actual current location, not the ride's start location
      if (!me) {
        mappedRiders.push({
          userId: user.id,
          userName: user.name,
          isLeader: false,
          location: joinLocation,
          heading: 0,
          speed: 0,
          lastUpdate: Date.now(),
          isOnRoute: true,
          isOnline: true,
          routeFollowed: [],
        });
      } else {
        // Update existing rider with actual location
        me.location = joinLocation;
      }

      hydrateRide(ride, mappedRiders);
      navigate(`/ride/${ride.id}`);
    } catch (e) {
      console.error(e);
      setError('Ride code not found or backend is not reachable.');
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (pendingJoin && currentLocation && !joining) {
      void handleJoin(currentLocation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoin, currentLocation]);

  useEffect(() => {
    if (geoError) setPendingJoin(false);
  }, [geoError]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLoadingPreview(true);
    setError('');
    if (!code) {
      setError('Enter a ride code to preview a ride.');
      setLoadingPreview(false);
      return;
    }
    getRideByCode(code.toUpperCase())
      .then((r) => {
        if (!cancelled) setPreview(r);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load ride preview:', error);
          setError('Ride not found or backend is not reachable. Check the code and try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="min-h-screen bg-background p-6 max-w-lg mx-auto flex flex-col items-center justify-center">
      <button onClick={() => navigate('/dashboard')} className="self-start flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="glass-strong rounded-2xl p-8 text-center w-full max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🏍️</span>
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1">
          {loadingPreview ? 'Loading ride details...' : preview?.name || 'Ride unavailable'}
        </h2>
        {preview && (
          <div className="text-left space-y-2 mb-4">
            <RoutePreviewMap start={preview.startLocation} destination={preview.destination} route={preview.route} />
            <p className="text-sm text-muted-foreground"><strong>Start:</strong> {preview.startAddress}</p>
            <p className="text-sm text-muted-foreground"><strong>Destination:</strong> {preview.destAddress}</p>
            <JourneySummary ride={preview} />
            {preview.status === 'COMPLETED' && (
              <p className="text-sm text-destructive">This ride has completed and cannot be joined.</p>
            )}
          </div>
        )}

        <div className="bg-background/50 rounded-lg p-3 mb-6 font-mono text-xl tracking-[0.3em] text-primary font-bold">
          {code || '------'}
        </div>

        {error && <p className="text-sm text-destructive mb-3">{error}</p>}

        {geoError && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg mb-3">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{geoError.message}</span>
          </div>
        )}

        <Button onClick={() => handleJoin()} className="w-full" size="lg" disabled={!preview || loadingPreview || preview.status === 'COMPLETED' || joining || geoLoading}>
          {joining ? 'Joining...' : geoLoading ? 'Detecting Location...' : 'Join Ride'}
        </Button>
      </div>
    </div>
  );
}
