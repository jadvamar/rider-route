import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, ChevronUp, ChevronDown, Play, Square, Share2, Clock, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import RideMap from '@/components/map/RideMap';
import RiderList from '@/components/ride/RiderList';
import { SOSButton, AlertBanner } from '@/components/ride/SOSButton';
import { simulateMovement } from '@/services/mockSimulation';
import { isOnRoute } from '@/services/locationService';
import { useGeolocation } from '@/hooks/useGeolocation';
import { playSOSSound, playAlertSound } from '@/lib/soundNotification';
import type { RiderSession } from '@/types';
import { getRideById, updateRideStatus, triggerSOS as triggerSOSApi, cancelSOS as cancelSOSApi } from '@/services/api';
import { mapApiRideToRide, mapApiRidersToSessions } from '@/services/rideMapper';
import { getRemainingJourney } from '@/services/journeyService';
import { formatRouteDistance, formatRouteDuration } from '@/services/routingService';

export default function RideViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentRide, riders, alerts, activeSOS,
    addRider, updateRiderLocation, addAlert, dismissAlert, setActiveSOS,
    startRide, endRide, setRiderOnRoute, hydrateRide,
  } = useRideStore();

  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [alertCooldowns, setAlertCooldowns] = useState<Set<string>>(new Set());
  const receivedSOSIds = useRef(new Set<string>());
  const [dismissedSOSIds, setDismissedSOSIds] = useState<Set<string>>(new Set());
  const [rideClosedByMe, setRideClosedByMe] = useState(false);
  const simulationRef = useRef<number>();
  
  // Geolocation hook for real-time location tracking
  const { location: currentLocation, error: geoError } = useGeolocation({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
    watch: true, // Enable continuous tracking
  });

  // Compute derived state (must be before early returns)
  const isLoadingRide = !currentRide && id;
  const ridersArray = useMemo(() => Array.from(riders.values()), [riders]);
  const isLeader = currentRide?.leaderId === user?.id;
  const myLocation = riders.get(user?.id ?? '')?.location;
  const remainingJourney = useMemo(() =>
    currentRide && currentLocation ? getRemainingJourney(currentRide, currentLocation) : null,
  [currentRide, currentLocation]);
  const sosNotificationId = activeSOS
    ? `${id}:${user?.id}:${activeSOS.userId}:${activeSOS.timestamp}`
    : '';
  const visibleAlerts = alerts.filter((alert) => alert.type !== 'sos' || alert.fromUserId === user?.id);

  // Load ride data
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadRide = async () => {
      try {
        const apiRide = await getRideById(id);
        if (cancelled) return;
        const ride = mapApiRideToRide(apiRide);
        const mappedRiders = mapApiRidersToSessions(apiRide);
        
        // Ensure current user is in the riders list
        const userInRiders = mappedRiders.find((r) => r.userId === user?.id);
        if (!userInRiders && user) {
          // Use ride's destination as initial location (don't use currentLocation here to avoid remounting map)
          const initialLocation = ride.destination;
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
        
        setActiveSOS(ride.activeSOS ?? null);
        if (ride.activeSOS && user && ride.activeSOS.userId !== user.id) {
          const sosId = `${id}:${user.id}:${ride.activeSOS.userId}:${ride.activeSOS.timestamp}`;
          if (!receivedSOSIds.current.has(sosId)) {
            receivedSOSIds.current.add(sosId);
            playSOSSound();
          }
        }
      } catch (error) {
        console.error(error);
      }
    };

    loadRide();
    const interval = window.setInterval(loadRide, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, user, hydrateRide, setActiveSOS]);

  // Update user location when geolocation updates (without triggering map remount)
  useEffect(() => {
    if (!currentRide || !user || !currentLocation) return;
    if (currentRide.status === 'completed' || rideClosedByMe) return;
    
    // Just update location
    console.log('🌍 Geolocation update:', currentLocation);
    updateRiderLocation(user.id, currentLocation, 0, 0);
  }, [currentLocation, user?.id, updateRiderLocation, currentRide?.status, rideClosedByMe]);

  // Fallback: simulate own location if geolocation fails
  useEffect(() => {
    if (!currentRide || !user || currentRide.status !== 'active' || currentLocation) return;
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
  }, [currentRide, user, currentLocation, riders, updateRiderLocation]);

  const handleSOS = useCallback(async () => {
    if (!user || !currentRide) {
      console.error('❌ handleSOS: Missing user or currentRide', { user, currentRide });
      alert('Cannot trigger SOS: Missing user or ride information');
      return;
    }
    
    console.log('🚨 handleSOS called by', user.name);
    
    const me = riders.get(user.id);
    console.log('📍 Current rider:', me);
    
    // Create SOS object
    const sosData = {
      userId: user.id,
      userName: user.name,
      location: me?.location,
      timestamp: Date.now(),
    };
    
    // Set local active SOS state immediately (UI feedback)
    console.log('🔴 Setting activeSOS');
    setActiveSOS(sosData);
    
    // Add alert locally
    const alertId = crypto.randomUUID();
    console.log('📢 Adding SOS alert');
    addAlert({
      id: alertId,
      type: 'sos',
      fromUserId: user.id,
      fromUserName: user.name,
      message: 'EMERGENCY SOS TRIGGERED',
      location: me?.location,
      timestamp: sosData.timestamp,
    });
    
    // Play SOS sound
    console.log('🔊 Playing SOS sound');
    try {
      playSOSSound();
    } catch (err) {
      console.error('Failed to play sound:', err);
    }
    
    // Try to call API to trigger SOS (this will broadcast to backend)
    try {
      console.log('📤 Calling triggerSOSApi...');
      await triggerSOSApi(currentRide.id, user.id, user.name, me?.location);
      console.log('✅ triggerSOSApi succeeded');
    } catch (error) {
      console.warn('⚠️ SOS API endpoint error (may not be implemented on backend):', error);
      // Don't fail the whole operation - local state is already set
    }
    
    console.log('✅ SOS triggered successfully by', user.name);
  }, [user, currentRide, riders, addAlert, setActiveSOS]);

  const handleSOSCancel = useCallback(async () => {
    if (!user || !currentRide) {
      console.error('❌ handleSOSCancel: Missing user or currentRide');
      return;
    }
    
    console.log('✅ handleSOSCancel called by', user.name);
    
    // Clear local SOS state immediately
    console.log('🟢 Clearing activeSOS');
    setActiveSOS(null);
    
    // Add cancel alert
    console.log('📢 Adding cancel alert');
    addAlert({
      id: crypto.randomUUID(),
      type: 'info',
      fromUserId: user.id,
      fromUserName: user.name,
      message: 'SOS ALERT CANCELLED',
      timestamp: Date.now(),
    });
    
    // Try to call API to cancel SOS
    try {
      console.log('📤 Calling cancelSOSApi...');
      await cancelSOSApi(currentRide.id, user.id);
      console.log('✅ cancelSOSApi succeeded');
    } catch (error) {
      console.warn('⚠️ SOS cancel API endpoint error (may not be implemented on backend):', error);
      // Don't fail - local state is already cleared
    }
    
    console.log('✅ SOS cancelled successfully by', user.name);
  }, [user, currentRide, addAlert, setActiveSOS]);

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

  const handleAlertRider = useCallback((rider: RiderSession) => {
    if (!user || alertCooldowns.has(rider.userId)) return;
    addAlert({
      id: crypto.randomUUID(),
      type: 'wrong_route',
      fromUserId: user.id,
      fromUserName: user.name,
      toUserId: rider.userId,
      message: `${rider.userName}, you are on the wrong route!`,
      timestamp: Date.now(),
    });
    setAlertCooldowns((prev) => new Set(prev).add(rider.userId));
    setTimeout(() => {
      setAlertCooldowns((prev) => {
        const next = new Set(prev);
        next.delete(rider.userId);
        return next;
      });
    }, 15000);
  }, [user, alertCooldowns, addAlert]);

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

  const handleCloseRide = () => {
    // Non-leader close ride from their view
    setRideClosedByMe(true);
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
          <h1 className="text-xl font-bold text-foreground">Ride Completed ✓</h1>
          <div className="w-5" />
        </div>

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

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">ROUTE</p>
            <p className="text-sm text-foreground mb-1">{currentRide.startAddress}</p>
            <p className="text-xs text-muted-foreground mb-3">↓</p>
            <p className="text-sm text-foreground">{currentRide.destAddress}</p>
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
                {rider.isOnRoute ? (
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
          <Button onClick={() => navigate('/dashboard')} className="flex-1" variant="outline">
            Back to Dashboard
          </Button>
          <Button onClick={() => navigate('/')} className="flex-1">
            Home
          </Button>
        </div>
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
            <p className="text-xs text-muted-foreground">{ridersArray.length} riders</p>
          </div>
          <button onClick={handleCopyCode} className="flex items-center gap-1 text-xs bg-secondary/50 px-2.5 py-1.5 rounded-lg text-secondary-foreground font-mono">
            {currentRide.code}
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </button>
          {isLeader && currentRide.status === 'waiting' && (
            <Button size="sm" onClick={handleStartRide} className="gap-1">
              <Play className="w-3 h-3" /> Start
            </Button>
          )}
          {isLeader && currentRide.status === 'active' && (
            <Button size="sm" variant="destructive" onClick={handleEndRide} className="gap-1">
              <Square className="w-3 h-3" /> End
            </Button>
          )}
          {!isLeader && currentRide.status === 'active' && (
            <Button size="sm" variant="outline" onClick={handleCloseRide} className="gap-1">
              <Square className="w-3 h-3" /> Close Ride
            </Button>
          )}
        </div>

        {/* Alerts */}
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
          riders={ridersArray}
          myUserId={user.id}
          route={currentRide.route}
          center={currentRide.startLocation}
        />
      </div>

      {/* SOS button (floating) */}
      <div className="absolute bottom-40 right-4 z-[1000]">
        <SOSButton
          onTrigger={handleSOS}
          onCancel={handleSOSCancel}
          disabled={currentRide.status !== 'active'}
          isActive={activeSOS?.userId === user.id}
        />
      </div>

      {/* Dismissing a notification does not cancel the sender's SOS. */}
      {activeSOS && activeSOS.userId !== user.id && !dismissedSOSIds.has(sosNotificationId) && (
        <div className="absolute inset-0 z-[1100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div role="alert" className="text-center">
            <div className="mb-4">
              <div className="text-6xl mb-3">🚨</div>
              <h2 className="text-2xl font-bold text-destructive mb-2">SOS ALERT!</h2>
              <p className="text-lg text-foreground mb-1">{activeSOS.userName} needs help</p>
              <p className="text-sm text-muted-foreground">Emergency assistance required</p>
            </div>
            {activeSOS.location && (
              <p className="text-xs text-muted-foreground mt-4">
                Location: {activeSOS.location.lat.toFixed(4)}, {activeSOS.location.lng.toFixed(4)}
              </p>
            )}
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => setDismissedSOSIds((previous) => new Set(previous).add(sosNotificationId))}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[1000] glass-strong rounded-t-2xl transition-all duration-300 ${
          panelOpen ? 'max-h-[70vh]' : 'max-h-40'
        }`}
      >
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-center py-2"
        >
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30 mb-1" />
        </button>
        <div className="px-4 pb-3 border-b border-border/50 mb-2" aria-live="polite">
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
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-sm font-semibold text-foreground">{ridersArray.length} Riders</span>
          <button onClick={() => setPanelOpen(!panelOpen)} className="text-muted-foreground">
            {panelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
        {panelOpen && (
          <div className="px-4 pb-4 overflow-y-auto max-h-[45vh]">
            <RiderList
              riders={ridersArray}
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
            <h3 className="text-lg font-bold text-foreground mb-2">Waiting for riders</h3>
            <p className="text-sm text-muted-foreground mb-4">Share this code to invite others</p>
            <div className="bg-background/50 rounded-lg p-4 font-mono text-2xl tracking-[0.3em] text-primary font-bold mb-4">
              {currentRide.code}
            </div>
            <Button onClick={handleCopyCode} variant="outline" className="gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Code'}
            </Button>
            {isLeader && (
              <Button onClick={handleStartRide} className="w-full mt-3">
                <Play className="w-4 h-4 mr-1" /> Start Ride
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
