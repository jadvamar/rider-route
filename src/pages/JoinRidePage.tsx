import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useRideStore } from '@/store/useRideStore';
import { useState } from 'react';

// Demo ride for join flow
const DEMO_RIDE = {
  id: 'demo-ride',
  name: 'Weekend Group Ride',
  code: 'DEMO01',
  leaderId: 'leader-1',
  startLocation: { lat: 28.6139, lng: 77.209 },
  destination: { lat: 28.6329, lng: 77.2195 },
  startAddress: 'Connaught Place',
  destAddress: 'Red Fort',
  route: [
    { lat: 28.6139, lng: 77.209 },
    { lat: 28.618, lng: 77.211 },
    { lat: 28.622, lng: 77.214 },
    { lat: 28.626, lng: 77.217 },
    { lat: 28.63, lng: 77.219 },
    { lat: 28.6329, lng: 77.2195 },
  ],
  status: 'active' as const,
  createdAt: Date.now(),
};

export default function JoinRidePage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuthStore();
  const { joinRide, addRider } = useRideStore();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleJoin = () => {
    if (!user) return;
    const ride = { ...DEMO_RIDE, code: code || DEMO_RIDE.code };
    joinRide(ride, {
      userId: user.id,
      userName: user.name,
      isLeader: false,
      location: { lat: ride.startLocation.lat + 0.002, lng: ride.startLocation.lng + 0.001 },
      heading: 0,
      speed: 0,
      lastUpdate: Date.now(),
      isOnRoute: true,
      isOnline: true,
      routeFollowed: [],
    });
    // Add demo leader
    addRider({
      userId: 'leader-1',
      userName: 'Leader',
      isLeader: true,
      location: ride.startLocation,
      heading: 0,
      speed: 30,
      lastUpdate: Date.now(),
      isOnRoute: true,
      isOnline: true,
      routeFollowed: [],
    });
    navigate(`/ride/${ride.id}`);
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-lg mx-auto flex flex-col items-center justify-center">
      <button onClick={() => navigate('/dashboard')} className="self-start flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="glass-strong rounded-2xl p-8 text-center w-full max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🏍️</span>
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1">{DEMO_RIDE.name}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {DEMO_RIDE.startAddress} → {DEMO_RIDE.destAddress}
        </p>

        <div className="bg-background/50 rounded-lg p-3 mb-6 font-mono text-xl tracking-[0.3em] text-primary font-bold">
          {code || DEMO_RIDE.code}
        </div>

        <Button onClick={handleJoin} className="w-full" size="lg">
          Join Ride
        </Button>
      </div>
    </div>
  );
}
