import { useState } from 'react';
import { AlertTriangle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Alert } from '@/types';

interface SOSButtonProps {
  onTrigger: () => void;
  disabled?: boolean;
}

export function SOSButton({ onTrigger, disabled }: SOSButtonProps) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (confirming) {
      onTrigger();
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        w-16 h-16 rounded-full flex items-center justify-center font-bold text-sm
        transition-all duration-200
        ${confirming
          ? 'bg-destructive text-destructive-foreground sos-pulse glow-danger'
          : 'bg-destructive/20 text-destructive border-2 border-destructive/50 hover:bg-destructive hover:text-destructive-foreground'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {confirming ? 'CONFIRM' : 'SOS'}
    </button>
  );
}

interface AlertBannerProps {
  alert: Alert;
  onDismiss: () => void;
}

export function AlertBanner({ alert, onDismiss }: AlertBannerProps) {
  const isSOS = alert.type === 'sos';

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg animate-slide-up
        ${isSOS ? 'bg-destructive/20 border border-destructive/50' : 'bg-warning/20 border border-warning/50'}
      `}
    >
      {isSOS ? (
        <Phone className="w-5 h-5 text-destructive shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {isSOS ? `SOS from ${alert.fromUserName}!` : alert.message}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {isSOS ? 'Emergency — check their location' : `From ${alert.fromUserName}`}
        </p>
      </div>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground text-sm p-1">
        ✕
      </button>
    </div>
  );
}

interface WrongRouteButtonProps {
  targetName: string;
  onSend: () => void;
  disabled?: boolean;
}

export function WrongRouteButton({ targetName, onSend, disabled }: WrongRouteButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSend}
      disabled={disabled}
      className="text-warning border-warning/30 hover:bg-warning/10"
    >
      <AlertTriangle className="w-3 h-3 mr-1" />
      Alert {targetName}
    </Button>
  );
}
