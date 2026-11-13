import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/store';
import type { Route } from '../app/routes';
import { backend } from '../backend';
import { Glyph } from '../components/Glyph';
import { Icon } from '../components/Icon';
import { Press } from '../components/Key';
import { Burst } from '../components/Motifs';
import {
  COUNTDOWN_MS, DURATION_MS, LOCK_MS, createEngine, type Round, type Tap,
} from '@shared/oddspot.ts';
import { fx } from '../lib/feedback';
import { load, remove, save } from '../lib/prefs';

type PlayRoute = Extract<Route, { name: 'play' }>;
type Phase = 'countdown' | 'live' | 'over';
interface Pop { id: number; text: string; good: boolean }

const SWAP_MS = 100;

export function Play({ route }: { route: PlayRoute }) {
  const { go, back, today, refreshToday } = useApp();
  const daily = route.mode === 'daily';
  const seed = daily ? route.attempt.seed : route.seed;

  // ── clock: anchored to the server start time for official attempts ──
  const [startEpoch] = useState(() =>
    daily ? route.attempt.startedAt - route.attempt.serverOffsetMs + COUNTDOWN_MS : Date.now() + COUNTDOWN_MS);
  const perfStart = useRef(performance.now() + (startEpoch - Date.now()));

  // ── engine (re-hydrated from saved taps if the app was reloaded mid-game) ──
  const engine = useRef<ReturnType<typeof createEngine>>();
  const taps = useRef<Tap[]>([]);
  if (!engine.current) {
    engine.current = createEngine(seed);
    if (daily) {
      const saved = load<{ attempt: { attemptId: string }; taps: Tap[] } | null>('live-attempt', null);
      if (saved?.attempt.attemptId === route.attempt.attemptId) {
        for (const t of saved.taps) engine.current.tap(t.t, t.cell);
        taps.current = saved.taps.slice();
      }
    }
  }
  const eng = engine.current;

  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);
  const [secs, setSecs] = useState(30);
  const [shown, setShown] = useState<Round>(eng.state.round);
  const [score, setScore] = useState(eng.state.score);
  const [flash, setFlash] = useState<{ cell: number; kind: 'correct' | 'wrong'; round: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const [pops, setPops] = useState<Pop[]>([]);
  const barRef = useRef<HTMLDivElement>(null);
  const streak = useRef(0);
  const popId = useRef(0);
  const finished = useRef(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    const s = eng.state;
    // show the "Time!" stamp briefly while the server verifies in parallel (no artificial wait beyond that)
    const minShow = new Promise((r) => setTimeout(r, daily ? 600 : 700));
    if (!daily) {
      await minShow;
      const prevBest = load<number>('practice-best', 0);
      if (s.score > prevBest) save('practice-best', s.score);
      go({ name: 'results', mode: 'practice', score: s.score, correct: s.correct, wrong: s.wrong, best: s.score > prevBest && s.score > 0, prevBest }, { replace: true, direction: 'fade' });
      return;
    }
    const day = today?.day ?? '';
    const number = today?.number ?? 0;
    try {
      const [result] = await Promise.all([backend.submitAttempt(route.attempt.attemptId, taps.current), minShow]);
      remove('live-attempt');
      void refreshToday();
      go({ name: 'results', mode: 'daily', result, day, number }, { replace: true, direction: 'fade' });
    } catch (e) {
      await minShow;
      void refreshToday();
      go({ name: 'results', mode: 'daily', result: null, error: (e as Error).message, day, number,
        retry: { attemptId: route.attempt.attemptId, taps: taps.current } }, { replace: true, direction: 'fade' });
    }
  }, [daily, eng, go, refreshToday, route, today]);

  // ── main loop ──
  useEffect(() => {
    let raf = 0;
    let lastCount = -1;
    let lastSecs = -1;
    let ph: Phase = 'countdown';
    const loop = () => {
      const el = performance.now() - perfStart.current;
      if (el < 0) {
        const n = Math.ceil(-el / 1000);
        if (n !== lastCount) { lastCount = n; setCount(n); if (n <= 3) fx.tick(); }
      } else if (el < DURATION_MS) {
        if (ph !== 'live') { ph = 'live'; setPhase('live'); if (el < 500) fx.go(); }
        const left = Math.ceil((DURATION_MS - el) / 1000);
        if (left !== lastSecs) { lastSecs = left; setSecs(left); if (left <= 5) fx.tick(); }
        if (barRef.current) barRef.current.style.transform = `scaleX(${1 - el / DURATION_MS})`;
      } else {
        if (ph !== 'over') {
          ph = 'over'; setPhase('over'); setSecs(0);
          if (barRef.current) barRef.current.style.transform = 'scaleX(0)';
          fx.end();
          void finish();
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pop = (text: string, good: boolean) => {
    const id = ++popId.current;
    setPops((p) => [...p.slice(-3), { id, text, good }]);
    later(() => setPops((p) => p.filter((x) => x.id !== id)), 800);
  };

  const onTap = (cell: number) => {
    if (phase !== 'live') return;
    const t = Math.round(performance.now() - perfStart.current);
    const round = eng.state.roundIndex;
    const out = eng.tap(t, cell);
    if (out.kind === 'ignored') return;
    taps.current.push({ t, cell });
    if (daily) save('live-attempt', { attempt: route.attempt, taps: taps.current });
    setScore(eng.state.score);
    setFlash({ cell, kind: out.kind, round });
    if (out.kind === 'correct') {
      streak.current += 1;
      fx.correct(streak.current);
      pop(`+${out.points}`, true);
      const next = eng.state.round;
      later(() => { setShown(next); setFlash(null); }, SWAP_MS);
    } else {
      streak.current = 0;
      fx.wrong();
      pop(`−${out.penalty}`, false);
      setLocked(true);
      later(() => { setLocked(false); setFlash((f) => (f?.kind === 'wrong' ? null : f)); }, LOCK_MS);
    }
  };

  const n = shown.size * shown.size;
  const urgent = phase === 'live' && secs <= 5;

  return (
    <div className="screen play on-dark on-ink">
      <header className="play__hud">
        <div className="play__score">
          <span className="eyebrow">Score</span>
          <div className="play__score-row">
          <m.span key={score} className="num play__score-n" initial={{ scale: 1.18 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}>{score.toLocaleString()}</m.span>
          <div className="play__pops">
            <AnimatePresence>
              {pops.map((p) => (
                <m.span key={p.id} className={`play__pop ${p.good ? 'is-good' : 'is-bad'}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: -14 }} exit={{ opacity: 0, y: -26 }}
                  transition={{ duration: 0.35 }}>{p.text}</m.span>
              ))}
            </AnimatePresence>
          </div>
          </div>
        </div>
        <div className="play__round">
          <span className="eyebrow">Find</span>
          <span className="num">{shown.index + 1}</span>
        </div>
        <div className={`play__time ${urgent ? 'is-urgent' : ''}`}>
          <span className="eyebrow">Time</span>
          <span className="num">{phase === 'countdown' ? 30 : secs}</span>
        </div>
      </header>
      <div className="play__bar"><div ref={barRef} className={`play__bar-fill ${urgent ? 'is-urgent' : ''}`} /></div>

      <div className="play__arena">
        <m.div key={shown.index} className={`play__grid ${locked ? 'is-locked' : ''}`}
          style={{ gridTemplateColumns: `repeat(${shown.size}, 1fr)`, gap: shown.size >= 6 ? 6 : 8 }}
          initial="in" animate="on"
          variants={{ on: { transition: { staggerChildren: Math.min(0.006, 0.09 / n) } } }}>
          {Array.from({ length: n }, (_, i) => {
            const isOdd = i === shown.odd;
            const f = flash && flash.cell === i && flash.round === shown.index ? flash.kind : null;
            return (
              <m.button key={i} type="button" className={`cell ${f ? `is-${f}` : ''}`}
                aria-label={`Symbol ${i + 1}`}
                variants={{ in: { scale: 0.7, opacity: 0 }, on: { scale: 1, opacity: 1 } }}
                transition={{ type: 'spring', stiffness: 900, damping: 40 }}
                onPointerDown={(e) => { e.preventDefault(); onTap(i); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(i); } }}
                animate={f === 'wrong' ? { x: [0, -7, 7, -4, 4, 0], scale: 1, opacity: 1 } : f === 'correct' ? { scale: 1.1, opacity: 1 } : undefined}>
                <span className="cell__glyph"><Glyph look={isOdd ? shown.oddLook : shown.base} /></span>
              </m.button>
            );
          })}
        </m.div>
      </div>

        {!daily && (
          <Press className="icon-btn icon-btn--light play__quit" onClick={back} aria-label="Quit practice"><Icon name="close" /></Press>
        )}
      <AnimatePresence>
        {phase === 'countdown' && (
          <m.div className="play__overlay" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="play__count-burst spin" style={{ animationDuration: '12s' }}>
              <Burst size={240} color="var(--blue)" points={11} />
            </div>
            <AnimatePresence mode="popLayout">
              <m.span key={count} className="num play__count" initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }}>
                {count}
              </m.span>
            </AnimatePresence>
            <p className="eyebrow play__count-hint">{daily ? 'Official attempt' : 'Practice'} · find the odd one</p>
          </m.div>
        )}
        {phase === 'over' && (
          <m.div className="play__overlay play__overlay--over" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <m.span className="display play__stamp" initial={{ scale: 2.2, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -6, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16 }}>Time!</m.span>
            {daily && <p className="small play__sending"><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2.5 }} /> Verifying score</p>}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
