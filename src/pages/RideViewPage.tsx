import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, ChevronUp, ChevronDown, Play, Share2, Clock, MapPin, Users, Navigation, RefreshCw, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import RideMap from '@/components/map/RideMap';
import RiderList from '@/components/ride/RiderList';
import { SOSButton, AlertBanner } from '@/components/ride/SOSButton';
import { simulateMovement } from '@/services/mockSimulation';
import { getDistance, isOnRoute } from '@/services/locationService';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { LatLng, RiderSession } from '@/types';
import { alertWrongRoute, closeRideForRider, getRideById, joinRide, updateRideStatus, updateRiderLocation as updateRiderLocationApi, triggerSOS as triggerSOSApi, cancelSOS as cancelSOSApi } from '@/services/api';
import { mapApiRideToRide, mapApiRidersToSessions } from '@/services/rideMapper';
import { getRemainingJourney } from '@/services/journeyService';
import { fetchRoutes, formatRouteDistance, formatRouteDuration } from '@/services/routingService';

export default function RideViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentRide, riders, alerts, activeSOS,
    addRider, updateRiderLocation, addAlert, dismissAlert, setActiveSOS,
    startRide, endRide, setRiderOnRoute, hydrateRide,
    notificationReceipts, rescueRoutes, acknowledgeNotification, saveRescueRoute,
  } = useRideStore();

  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [alertCooldowns, setAlertCooldowns] = useState<Set<string>>(new Set());
  const [popupSOSId, setPopupSOSId] = useState<string | null>(null);
  const [rideClosedByMe, setRideClosedByMe] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [rejoinError, setRejoinError] = useState('');
  const [loadedRideId, setLoadedRideId] = useState<string>();
  const [rideLoadError, setRideLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sosPending, setSOSPending] = useState(false);
  const [sosError, setSOSError] = useState('');
  const simulationRef = useRef<number>();
  
  // Geolocation hook for real-time location tracking
  const { location: currentLocation, error: geoError } = useGeolocation({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
    watch: true, // Enable continuous tracking
  });
  const latestLocationRef = useRef(currentLocation);
  latestLocationRef.current = currentLocation;
  const lastSentLocationAt = useRef(0);

  // Compute derived state (must be before early returns)
  const isLoadingRide = !!id && (loadedRideId !== id || currentRide?.id !== id);
  const ridersArray = useMemo(() => Array.from(riders.values()), [riders]);
  const isLeader = currentRide?.leaderId === user?.id;
  const canViewRiders = !!currentRide && (currentRide.status !== 'waiting' || isLeader);
  const liveRiders = useMemo(() => canViewRiders ? ridersArray.filter((rider) => !rider.hasLeft) : [], [ridersArray, canViewRiders]);
  const myLocation = riders.get(user?.id ?? '')?.location;
  const remainingJourney = useMemo(() =>
    currentRide && currentLocation ? getRemainingJourney(currentRide, currentLocation) : null,
  [currentRide, currentLocation]);
  const sosNotificationId = activeSOS
    ? `${id}:${user?.id}:${activeSOS.userId}:${activeSOS.timestamp}`
    : '';
  const visibleAlerts = canViewRiders ? alerts.filter((alert) =>
    alert.rideId === id && (!alert.toUserId || alert.toUserId === user?.id)
    && (alert.type !== 'sos' || alert.fromUserId === user?.id)) : [];
  const isReceivingSOS = !!activeSOS && activeSOS.userId !== user?.id;
  const sosTargetLocation = activeSOS
    ? activeSOS.location ?? riders.get(activeSOS.userId)?.location
    : undefined;
  const sosRouteDismissalId = `${sosNotificationId}:route-dismissed`;
  const isSOSRouteDismissed = !!notificationReceipts[sosRouteDismissalId];
  const rescueRoute = isSOSRouteDismissed ? null : rescueRoutes[sosNotificationId] ?? null;
  const [rescueLoading, setRescueLoading] = useState(false);
  const [rescueError, setRescueError] = useState('');

  useEffect(() => {
    setRescueError('');
  }, [sosNotificationId]);

  const handleRouteToSOS = useCallback(async () => {
    if (!activeSOS || !sosNotificationId) return;
    setPopupSOSId(null);
    acknowledgeNotification(sosNotificationId);
    const from = latestLocationRef.current ?? myLocation;
    if (!from || !sosTargetLocation) {
      setRescueError(!from ? 'Waiting for your GPS location to build the route.' : `${activeSOS.userName}'s location is not available yet.`);
      return;
    }
    setRescueLoading(true);
    setRescueError('');
    try {
      const [best] = await fetchRoutes(from, sosTargetLocation);
      if (!best || best.geometry.length < 2) throw new Error('No route found');
      saveRescueRoute(sosNotificationId, {
        sosId: sosNotificationId,
        targetName: activeSOS.userName,
        geometry: best.geometry,
        distance: best.distance,
        duration: best.duration,
        direct: false,
      });
    } catch (error) {
      console.error('Failed to build route to SOS rider:', error);
      const distance = getDistance(from, sosTargetLocation);
      saveRescueRoute(sosNotificationId, {
        sosId: sosNotificationId,
        targetName: activeSOS.userName,
        geometry: [from, sosTargetLocation],
        distance,
        duration: distance / (30 / 3.6),
        direct: true,
      });
    } finally {
      setRescueLoading(false);
    }
  }, [activeSOS, sosNotificationId, sosTargetLocation, myLocation, acknowledgeNotification, saveRescueRoute]);

  // Load ride data
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let requestInFlight = false;
    setLoadedRideId(undefined);
    setRideLoadError('');
    setRideClosedByMe(false);
    setPopupSOSId(null);
    setSOSError('');
    lastSentLocationAt.current = 0;

    const loadRide = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const apiRide = await getRideById(id);
        if (cancelled) return;
        setRideClosedByMe(!!user && !!apiRide.riders?.some((r) => r.userId === user.id && (r.closed || r.left)));
        const ride = mapApiRideToRide(apiRide);
        const canViewLoadedRiders = ride.status !== 'waiting' || ride.leaderId === user?.id;
        if (!canViewLoadedRiders) ride.activeSOS = undefined;
        const mappedRiders = canViewLoadedRiders ? mapApiRidersToSessions(apiRide) : [];
        const previousState = useRideStore.getState();
        const previousRiders = previousState.currentRide?.id === id ? previousState.riders : new Map<string, RiderSession>();

        // Backend falls back to the ride start for riders without a reported position;
        // prefer this device's GPS for me and the last known position for everyone else.
        mappedRiders.forEach((rider) => {
          if (rider.hasLeft) return;
          const reported = apiRide.riders?.find((r) => r.userId === rider.userId)?.location;
          if (rider.userId === user?.id && latestLocationRef.current) {
            rider.location = latestLocationRef.current;
          } else if (!reported) {
            const previous = previousRiders.get(rider.userId)?.location;
            if (previous) rider.location = previous;
          }
        });
        
        // Ensure current user is in the riders list
        const userInRiders = mappedRiders.find((r) => r.userId === user?.id);
        if (!userInRiders && user && canViewLoadedRiders) {
          const initialLocation = latestLocationRef.current
            ?? previousRiders.get(user.id)?.location
            ?? ride.startLocation;
          console.log('👤 Adding current user with location:', initialLocation);
          
          mappedRiders.push({
            userId: user.id,
            userName: user.name,
            isLeader: false,
            location: initialLocation,
            heading: 0,
            speed: 0,
            lastUpdate: Date.now(),
            isOnRoute: true,
            isOnline: true,
            routeFollowed: [],
          });
        }
        
        hydrateRide(ride, mappedRiders);
        setLoadedRideId(id);
        setRideLoadError('');

        const mySession = apiRide.riders?.find((rider) => rider.userId === user?.id);
        const notification = mySession?.wrongRouteAlert;
        const notificationKey = `${id}:${user?.id}:${notification?.id}`;
        if (notification && mySession && !mySession.closed && !mySession.left
          && apiRide.status === 'ACTIVE' && !useRideStore.getState().notificationReceipts[notificationKey]) {
          acknowledgeNotification(notificationKey);
          addAlert({
            ...notification,
            id: notificationKey,
            type: 'wrong_route',
            toUserId: mySession.userId,
            message: 'You are on the wrong route! Return to the selected route.',
          });
        }
        
        setActiveSOS(ride.activeSOS ?? null);
        if (ride.activeSOS && user && ride.activeSOS.userId !== user.id) {
          const sosId = `${id}:${user.id}:${ride.activeSOS.userId}:${ride.activeSOS.timestamp}`;
          if (!useRideStore.getState().notificationReceipts[sosId]) {
            acknowledgeNotification(sosId);
            setPopupSOSId(sosId);
          }
        }
      } catch (error) {
        if (!cancelled) setRideLoadError(error instanceof Error ? error.message : 'Unable to load this ride.');
      } finally {
        requestInFlight = false;
      }
    };

    loadRide();
    const interval = window.setInterval(loadRide, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, user, hydrateRide, setActiveSOS, addAlert, acknowledgeNotification, loadAttempt]);

  // Update user location when geolocation updates (without triggering map remount)
  useEffect(() => {
    if (!currentRide || !canViewRiders || currentRide.id !== id || loadedRideId !== id || rideLoadError || !user || !currentLocation) return;
    if (currentRide.status === 'completed' || rideClosedByMe) return;
    
    // Just update location
    console.log('🌍 Geolocation update:', currentLocation);
    updateRiderLocation(user.id, currentLocation, 0, 0);

    const now = Date.now();
    if (now - lastSentLocationAt.current < 3000) return;
    lastSentLocationAt.current = now;
    updateRiderLocationApi(currentRide.id, user.id, {
      location: currentLocation,
      onRoute: currentRide.route.length > 1 ? isOnRoute(currentLocation, currentRide.route) : true,
    }).catch((error) => console.error('Failed to sync location:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, user?.id, updateRiderLocation, currentRide?.id, currentRide?.status, rideClosedByMe, id, loadedRideId, rideLoadError, canViewRiders]);

  // Fallback: simulate own location if geolocation fails
  useEffect(() => {
    if (!currentRide || currentRide.id !== id || loadedRideId !== id || rideLoadError || !user || currentRide.status !== 'active' || currentLocation) return;
    if (rideClosedByMe) return;

    // Only use mock simulation if geolocation is not available
    const interval = setInterval(() => {
      const me = riders.get(user.id);
      if (me && currentRide) {
        const moved = simulateMovement(me, currentRide.destination);
        updateRiderLocation(user.id, moved.location, moved.heading, moved.speed);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentRide, user, currentLocation, riders, updateRiderLocation, rideClosedByMe, id, loadedRideId, rideLoadError]);

  const handleSOS = useCallback(async () => {
    if (!user || !currentRide || sosPending) return;
    setSOSPending(true);
    setSOSError('');
    const stillCurrent = () => useRideStore.getState().currentRide?.id === currentRide.id
      && useAuthStore.getState().user?.id === user.id;
    try {
      const confirmed = await triggerSOSApi(currentRide.id, user.id, user.name, riders.get(user.id)?.location);
      if (!stillCurrent()) return;
      if (!confirmed.activeSOS) throw new Error('SOS was not confirmed by the server.');
      setActiveSOS(confirmed.activeSOS);
      addAlert({
        id: crypto.randomUUID(), rideId: currentRide.id, type: 'sos',
        fromUserId: user.id, fromUserName: user.name,
        message: 'EMERGENCY SOS TRIGGERED', timestamp: confirmed.activeSOS.timestamp,
      });
    } catch (error) {
      if (stillCurrent()) setSOSError('SOS could not be sent. Please try again or contact emergency services directly.');
    } finally {
      setSOSPending(false);
    }
  }, [user, currentRide, riders, addAlert, setActiveSOS, sosPending]);

  const handleSOSCancel = useCallback(async () => {
    if (!user || !currentRide || sosPending) return;
    setSOSPending(true);
    setSOSError('');
    const stillCurrent = () => useRideStore.getState().currentRide?.id === currentRide.id
      && useAuthStore.getState().user?.id === user.id;
    try {
      const confirmed = await cancelSOSApi(currentRide.id, user.id);
      if (!stillCurrent()) return;
      if (confirmed.activeSOS?.userId === user.id) throw new Error('SOS cancellation was not confirmed.');
      setActiveSOS(confirmed.activeSOS ?? null);
    } catch (error) {
      if (stillCurrent()) setSOSError('SOS could not be cancelled. It remains active. Please try again.');
    } finally {
      setSOSPending(false);
    }
  }, [user, currentRide, setActiveSOS, sosPending]);

  // Auto-dismiss SOS alerts after 10 seconds
  useEffect(() => {
    if (!alerts || alerts.length === 0) return;

    const sosAlert = alerts.find(a => a.type === 'sos');
    if (!sosAlert) return;

    console.log('⏰ SOS alert will auto-dismiss in 10 seconds');
    const timeout = setTimeout(() => {
      console.log('⏰ Auto-dismissing SOS alert');
      dismissAlert(sosAlert.id);
    }, 10000);

    return () => clearTimeout(timeout);
  }, [alerts, dismissAlert]);

  const handleAlertRider = useCallback(async (rider: RiderSession) => {
    if (!user || !currentRide || alertCooldowns.has(rider.userId)) return;
    setAlertCooldowns((prev) => new Set(prev).add(rider.userId));
    const clearCooldown = () => {
      setAlertCooldowns((prev) => {
        const next = new Set(prev);
        next.delete(rider.userId);
        return next;
      });
    };
    try {
      await alertWrongRoute(currentRide.id, rider.userId, user.id);
      setTimeout(clearCooldown, 15000);
      addAlert({
        id: crypto.randomUUID(), type: 'info', fromUserId: user.id, fromUserName: user.name,
        message: `Alert sent to ${rider.userName}.`, timestamp: Date.now(),
      });
    } catch (error) {
      clearCooldown();
      addAlert({
        id: crypto.randomUUID(), type: 'info', fromUserId: user.id, fromUserName: user.name,
        message: `Failed to alert ${rider.userName}. Please try again.`, timestamp: Date.now(),
      });
    }
  }, [user, currentRide, alertCooldowns, addAlert]);

  const handleCopyCode = () => {
    if (currentRide) {
      navigator.clipboard.writeText(currentRide.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartRide = async () => {
    if (!currentRide) return;
    try {
      await updateRideStatus(currentRide.id, 'ACTIVE');
      startRide();
    } catch (error) {
      console.error(error);
      alert('Failed to start ride.');
    }
  };

  const handleEndRide = async () => {
    if (!currentRide) return;
    try {
      await updateRideStatus(currentRide.id, 'COMPLETED');
      endRide();
    } catch (error) {
      console.error(error);
      alert('Failed to end ride.');
    }
  };

  const handleCloseRide = async () => {
    // Non-leader closes the ride only for themselves; it keeps going for everyone else.
    if (!currentRide || !user) return;
    try {
      await closeRideForRider(currentRide.id, user.id);
      setRideClosedByMe(true);
    } catch (error) {
      console.error(error);
      alert('Failed to close ride. Please try again.');
    }
  };

  const handleRejoinRide = async () => {
    if (!currentRide || !user || isLeader || currentRide.status === 'completed' || rejoining) return;
    setRejoining(true);
    setRejoinError('');
    try {
      const joined = await joinRide(currentRide.id, {
        userId: user.id,
        userName: user.name,
        leader: false,
        location: latestLocationRef.current ?? undefined,
      });
      hydrateRide(mapApiRideToRide(joined), mapApiRidersToSessions(joined));
      setRideClosedByMe(false);
      lastSentLocationAt.current = 0;
    } catch (error) {
      setRejoinError(error instanceof Error ? error.message : 'Failed to rejoin ride. Please try again.');
    } finally {
      setRejoining(false);
    }
  };

  // Early returns for authentication/loading states
  if (!user) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Not authenticated</p>
          <Button onClick={() => navigate('/')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  if (rideLoadError) {
    return (
      <div className="h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p role="alert" className="text-destructive mb-4">Unable to load ride: {rideLoadError}</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Dashboard</Button>
            <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingRide) {
    return (
      <div className="h-screen w-full bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse mb-4">
            <p className="text-sm text-muted-foreground">Joining ride...</p>
          </div>
          <p className="text-xs text-muted-foreground">Requesting location access...</p>
        </div>
      </div>
    );
  }

  if (!currentRide) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Ride not found</p>
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  // Show ride completion/summary screen
  if (currentRide.status === 'completed' || rideClosedByMe) {
    const rideDuration = Math.floor((Date.now() - currentRide.createdAt) / 1000 / 60); // minutes
    const rideDate = new Date(currentRide.createdAt).toLocaleDateString();
    const rideTime = new Date(currentRide.createdAt).toLocaleTimeString();

    return (
      <div className="min-h-screen bg-background p-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">
            {currentRide.status === 'completed' ? 'Closed' : 'You Left'}
          </h1>
          <div className="w-5" />
        </div>

        {currentRide.status !== 'completed' && (
          <p className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            You left this ride. It continues for the other riders.
          </p>
        )}

        {/* Ride Summary Card */}
        <div className="glass rounded-xl p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">{currentRide.name}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" /> {rideDate} at {rideTime}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="w-4 h-4" /> {rideDuration} minutes
            </p>
          </div>

          <div className="border-t border-border pt-4 mb-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">ROUTE</p>
            <p className="text-sm text-foreground mb-1">{currentRide.startAddress}</p>
            <p className="text-xs text-muted-foreground mb-3">↓</p>
            <p className="text-sm text-foreground">{currentRide.destAddress}</p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">RIDE CODE</p>
            <p className="font-mono text-lg tracking-widest text-primary font-bold">{currentRide.code}</p>
          </div>
        </div>

        {/* Participants */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> RIDERS ({ridersArray.length})
          </h3>
          <div className="space-y-2">
            {ridersArray.map((rider) => (
              <div key={rider.userId} className="glass rounded-lg p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                  {rider.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{rider.userName}</p>
                  <p className="text-xs text-muted-foreground">
                    {rider.isLeader ? '👑 Leader' : 'Rider'}
                  </p>
                </div>
                {rider.hasLeft ? (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">Left ride</span>
                ) : rider.isOnRoute ? (
                  <span className="text-xs bg-success/20 text-success px-2 py-1 rounded">On Route</span>
                ) : (
                  <span className="text-xs bg-destructive/20 text-destructive px-2 py-1 rounded">Off Route</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button onClick={() => navigate('/')} className="flex-1" variant="outline">
            Home
          </Button>
          {currentRide.status !== 'completed' && !isLeader && (
            <Button onClick={handleRejoinRide} disabled={rejoining} className="flex-1">
              <RefreshCw className={`mr-2 h-4 w-4${rejoining ? ' animate-spin' : ''}`} />
              {rejoining ? 'Joining...' : 'Join Back'}
            </Button>
          )}
        </div>
        {rejoinError && <p role="alert" className="mt-2 text-sm text-destructive">{rejoinError}</p>}
      </div>
    );
  }

  // Render the ride view
  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-3">
        <div className="glass-strong rounded-xl p-3 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-foreground truncate">{currentRide.name}</h2>
            <p className="text-xs text-muted-foreground">{canViewRiders ? `${liveRiders.length} riders` : 'Waiting to start'}</p>
          </div>
          <button onClick={handleCopyCode} className="flex items-center gap-1 text-xs bg-secondary/50 px-2.5 py-1.5 rounded-lg text-secondary-foreground font-mono">
            {currentRide.code}
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </button>
          {isLeader && (
            <button
              onClick={() => navigate(`/ride/${currentRide.id}/edit`)}
              title="Edit ride"
              aria-label="Edit ride"
              className="w-8 h-8 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {isLeader && currentRide.status === 'waiting' && (
            <Button size="sm" onClick={handleStartRide} className="gap-1">
              <Play className="w-3 h-3" /> Start
            </Button>
          )}
          {isLeader && currentRide.status === 'active' && (
            <Button size="sm" variant="destructive" onClick={handleEndRide} className="gap-1">
              Close
            </Button>
          )}
          {!isLeader && currentRide.status === 'active' && (
            <Button size="sm" variant="destructive" onClick={handleCloseRide} className="gap-1">
              Leave
            </Button>
          )}
        </div>

        {/* Alerts */}
        {sosError && <p role="alert" className="mt-2 rounded-lg border border-red-500 bg-red-950 p-3 text-sm font-semibold text-white">{sosError}</p>}
        {visibleAlerts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {visibleAlerts.slice(0, 3).map((alert) => (
              <AlertBanner key={alert.id} alert={alert} onDismiss={() => dismissAlert(alert.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1">
        <RideMap
          riders={liveRiders}
          myUserId={user.id}
          route={currentRide.route}
          center={currentRide.startLocation}
          start={currentRide.startLocation}
          destination={currentRide.destination}
          focus={currentLocation}
          rescueRoute={rescueRoute?.geometry}
        />
      </div>

      {/* Rescue route bar for riders receiving an SOS */}
      {isReceivingSOS && activeSOS && popupSOSId !== sosNotificationId && !isSOSRouteDismissed && (
        <div
          className="absolute left-4 right-24 bottom-44 z-[1000] rounded-xl border-2 border-red-300 bg-white p-3 shadow-xl text-gray-900"
          style={{ fontFamily: 'Inter, "Segoe UI", Roboto, Arial, sans-serif' }}
          data-testid="rescue-route-bar"
        >
          {rescueRoute ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-6 shrink-0 rounded-full bg-red-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold truncate">Route to {rescueRoute.targetName}</p>
                <p className="text-sm font-semibold text-red-700">
                  {formatRouteDistance(rescueRoute.distance)} · {formatRouteDuration(rescueRoute.duration)}
                  {rescueRoute.direct && <span className="text-gray-600"> (straight line)</span>}
                </p>
              </div>
              <button
                type="button"
                className="h-9 w-9 shrink-0 rounded-full bg-blue-600 text-white shadow-md flex items-center justify-center hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-60"
                onClick={handleRouteToSOS}
                disabled={rescueLoading}
                aria-label="Refresh route"
                title="Refresh route"
              >
                <RefreshCw className={`w-4 h-4 ${rescueLoading ? 'animate-spin' : ''}`} strokeWidth={2.75} />
              </button>
              <button
                type="button"
                className="h-9 w-9 shrink-0 rounded-full bg-red-600 text-white shadow-md flex items-center justify-center hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                onClick={() => {
                  acknowledgeNotification(sosRouteDismissalId);
                  saveRescueRoute(sosNotificationId, null);
                }}
                aria-label="Clear route"
                title="Clear route"
              >
                <X className="w-4 h-4" strokeWidth={3} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-sm font-extrabold truncate">🚨 {activeSOS.userName} needs help</p>
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full bg-blue-600 text-white hover:bg-blue-700"
                onClick={handleRouteToSOS}
                disabled={rescueLoading}
                aria-label="Route"
                title="Route"
              >
                <Navigation className={`h-4 w-4${rescueLoading ? ' animate-pulse' : ''}`} />
              </Button>
              <Button
                size="icon"
                variant="destructive"
                className="h-8 w-8 shrink-0 rounded-full bg-red-600 text-white hover:bg-red-700"
                aria-label="Cancel"
                title="Cancel"
                onClick={() => acknowledgeNotification(sosRouteDismissalId)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {rescueError && <p className="mt-1 text-xs font-semibold text-red-700">{rescueError}</p>}
        </div>
      )}

      {/* SOS button (floating) */}
      {canViewRiders && <div className="absolute bottom-40 right-4 z-[1000]">
        <SOSButton
          onTrigger={handleSOS}
          onCancel={handleSOSCancel}
          disabled={currentRide.status !== 'active' || sosPending}
          isActive={activeSOS?.userId === user.id}
        />
      </div>}

      {/* Dismissing a notification does not cancel the sender's SOS. */}
      {activeSOS && activeSOS.userId !== user.id && popupSOSId === sosNotificationId && (
        <div
          className="absolute inset-0 z-[1100] bg-red-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ fontFamily: 'Inter, "Segoe UI", Roboto, Arial, sans-serif' }}
        >
          <div
            role="alert"
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-center shadow-2xl ring-4 ring-red-500"
          >
            <div className="bg-red-600 px-6 py-5">
              <div className="text-6xl mb-2 leading-none">🚨</div>
              <h2 className="text-3xl font-extrabold uppercase tracking-wider text-white">SOS ALERT!</h2>
            </div>
            <div className="px-6 py-6">
              <p className="text-2xl font-bold text-gray-900 mb-2 break-words">{activeSOS.userName} needs help</p>
              <p className="text-lg font-semibold text-red-700">Emergency assistance required</p>
              {activeSOS.location && (
                <p className="mt-4 rounded-lg bg-gray-100 px-3 py-2 text-base font-medium text-gray-800">
                  📍 {activeSOS.location.lat.toFixed(4)}, {activeSOS.location.lng.toFixed(4)}
                </p>
              )}
              <Button
                className="mt-6 h-12 w-full bg-red-600 text-lg font-bold text-white hover:bg-red-700 gap-2"
                onClick={handleRouteToSOS}
                disabled={rescueLoading}
              >
                <Navigation className="w-5 h-5" /> Route to {activeSOS.userName}
              </Button>
              <Button
                className="mt-3 h-12 w-full bg-gray-900 text-lg font-bold text-white hover:bg-gray-800"
                onClick={() => setPopupSOSId(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[1000] glass-strong rounded-t-2xl transition-all duration-300 ${
          panelOpen && canViewRiders ? 'max-h-[70vh]' : 'max-h-40'
        }`}
      >
        {canViewRiders && <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-center py-2"
        >
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30 mb-1" />
        </button>}
        <div className="px-4 pt-3 pb-3 border-b border-border/50 mb-2" aria-live="polite">
          <p className="text-xs text-muted-foreground mb-1">Your remaining journey to destination</p>
          {remainingJourney ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4 text-primary" />
                {formatRouteDistance(remainingJourney.distance)} left
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-primary" />
                {formatRouteDuration(remainingJourney.duration)} estimated
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {geoError ? geoError.message : !currentLocation
                ? 'Waiting for your GPS location...'
                : 'Remaining distance and time unavailable for this route.'}
            </p>
          )}
          {remainingJourney && geoError && <p className="text-xs text-destructive mt-1">Using last known GPS location: {geoError.message}</p>}
          {remainingJourney && <p className="text-[10px] text-muted-foreground mt-1">Based on the selected route; not live traffic.</p>}
        </div>
        {canViewRiders && <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-sm font-semibold text-foreground">{liveRiders.length} Riders</span>
          <button onClick={() => setPanelOpen(!panelOpen)} aria-label={panelOpen ? 'Hide riders' : 'Show riders'} className="text-muted-foreground">
            {panelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>}
        {canViewRiders && panelOpen && (
          <div className="px-4 pb-4 overflow-y-auto max-h-[45vh]">
            <RiderList
              riders={liveRiders}
              myUserId={user.id}
              myLocation={myLocation}
              onSelectRider={() => {}}
              onAlertRider={handleAlertRider}
              alertCooldowns={alertCooldowns}
            />
          </div>
        )}
      </div>

      {/* Waiting overlay */}
      {currentRide.status === 'waiting' && (
        <div className="absolute inset-0 z-[999] bg-background/60 backdrop-blur-sm flex items-center justify-center">
          <div className="glass-strong rounded-2xl p-8 text-center max-w-xs mx-4">
            <h3 className="text-lg font-bold text-foreground mb-2">
              {isLeader ? 'Waiting for riders' : 'Waiting for the ride to start'}
            </h3>
            {isLeader ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">Share this code to invite others</p>
                <div className="bg-background/50 rounded-lg p-4 font-mono text-2xl tracking-[0.3em] text-primary font-bold mb-4">
                  {currentRide.code}
                </div>
                <Button onClick={handleCopyCode} variant="outline" className="gap-2">
                  {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Code'}
                </Button>
                <Button onClick={handleStartRide} className="w-full mt-3">
                  <Play className="w-4 h-4 mr-1" /> Start Ride
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The ride creator has not started the ride yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
