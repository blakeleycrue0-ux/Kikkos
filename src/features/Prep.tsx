import { motion } from 'motion/react';
import { useState } from 'react';
import { useApp } from '../app/store';
import { backend, BackendError } from '../backend';
import { Icon, type IconName } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { Burst } from '../components/Motifs';
import { Float } from '../illustrations/Float';
import { MiniGrid } from '../illustrations/MiniGrid';
import { PENALTY_WRONG } from '@shared/oddspot.ts';
import { save } from '../lib/prefs';

const RULES: { icon: IconName; text: string }[] = [
  { icon: 'target', text: 'Tap the one symbol that’s different.' },
  { icon: 'bolt', text: 'Faster finds earn bonus points.' },
  { icon: 'x', text: `Wrong taps cost ${PENALTY_WRONG} and freeze you briefly.` },
];

const rise = (i: number) => ({
  initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 340, damping: 30, delay: 0.1 + i * 0.05 },
});

export function Prep() {
  const { go, back, today, refreshToday, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const played = !!today?.attempt;

  const start = async () => {
    setBusy(true); setError('');
    try {
      const attempt = await backend.startAttempt();
      save('live-attempt', { attempt, taps: [] });
      go({ name: 'play', mode: 'daily', attempt }, { replace: true, direction: 'up' });
    } catch (e) {
      const err = e as BackendError;
      if (err.code === 'already_played') { toast('You’ve already played today', 'bad'); await refreshToday(); back(); return; }
      if (err.code === 'auth') { go({ name: 'auth', reason: 'play' }, { replace: true }); return; }
      setError(err.message || 'Could not start. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen prep on-dark">
      <header className="bar">
        <Press className="icon-btn icon-btn--light" onClick={back} aria-label="Back"><Icon name="back" /></Press>
        <span className="chip chip--light">Daily #{today?.number ?? '·'}</span>
        <span style={{ width: 46 }} />
      </header>
      <div className="scroll prep__body">
        <motion.div className="prep__art" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 22 }} aria-hidden="true">
          <motion.div className="prep__burst" animate={{ rotate: -360 }} transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}>
            <Burst size={260} color="var(--blue-soft)" points={12} />
          </motion.div>
          <Float dur={4.4} dy={5} rot={-3}>
            <div className="tile tile--cream prep__tile">
              <MiniGrid size={4} odd={9} glyph="chevron" oddGlyph="tri" gap={6} cell="var(--cream-2)" radius={10} />
            </div>
          </Float>
        </motion.div>

        <motion.h1 className="display d-xl prep__title" {...rise(0)}>Odd Spot</motion.h1>
        <ul className="prep__rules">
          {RULES.map((r, i) => (
            <motion.li key={r.icon} {...rise(1 + i)}>
              <span className="prep__rule-icon"><Icon name={r.icon} size={18} stroke={2.6} /></span>{r.text}
            </motion.li>
          ))}
        </ul>
        <motion.div className="prep__facts" {...rise(4)}>
          <div><span className="num">30s</span><span className="small">Duration</span></div>
          <div><span className="num">1</span><span className="small">Official try</span></div>
          <div><span className="num">{backend.mode === 'online' ? 'World' : 'Local'}</span><span className="small">{backend.mode === 'online' ? 'Ranked' : 'Demo score'}</span></div>
        </motion.div>
      </div>
      <motion.footer className="prep__foot" {...rise(5)}>
        {error && <p className="prep__error" role="alert">{error}</p>}
        {played ? (
          <Key tone="cream" onBlue size="lg" block onClick={back}>Already played today</Key>
        ) : (
          <>
            <p className="small prep__note"><Icon name="lock" size={15} stroke={2.6} /> Your try is used when you press Ready.</p>
            <Key tone="lime" onBlue size="lg" block busy={busy} onClick={start}>I’m ready</Key>
          </>
        )}
      </motion.footer>
    </div>
  );
}
