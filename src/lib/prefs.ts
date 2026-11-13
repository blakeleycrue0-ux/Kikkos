const PREFIX = 'kikko:';
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) */
  }
}
export function remove(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}
