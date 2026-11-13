import { m } from 'motion/react';
import { CHROME, useChrome } from '../components/chrome';
import { useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { Burst } from '../components/Motifs';
import { Float } from '../illustrations/Float';
import { MiniGrid } from '../illustrations/MiniGrid';
import { load } from '../lib/prefs';

const LAB = [
  { name: 'Tally', blurb: 'Count fast, guess right', color: 'var(--blue)', art: (
    <svg viewBox="0 0 60 60" width="100%" height="100%">{[[18, 20], [38, 16], [28, 34], [44, 38], [16, 44]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5.5" fill="var(--cream)" />)}</svg>
  ) },
  { name: 'Trace', blurb: 'Remember the path', color: 'var(--coral)', art: (
    <svg viewBox="0 0 60 60" width="100%" height="100%"><path d="M12 46 24 22l12 16 12-24" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) },
  { name: 'Snap', blurb: 'Tap on the beat', color: 'var(--ink)', art: (
    <svg viewBox="0 0 60 60" width="100%" height="100%"><circle cx="30" cy="30" r="20" fill="none" stroke="rgba(255,248,233,.35)" strokeWidth="5" /><circle cx="30" cy="30" r="8" fill="var(--lime)" /></svg>
  ) },
];

export function Arcade() {
  const { go, back } = useApp();
  const best = load<number>('practice-best', 0);
  useChrome(CHROME.cream);
  const practice = () => go({ name: 'play', mode: 'practice', seed: crypto.randomUUID?.() ?? String(Math.random()) }, { direction: 'up' });
  return (
    <div className="screen arcade">
      <div className="scroll arcade__scroll">
        <header className="page-head">
          <div className="title-with-back">
            <Press className="icon-btn" onClick={back} aria-label="Back"><Icon name="back" /></Press>
            <h1 className="display d-lg">Arcade</h1>
          </div>
          <p className="small muted">Practice anytime. Unranked, and it never touches your daily shot.</p>
        </header>

        <m.section className="feature on-dark" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <div className="feature__burst" aria-hidden="true"><Burst size={200} color="var(--ink-3)" points={10} /></div>
          <div className="feature__art" aria-hidden="true">
            <Float dur={4.6} dy={4} rot={-6}>
              <div className="tile tile--cream feature__tile"><MiniGrid size={3} odd={1} glyph="half" gap={5} cell="var(--cream-2)" radius={8} oddColor="blue" /></div>
            </Float>
          </div>
          <span className="chip chip--lime">Playable</span>
          <h2 className="display d-lg feature__title">Odd Spot</h2>
          <p className="small feature__sub">Fresh random puzzles every round.</p>
          <div className="feature__foot">
            <div>
              <span className="eyebrow" style={{ opacity: 0.7 }}>Practice best</span>
              <span className="num feature__best">{best ? best.toLocaleString() : '—'}</span>
            </div>
            <Key tone="lime" onClick={practice}><Icon name="bolt" size={20} /> Practice</Key>
          </div>
        </m.section>

        <h3 className="eyebrow muted arcade__lab-title">In the lab</h3>
        <ul className="lab">
          {LAB.map((g, i) => (
            <m.li key={g.name} className="lab__card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: 0.06 + i * 0.03 }}>
              <span className="lab__art" style={{ background: g.color }}>{g.art}</span>
              <span className="lab__copy"><b>{g.name}</b><span className="small muted">{g.blurb}</span></span>
              <span className="chip chip--outline lab__soon"><Icon name="lock" size={13} stroke={2.6} /> Soon</span>
            </m.li>
          ))}
        </ul>
        <p className="small muted arcade__lab-note">New games join the daily rotation as they’re finished.</p>
      </div>
    </div>
  );
}
