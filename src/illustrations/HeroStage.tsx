import { motion } from 'motion/react';
import { Burst, ImpactDashes } from '../components/Motifs';
import { Float } from './Float';
import { MiniGrid } from './MiniGrid';

const enter = (i: number) => ({
  initial: { opacity: 0, y: 60, scale: 0.8 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 22, delay: 0.15 + i * 0.09 },
});

/** First-launch hero: three game tiles fanned over a slow-turning impact burst. */
export function HeroStage() {
  return (
    <div className="hero-stage" aria-hidden="true">
      <motion.div className="hero-stage__burst" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.05 }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}>
          <Burst size={300} color="var(--blue-soft)" points={11} />
        </motion.div>
      </motion.div>

      {/* back-left: the clock tile */}
      <motion.div className="hero-tile hero-tile--clock" {...enter(0)}>
        <Float dur={4.6} dy={5} rot={-13} delay={0.4}>
          <div className="tile tile--coral">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(41,35,42,.2)" strokeWidth="10" />
              <motion.circle cx="50" cy="50" r="31" fill="none" stroke="var(--ink)" strokeWidth="10" strokeLinecap="round"
                transform="rotate(-90 50 50)" strokeDasharray="194.8"
                animate={{ strokeDashoffset: [0, 194.8] }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} />
              <text x="50" y="58" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="850" fontSize="24" fill="var(--ink)">30</text>
            </svg>
          </div>
        </Float>
      </motion.div>

      {/* back-right: the rank tile */}
      <motion.div className="hero-tile hero-tile--rank" {...enter(1)}>
        <Float dur={5} dy={6} rot={11} delay={0.9}>
          <div className="tile tile--ink">
            <div className="rank-bars">
              {[0.55, 1, 0.75].map((h, i) => (
                <motion.span key={i} style={{ background: i === 1 ? 'var(--lime)' : 'var(--cream)' }}
                  animate={{ height: [`${h * 70}%`, `${h * 82}%`, `${h * 70}%`] }}
                  transition={{ duration: 3.4 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }} />
              ))}
            </div>
            <span className="rank-tag">#1</span>
          </div>
        </Float>
      </motion.div>

      {/* front: the game itself */}
      <motion.div className="hero-tile hero-tile--grid" {...enter(2)}>
        <Float dur={4} dy={4} rot={-4} delay={0}>
          <div className="tile tile--cream tile--grid">
            <MiniGrid size={3} odd={5} glyph="dot" gap={7} cell="var(--cream-2)" radius={12} />
          </div>
          <ImpactDashes size={58} className="hero-dashes" />
        </Float>
      </motion.div>
    </div>
  );
}
