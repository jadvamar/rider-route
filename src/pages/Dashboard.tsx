import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogIn, LogOut, MapPin, Clock, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { getRidesByUser, type ApiRide } from '@/services/api';
import { JourneySummary } from '@/components/ride/JourneySummary';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const [joinCode, setJoinCode] = useState('');
  const [rideHistory, setRideHistory] = useState<ApiRide[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    setLoadingHistory(true);
    getRidesByUser(user.id)
      .then((rides) => {
        const sorted = [...rides].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setRideHistory(sorted);
      })
      .catch(() => {
        setRideHistory([]);
      })
      .finally(() => setLoadingHistory(false));
  }, [user]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      navigate(`/join/${joinCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Hey, {user?.name || 'Rider'} 👋</h1>
          <p className="text-sm text-muted-foreground">Ready to ride?</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/'); }}>
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => navigate('/create')}
          className="glass-strong rounded-xl p-6 text-left hover:border-primary/30 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:glow-primary transition-shadow">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Create Ride</h3>
          <p className="text-xs text-muted-foreground mt-1">Start a new group ride</p>
        </button>

        <button
          onClick={() => document.getElementById('join-input')?.focus()}
          className="glass-strong rounded-xl p-6 text-left hover:border-accent/30 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
            <LogIn className="w-5 h-5 text-accent" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Join Ride</h3>
          <p className="text-xs text-muted-foreground mt-1">Enter a ride code</p>
        </button>
      </div>

      {/* Join form */}
      <form onSubmit={handleJoin} className="glass rounded-xl p-4 flex gap-2 mb-8">
        <Input
          id="join-input"
          placeholder="Enter ride code (e.g. ABC123)"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="bg-background/50 border-border/50 font-mono tracking-widest text-center"
        />
        <Button type="submit" disabled={joinCode.length < 4}>
          Preview
        </Button>
      </form>

      {/* Ride history */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3">
          <History className="w-4 h-4" /> Recent Rides
        </h2>
        {loadingHistory ? (
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Loading recent rides...</p>
          </div>
        ) : rideHistory.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center">
            <MapPin className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No rides yet</p>
            <p className="text-xs text-muted-foreground/60">Create or join a ride to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rideHistory.map((ride) => (
              <div key={ride.id} className="glass rounded-lg p-3 flex items-center gap-3">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{ride.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(ride.createdAt).toLocaleDateString()} · {ride.startAddress} → {ride.destAddress}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    Riders: {(ride.riders || []).map((r) => r.userName).join(', ') || 'None'}
                  </p>
                  <JourneySummary ride={ride} />
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/ride/${ride.id}`)}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
