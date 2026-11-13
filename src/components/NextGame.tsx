import { formatHMS, msUntilNextDay } from '../lib/time';
import { useNow } from './hooks';

/** Ticking countdown to 00:00 UTC; isolated so only this text re-renders each second. */
export function NextGame({ offset = 0, className = 'num' }: { offset?: number; className?: string }) {
  const now = useNow(1000, offset);
  return <span className={className}>{formatHMS(msUntilNextDay(now))}</span>;
}
