import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Hash, ArrowRight, LogOut, MapPin, Clock, History, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { getRidesByUser, removeRideFromHistory, type ApiRide } from '@/services/api';
import { JourneySummary } from '@/components/ride/JourneySummary';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const [joinCode, setJoinCode] = useState('');
  const [rideHistory, setRideHistory] = useState<ApiRide[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const navigate = useNavigate();
  const confirmRide = rideHistory.find((r) => r.id === confirmDeleteId) ?? null;

  useEffect(() => {
    if (!confirmDeleteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDeleteId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDeleteId]);

  const handleRemove = async (rideId: string) => {
    if (!user) return;
    setDeletingId(rideId);
    setDeleteError('');
    try {
      await removeRideFromHistory(user.id, rideId);
      setRideHistory((rides) => rides.filter((r) => r.id !== rideId));
      setConfirmDeleteId(null);
    } catch {
      setDeleteError('Could not delete this ride. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
        <button
          onClick={() => navigate('/create')}
          className="glass-strong rounded-lg p-4 sm:p-6 min-w-0 flex flex-col items-start text-left hover:border-primary/30 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:glow-primary transition-shadow">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Create Ride</h3>
          <p className="text-xs text-muted-foreground mt-1">Start a new group ride</p>
        </button>

        <form onSubmit={handleJoin} className="glass-strong rounded-lg p-4 sm:p-6 flex min-w-0 flex-col items-start hover:border-primary/30 transition-colors group">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:glow-primary transition-shadow">
            <Hash className="w-5 h-5 text-primary" />
          </div>
          <label htmlFor="join-input" className="font-semibold text-foreground text-sm">Ride Code</label>
          <div className="mt-3 flex w-full min-w-0 items-center gap-1.5">
            <Input
              id="join-input"
              placeholder="ABC123"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="h-9 min-w-0 flex-1 bg-background/50 border-border/50 px-1 font-mono tracking-normal text-center text-xs sm:text-sm"
            />
            <Button type="submit" size="icon" disabled={joinCode.length < 4} className="h-9 w-8 shrink-0" aria-label="Preview" title="Preview ride">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>

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
              <div
                key={ride.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${ride.name}`}
                onClick={() => navigate(`/ride/${ride.id}`)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/ride/${ride.id}`);
                  }
                }}
                className={`glass rounded-lg p-3 ${ride.leaderId === user?.id && ride.status !== 'COMPLETED' ? 'pr-[4.5rem]' : 'pr-10'} relative flex items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-secondary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors`}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDeleteId(ride.id); }}
                  aria-label={`Delete ${ride.name} from history`}
                  title="Delete from my history"
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
                {ride.leaderId === user?.id && ride.status !== 'COMPLETED' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/ride/${ride.id}/edit`); }}
                    aria-label={`Edit ${ride.name}`}
                    title="Edit ride"
                    className="absolute top-2 right-10 w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Pencil className="w-3 h-3" strokeWidth={3} />
                  </button>
                )}
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{ride.name}</span>
                    <span className="text-muted-foreground shrink-0">|</span>
                    {ride.status === 'COMPLETED' ? (
                      <span className="text-xs font-semibold text-red-500 shrink-0">Closed</span>
                    ) : ride.riders?.some((rider) => rider.userId === user?.id && (rider.closed || rider.left)) ? (
                      <span className="text-xs font-semibold text-amber-500 shrink-0">You Left</span>
                    ) : (
                      <span className="text-xs font-semibold text-green-500 shrink-0">Ongoing</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(ride.createdAt).toLocaleDateString()} � {ride.startAddress} ? {ride.destAddress}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    Leader: {(ride.riders || []).find((r) => r.userId === ride.leaderId)?.userName
                      ?? (ride.leaderId === user?.id ? user?.name : undefined)
                      ?? 'Unknown'}
                  </p>
                  <JourneySummary ride={ride} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmRide && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-6"
          onClick={() => deletingId === null && setConfirmDeleteId(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-ride-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border-t-4 border-red-600"
            style={{ fontFamily: "Inter, 'Segoe UI', Roboto, Arial, sans-serif" }}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 id="delete-ride-title" className="text-lg font-bold text-gray-900">Want to delete ride?</h3>
                <p className="text-sm font-semibold text-gray-800 truncate">{confirmRide.name}</p>
                <p className="text-sm text-gray-600 mt-1">It is only removed from your history. Other riders keep it.</p>
              </div>
            </div>
            {deleteError && <p className="text-sm font-semibold text-red-700 mt-3">{deleteError}</p>}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId !== null}
                className="flex-1 h-11 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-900 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRide.id)}
                disabled={deletingId !== null}
                className="flex-1 h-11 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold"
              >
                {deletingId === confirmRide.id ? 'Deleting...' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
