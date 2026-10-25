import { useState, useEffect } from 'react';
import { AlertTriangle, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Alert } from '@/types';

interface SOSButtonProps {
  onTrigger: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  isActive?: boolean;
}

export function SOSButton({ onTrigger, onCancel, disabled, isActive }: SOSButtonProps) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (isActive) {
      // If SOS is active, show cancel confirmation
      if (confirming) {
        onCancel?.();
        setConfirming(false);
      } else {
        setConfirming(true);
        setTimeout(() => setConfirming(false), 3000);
      }
    } else {
      // Normal SOS flow
      if (confirming) {
        onTrigger();
        setConfirming(false);
      } else {
        setConfirming(true);
        setTimeout(() => setConfirming(false), 3000);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`
          w-16 h-16 rounded-full flex items-center justify-center font-bold text-sm
          transition-all duration-200
          ${isActive
            ? confirming
              ? 'bg-orange-500 text-orange-foreground glow-orange'
              : 'bg-destructive text-destructive-foreground sos-pulse glow-danger'
            : confirming
              ? 'bg-destructive text-destructive-foreground sos-pulse glow-danger'
              : 'bg-destructive/20 text-destructive border-2 border-destructive/50 hover:bg-destructive hover:text-destructive-foreground'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isActive ? (confirming ? 'CANCEL?' : 'ACTIVE') : (confirming ? 'CONFIRM' : 'SOS')}
      </button>
      {isActive && (
        <div className="text-sm font-extrabold uppercase tracking-wide text-white bg-red-600 border-2 border-white px-3 py-1 rounded-full shadow-lg animate-pulse whitespace-nowrap">
          SOS ALERT ACTIVE
        </div>
      )}
    </div>
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
      role="status"
      className={`
        flex items-center gap-3 p-3.5 rounded-xl shadow-xl border-2 animate-slide-up
        ${isSOS ? 'bg-red-600 border-white text-white' : 'bg-amber-400 border-amber-600 text-gray-950'}
      `}
      style={{ fontFamily: 'Inter, "Segoe UI", Roboto, Arial, sans-serif' }}
    >
      {isSOS ? (
        <Phone className="w-6 h-6 shrink-0" />
      ) : (
        <AlertTriangle className="w-6 h-6 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-base font-extrabold leading-tight">
          {isSOS ? `SOS from ${alert.fromUserName}!` : alert.message}
        </p>
        <p className={`text-sm font-semibold truncate ${isSOS ? 'text-red-50' : 'text-gray-800'}`}>
          {isSOS ? 'Emergency — check their location' : `From ${alert.fromUserName}`}
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss alert"
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base font-bold ${
          isSOS ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-950'
        }`}
      >
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
