/** Daily challenges flip at 00:00 UTC for everyone in the world. */
export const EPOCH_DAY = Date.UTC(2026, 10, 1); // matches SQL: number = day - 2026-11-01 + 1

export function dayKey(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function dayNumber(key: string): number {
  return Math.round((Date.parse(key + 'T00:00:00Z') - EPOCH_DAY) / 86_400_000) + 1;
}
export function shiftDay(key: string, delta: number): string {
  return dayKey(Date.parse(key + 'T00:00:00Z') + delta * 86_400_000);
}
export function msUntilNextDay(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}
export function formatHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}
export function formatDayLabel(key: string): string {
  const d = new Date(key + 'T12:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function formatNumber(n: number): string {
  return n.toLocaleString(undefined);
}
