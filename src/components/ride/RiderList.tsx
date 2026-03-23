import { Users, MapPin, Clock, Wifi, WifiOff } from 'lucide-react';
import type { RiderSession, LatLng } from '@/types';
import { formatDistance, getDistance, getETA, formatETA } from '@/services/locationService';
import { WrongRouteButton } from './SOSButton';

interface RiderListProps {
  riders: RiderSession[];
  myUserId: string;
  myLocation?: LatLng;
  onSelectRider: (rider: RiderSession) => void;
  onAlertRider: (rider: RiderSession) => void;
  alertCooldowns: Set<string>;
}

export default function RiderList({
  riders,
  myUserId,
  myLocation,
  onSelectRider,
  onAlertRider,
  alertCooldowns,
}: RiderListProps) {
  const sortedRiders = [...riders].sort((a, b) => {
    if (a.userId === myUserId) return -1;
    if (b.userId === myUserId) return 1;
    if (a.isLeader) return -1;
    if (b.isLeader) return 1;
    return 0;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
        <Users className="w-4 h-4" />
        <span>{riders.length} riders</span>
      </div>
      {sortedRiders.map((rider) => {
        const isMe = rider.userId === myUserId;
        const dist = myLocation && !isMe ? getDistance(myLocation, rider.location) : null;
        const eta = dist ? getETA(dist, rider.speed) : null;
        const stale = Date.now() - rider.lastUpdate > 30000;

        return (
          <button
            key={rider.userId}
            onClick={() => onSelectRider(rider)}
            className="w-full glass rounded-lg p-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left"
          >
            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                ${isMe ? 'bg-primary text-primary-foreground' : rider.isLeader ? 'bg-warning text-warning-foreground' : 'bg-secondary text-secondary-foreground'}
              `}
            >
              {rider.userName.charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm text-foreground truncate">
                  {rider.userName}
                  {isMe && ' (You)'}
                </span>
                {rider.isLeader && (
                  <span className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-semibold">
                    LEAD
                  </span>
                )}
                {!rider.isOnRoute && (
                  <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-semibold">
                    OFF ROUTE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {dist !== null && (
                  <>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                      {formatDistance(dist)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {formatETA(eta!)}
                    </span>
                  </>
                )}
                <span className="flex items-center gap-0.5">
                  {stale || !rider.isOnline ? (
                    <WifiOff className="w-3 h-3 text-destructive" />
                  ) : (
                    <Wifi className="w-3 h-3 text-success" />
                  )}
                </span>
              </div>
            </div>

            {!isMe && !rider.isOnRoute && (
              <WrongRouteButton
                targetName={rider.userName}
                onSend={() => onAlertRider(rider)}
                disabled={alertCooldowns.has(rider.userId)}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
