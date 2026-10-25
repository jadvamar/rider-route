import type { Ride } from '@/types';
import { getJourneyTotals } from '@/services/journeyService';
import { formatRouteDistance, formatRouteDuration } from '@/services/routingService';

export function JourneySummary({ ride }: {
  ride: Pick<Ride, 'route' | 'distanceMeters' | 'durationSeconds'>;
}) {
  const totals = getJourneyTotals(ride);
  return (
    <p className="text-xs text-primary mt-2">
      {totals
        ? `${formatRouteDistance(totals.distance)} · ${formatRouteDuration(totals.duration)} estimated${totals.approximate ? ' (approximate)' : ''} from start to destination`
        : 'Route distance and estimated time unavailable'}
    </p>
  );
}
