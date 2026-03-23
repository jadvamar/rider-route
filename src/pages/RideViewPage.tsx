import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, ChevronUp, ChevronDown, Play, Square, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import RideMap from '@/components/map/RideMap';
import RiderList from '@/components/ride/RiderList';
import { SOSButton, AlertBanner } from '@/components/ride/SOSButton';
import { createDemoRiders, simulateMovement } from '@/services/mockSimulation';
import { isOnRoute } from '@/services/locationService';
import type { RiderSession } from '@/types';

export default function RideViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentRide, riders, alerts,
    addRider, updateRiderLocation, addAlert, dismissAlert,
    startRide, endRide, setRiderOnRoute,
  } = useRideStore();

  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [alertCooldowns, setAlertCooldowns] = useState<Set<string>>(new Set());
  const simulationRef = useRef<number>();
  const demoInitialized = useRef(false);

  // Initialize demo riders
  useEffect(() => {
    if (!currentRide || !user || demoInitialized.current) return;
    demoInitialized.current = true;
    const demoRiders = createDemoRiders(currentRide.startLocation);
    demoRiders.forEach((r) => addRider(r));
  }, [currentRide, user, addRider]);

  // Simulate rider movement
  useEffect(() => {
    if (!currentRide || currentRide.status !== 'active') return;

    simulationRef.current = window.setInterval(() => {
      riders.forEach((rider, userId) => {
        if (userId === user?.id) return; // Don't simulate self
        const moved = simulateMovement(rider, currentRide.destination);
        updateRiderLocation(userId, moved.location, moved.heading, moved.speed);

        // Check route deviation
        const onRoute = isOnRoute(moved.location, currentRide.route, 200);
        if (rider.isOnRoute !== onRoute) {
          setRiderOnRoute(userId, onRoute);
        }
      });
    }, 2000);

    return () => clearInterval(simulationRef.current);
  }, [currentRide, currentRide?.status, user?.id, riders, updateRiderLocation, setRiderOnRoute]);

  // Simulate own location with geolocation or mock
  useEffect(() => {
    if (!currentRide || !user || currentRide.status !== 'active') return;

    let watchId: number | null = null;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          updateRiderLocation(user.id, { lat: pos.coords.latitude, lng: pos.coords.longitude }, pos.coords.heading || 0, (pos.coords.speed || 0) * 3.6);
        },
        () => {
          // Fallback: simulate own movement
          const interval = setInterval(() => {
            const me = riders.get(user.id);
            if (me && currentRide) {
              const moved = simulateMovement(me, currentRide.destination);
              updateRiderLocation(user.id, moved.location, moved.heading, moved.speed);
            }
          }, 3000);
          return () => clearInterval(interval);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [currentRide, currentRide?.status, user]);

  const handleSOS = useCallback(() => {
    if (!user || !currentRide) return;
    const me = riders.get(user.id);
    addAlert({
      id: crypto.randomUUID(),
      type: 'sos',
      fromUserId: user.id,
      fromUserName: user.name,
      message: 'EMERGENCY SOS',
      location: me?.location,
      timestamp: Date.now(),
    });
  }, [user, currentRide, riders, addAlert]);

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

  if (!currentRide || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No active ride</p>
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const ridersArray = Array.from(riders.values());
  const isLeader = currentRide.leaderId === user.id;
  const myLocation = riders.get(user.id)?.location;

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
            <Button size="sm" onClick={startRide} className="gap-1">
              <Play className="w-3 h-3" /> Start
            </Button>
          )}
          {isLeader && currentRide.status === 'active' && (
            <Button size="sm" variant="destructive" onClick={endRide} className="gap-1">
              <Square className="w-3 h-3" /> End
            </Button>
          )}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {alerts.slice(0, 3).map((alert) => (
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
      <div className="absolute bottom-24 right-4 z-[1000]">
        <SOSButton onTrigger={handleSOS} disabled={currentRide.status !== 'active'} />
      </div>

      {/* Bottom panel */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[1000] glass-strong rounded-t-2xl transition-all duration-300 ${
          panelOpen ? 'max-h-[60vh]' : 'max-h-16'
        }`}
      >
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-center py-2"
        >
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30 mb-1" />
        </button>
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
              <Button onClick={startRide} className="w-full mt-3">
                <Play className="w-4 h-4 mr-1" /> Start Ride
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
