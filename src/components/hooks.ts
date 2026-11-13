import { useEffect, useState } from 'react';

/** Re-renders every `ms` and returns the current (server-corrected) time. */
export function useNow(ms = 1000, offset = 0): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const id = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(id);
  }, [ms, offset]);
  return now;
}
