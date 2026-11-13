import { useEffect, useState } from 'react';
import { backend, type HistoryItem } from '../backend';
import { useApp } from '../app/store';
import { dayKey, shiftDay } from '../lib/time';

export function computeStreak(history: HistoryItem[], today: string): number {
  const days = new Set(history.filter((h) => h.status === 'scored').map((h) => h.day));
  let d = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = shiftDay(d, -1); }
  return n;
}

/** Personal history + derived stats; refreshes when today's attempt changes. */
export function useStats() {
  const { session, today } = useApp();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${session?.profile?.id}-${today?.attempt?.status}-${today?.day}`;
  useEffect(() => {
    if (!session?.profile) { setHistory([]); return; }
    let live = true;
    backend.history().then((h) => live && (setHistory(h), setError(null))).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const scored = (history ?? []).filter((h) => h.status === 'scored');
  return {
    history,
    error,
    played: scored.length,
    streak: history ? computeStreak(history, today?.day ?? dayKey()) : 0,
    bestScore: scored.reduce((m, h) => Math.max(m, h.score), 0),
    bestRank: scored.reduce<number | null>((m, h) => (h.rank !== null && (m === null || h.rank < m) ? h.rank : m), null),
  };
}
