import { AnimatePresence, m } from 'motion/react';
import { CHROME, useChrome } from '../components/chrome';
import { useState } from 'react';
import { useApp } from '../app/store';
import type { Route } from '../app/routes';
import { backend } from '../backend';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { NextGame } from '../components/NextGame';
import { Icon } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { Burst, ImpactDashes } from '../components/Motifs';
import { fx } from '../lib/feedback';
import { remove } from '../lib/prefs';
import { shareOrCopy } from '../lib/share';

type ResultsRoute = Extract<Route, { name: 'results' }>;

export function Results({ route }: { route: ResultsRoute }) {
  return route.mode === 'daily' ? <DailyResults route={route} /> : <PracticeResults route={route} />;
}

function DailyResults({ route }: { route: Extract<ResultsRoute, { mode: 'daily' }> }) {
  const { go, setTab, today, toast, refreshToday } = useApp();
  useChrome(CHROME.blue);
  const [counted, setCounted] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const r = route.result;

  const retry = async () => {
    if (!route.retry) return;
    setRetrying(true);
    try {
      const result = await backend.submitAttempt(route.retry.attemptId, route.retry.taps);
      remove('live-attempt');
      void refreshToday();
      go({ ...route, result, error: undefined, retry: undefined }, { replace: true, direction: 'fade' });
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setRetrying(false);
    }
  };

  const share = async () => {
    if (!r) return;
    const blocks = '🟩'.repeat(Math.min(r.correct, 10)) + (r.wrong ? '🟥'.repeat(Math.min(r.wrong, 5)) : '');
    const lines = [
      `KIKKO Daily #${route.number} · Odd Spot`,
      `${r.score.toLocaleString()} pts · ${r.correct} found`,
      blocks,
      r.rank ? `World #${r.rank} of ${r.total} (provisional)` : '',
    ].filter(Boolean);
    const res = await shareOrCopy({ title: 'KIKKO', text: lines.join('\n'), url: window.location.origin });
    if (res === 'copied') toast('Result copied', 'good');
    else if (res === 'failed') toast('Couldn’t share on this device', 'bad');
  };

  if (!r) {
    return (
      <div className="screen results on-dark">
        <header className="bar"><span /><Press className="icon-btn icon-btn--light" onClick={() => go({ name: 'tabs', tab: 'home' }, { reset: true })} aria-label="Close"><Icon name="close" /></Press></header>
        <div className="results__body results__body--center">
          <h1 className="display d-lg">Score not<br />saved yet</h1>
          <p className="lead" style={{ opacity: 0.85, marginTop: 12 }}>{route.error}</p>
          {route.retry && <Key tone="lime" onBlue size="lg" block busy={retrying} onClick={retry} style={{ marginTop: 28 }}><Icon name="refresh" size={20} /> Try again</Key>}
          <p className="small" style={{ opacity: 0.7, marginTop: 14 }}>Submissions are accepted for a few seconds after the game ends.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen results on-dark">
      <header className="bar">
        <span className="chip chip--light">Daily #{route.number}</span>
        <Press className="icon-btn icon-btn--light" onClick={() => go({ name: 'tabs', tab: 'home' }, { reset: true })} aria-label="Close"><Icon name="close" /></Press>
      </header>
      <div className="scroll results__body">
        <m.span className="eyebrow results__eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }}>Odd Spot · Final score</m.span>
        <div className="results__score-wrap">
          <m.div className="results__burst" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
            <Burst size={250} color="var(--blue-soft)" points={12} />
          </m.div>
          <AnimatedNumber className="num results__score" value={r.score} duration={0.85} delay={0.05}
            onDone={() => { if (!counted) { setCounted(true); fx.reveal(); } }} />
        </div>
        <m.div className="results__stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.2 }}>
          <span className="chip chip--light"><Icon name="check" size={16} stroke={3} /> {r.correct} found</span>
          <span className="chip chip--light"><Icon name="x" size={16} stroke={3} /> {r.wrong} {r.wrong === 1 ? 'miss' : 'misses'}</span>
        </m.div>

        <AnimatePresence>
          {counted && (
            <m.div className="rank-card" initial={{ y: 60, opacity: 0, scale: 0.94 }} animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
              {r.personalBest && r.score > 0 && (
                <m.span className="rank-card__pb" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: -6 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.25 }}>
                  <ImpactDashes size={26} a="var(--ink)" b="var(--ink)" /> Personal best
                </m.span>
              )}
              {r.verified && r.rank ? (
                <>
                  <span className="eyebrow muted">World rank</span>
                  <div className="rank-card__row">
                    <span className="num rank-card__rank">#<AnimatedNumber value={r.rank} duration={0.8} /></span>
                    <span className="rank-card__of">of {r.total?.toLocaleString()}<br /><span className="muted">players so far</span></span>
                  </div>
                  <p className="small muted rank-card__note">Provisional. Final at 00:00 UTC when today closes.</p>
                </>
              ) : (
                <>
                  <span className="eyebrow muted">Demo mode</span>
                  <p className="rank-card__demo">Saved on this device. World ranks appear once the server is connected.</p>
                </>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <m.footer className="results__foot" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.25 }}>
        <div className="results__actions">
          <Key tone="lime" onBlue size="lg" block onClick={() => setTab('world')}><Icon name="globe" size={21} /> Leaderboard</Key>
          <Press className="icon-btn icon-btn--light results__share" onClick={share} aria-label="Share result"><Icon name="share" /></Press>
        </div>
        <p className="small results__next">Next game in <NextGame offset={today?.serverOffsetMs ?? 0} /></p>
      </m.footer>
    </div>
  );
}

function PracticeResults({ route }: { route: Extract<ResultsRoute, { mode: 'practice' }> }) {
  const { go, setTab } = useApp();
  useChrome(CHROME.cream);
  const again = () => go({ name: 'play', mode: 'practice', seed: crypto.randomUUID?.() ?? String(Math.random()) }, { replace: true, direction: 'up' });
  return (
    <div className="screen results results--practice">
      <header className="bar">
        <span className="chip">Practice</span>
        <Press className="icon-btn" onClick={() => setTab('arcade')} aria-label="Close"><Icon name="close" /></Press>
      </header>
      <div className="scroll results__body">
        <span className="eyebrow results__eyebrow muted">Odd Spot · Practice</span>
        <div className="results__score-wrap">
          <AnimatedNumber className="num results__score" value={route.score} duration={1.1} />
        </div>
        <div className="results__stats">
          <span className="chip"><Icon name="check" size={16} stroke={3} /> {route.correct} found</span>
          <span className="chip"><Icon name="x" size={16} stroke={3} /> {route.wrong} {route.wrong === 1 ? 'miss' : 'misses'}</span>
        </div>
        <div className="rank-card rank-card--plain">
          {route.best ? (
            <m.span className="rank-card__pb" initial={{ scale: 0 }} animate={{ scale: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.6 }}>
              New practice best
            </m.span>
          ) : null}
          <span className="eyebrow muted">Practice best</span>
          <span className="num rank-card__rank">{Math.max(route.prevBest, route.score).toLocaleString()}</span>
          <p className="small muted rank-card__note">Practice is unranked and uses different puzzles from the daily game.</p>
        </div>
      </div>
      <footer className="results__foot">
        <Key tone="coral" size="lg" block onClick={again}><Icon name="refresh" size={21} /> Play again</Key>
      </footer>
    </div>
  );
}
