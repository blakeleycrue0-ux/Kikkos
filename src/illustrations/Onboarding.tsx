import { motion } from 'motion/react';
import { Avatar } from '../components/Avatar';
import { Burst } from '../components/Motifs';
import { Float } from './Float';
import { MiniGrid } from './MiniGrid';

const pop = (i: number) => ({
  initial: { opacity: 0, scale: 0.6, y: 30 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 320, damping: 22, delay: 0.08 + i * 0.07 },
});

/** Page 1: a loose mosaic of short-game cards, each drifting on its own. */
export function DiscoverArt() {
  return (
    <div className="ob-art ob-discover" aria-hidden="true">
      <motion.div className="ob-card ob-card--a" {...pop(0)}>
        <Float dur={4.2} dy={5} rot={-5}>
          <div className="tile tile--cream"><div style={{ padding: 14, width: '100%', height: '100%' }}>
            <MiniGrid size={3} odd={2} glyph="squircle" gap={6} cell="var(--cream-2)" radius={9} />
          </div></div>
        </Float>
      </motion.div>
      <motion.div className="ob-card ob-card--b" {...pop(1)}>
        <Float dur={4.8} dy={6} rot={6} delay={0.6}>
          <div className="tile tile--ink">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              {[38, 26, 14].map((r, i) => (
                <motion.circle key={r} cx="50" cy="50" r={r} fill="none" stroke={i === 2 ? 'var(--lime)' : 'rgba(255,248,233,.35)'} strokeWidth="6"
                  animate={{ scale: [1, 1.06, 1] }} style={{ originX: '50px', originY: '50px' }}
                  transition={{ duration: 2.4, delay: i * 0.25, repeat: Infinity }} />
              ))}
              <circle cx="50" cy="50" r="6" fill="var(--lime)" />
            </svg>
          </div>
        </Float>
      </motion.div>
      <motion.div className="ob-card ob-card--c" {...pop(2)}>
        <Float dur={5.2} dy={4} rot={4} delay={1.1}>
          <div className="tile tile--coral">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <motion.path d="M22 72 40 40 60 60 78 26" fill="none" stroke="var(--ink)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="1 1" pathLength={1} animate={{ pathLength: [0, 1, 1] }} transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.6, 1] }} />
              {[[22, 72], [40, 40], [60, 60], [78, 26]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="8" fill="var(--cream)" stroke="var(--ink)" strokeWidth="5" />)}
            </svg>
          </div>
        </Float>
      </motion.div>
      <motion.div className="ob-card ob-card--d" {...pop(3)}>
        <Float dur={3.8} dy={5} rot={-7} delay={0.3}>
          <div className="tile tile--blue">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              {[[30, 32], [62, 26], [46, 52], [74, 58], [28, 70], [58, 76]].map(([x, y], i) => (
                <motion.circle key={i} cx={x} cy={y} r="8" fill="var(--cream)"
                  animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 2.2, delay: i * 0.3, repeat: Infinity }} />
              ))}
            </svg>
          </div>
        </Float>
      </motion.div>
    </div>
  );
}

const ROWS = [
  { name: 'ilya', seed: 3, w: 0.92 },
  { name: 'aiko', seed: 8, w: 0.84 },
  { name: 'kofi', seed: 13, w: 0.76 },
];

/** Page 2: the world, with a ranking ladder you climb. */
export function WorldArt() {
  return (
    <div className="ob-art ob-world" aria-hidden="true">
      <motion.div className="globe" {...pop(0)}>
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs><clipPath id="g-clip"><circle cx="100" cy="100" r="92" /></clipPath></defs>
          <circle cx="100" cy="100" r="92" fill="var(--blue)" />
          <g clipPath="url(#g-clip)" fill="none" stroke="var(--blue-soft)" strokeWidth="3">
            {[0, 1, 2, 3].map((i) => (
              <motion.ellipse key={i} cx="100" cy="100" ry="92"
                animate={{ rx: [92, 0, 92] }} transition={{ duration: 9, delay: -i * 2.25, repeat: Infinity, ease: 'linear' }} />
            ))}
            {[-54, -18, 18, 54].map((y) => <line key={y} x1="0" x2="200" y1={100 + y} y2={100 + y} />)}
          </g>
          <circle cx="100" cy="100" r="92" fill="none" stroke="var(--blue-ink)" strokeWidth="4" />
        </svg>
        <motion.div className="globe__burst" animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}>
          <Burst size={70} color="var(--lime)" points={9} />
        </motion.div>
      </motion.div>
      <div className="ladder">
        {ROWS.map((r, i) => (
          <motion.div key={r.name} className="ladder__row" {...pop(1 + i)}>
            <Float dur={4 + i * 0.5} dy={3} delay={i * 0.4} rotAmp={0}>
              <div className="ladder__pill">
                <span className="ladder__rank">{i + 1}</span>
                <Avatar name={r.name} seed={r.seed} size={26} />
                <span className="ladder__bar" style={{ width: `${r.w * 60}%` }} />
              </div>
            </Float>
          </motion.div>
        ))}
        <motion.div className="ladder__row ladder__row--you"
          initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: [60, 0, 0, 60] }}
          transition={{ opacity: { delay: 0.4 }, y: { duration: 5, times: [0, 0.3, 0.85, 1], repeat: Infinity, ease: 'easeInOut', delay: 0.4 } }}>
          <div className="ladder__pill ladder__pill--you">
            <span className="ladder__rank">YOU</span>
            <span className="ladder__bar" style={{ width: '58%' }} />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const FRIENDS = [
  { name: 'Mo', seed: 0, x: 14, y: 16 },
  { name: 'Jo', seed: 1, x: 80, y: 10 },
  { name: 'Sa', seed: 2, x: 86, y: 76 },
  { name: 'Lu', seed: 4, x: 10, y: 80 },
];

/** Page 3: rivals linked to a private group tile. */
export function FriendsArt({ token = 54 }: { token?: number }) {
  return (
    <div className="ob-art ob-friends" aria-hidden="true">
      <svg className="ob-friends__links" viewBox="0 0 100 100" preserveAspectRatio="none">
        {FRIENDS.map((f) => (
          <motion.line key={f.name} x1="50" y1="50" x2={f.x + 6} y2={f.y + 6} stroke="var(--ink)" strokeWidth="0.9"
            strokeDasharray="2.2 2.2" vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1, strokeDashoffset: [0, -8.8] }}
            transition={{ pathLength: { duration: 0.6, delay: 0.3 }, strokeDashoffset: { duration: 1.4, repeat: Infinity, ease: 'linear' } }} />
        ))}
      </svg>
      <motion.div className="group-tile" {...pop(0)}>
        <Float dur={4.4} dy={4} rot={-4}>
          <div className="tile tile--coral group-tile__inner">
            <span className="group-tile__label">PRIVATE</span>
            <span className="group-tile__code">K7Q2</span>
            <span className="group-tile__bars"><i /><i /><i /></span>
          </div>
        </Float>
      </motion.div>
      {FRIENDS.map((f, i) => (
        <motion.div key={f.name} className="friend-token" style={{ left: `${f.x}%`, top: `${f.y}%` }} {...pop(1 + i)}>
          <Float dur={3.6 + i * 0.4} dy={5} delay={i * 0.3} rotAmp={2}>
            <Avatar name={f.name} seed={f.seed} size={token} ring />
          </Float>
        </motion.div>
      ))}
    </div>
  );
}
