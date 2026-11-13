import { Burst, ImpactDashes } from '../components/Motifs';
import { Float, Spin, popIn } from './Float';
import { MiniGrid } from './MiniGrid';

/** First-launch hero: three game tiles fanned over a slow-turning impact burst. */
export function HeroStage() {
  return (
    <div className="hero-stage" aria-hidden="true">
      <div className="hero-stage__burst pop-in pop-in--soft">
        <Spin dur={90}><Burst size={300} color="var(--blue-soft)" points={11} /></Spin>
      </div>

      <div className={`hero-tile hero-tile--clock ${popIn(0, 0.04).className}`} style={popIn(0, 0.04).style}>
        <Float dur={4.6} dy={5} rot={-13} delay={0.4}>
          <div className="tile tile--coral">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(41,35,42,.2)" strokeWidth="10" />
              <circle className="clock-arc" cx="50" cy="50" r="31" fill="none" stroke="var(--ink)" strokeWidth="10" strokeLinecap="round"
                transform="rotate(-90 50 50)" strokeDasharray="194.8" />
              <text x="50" y="58" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="850" fontSize="24" fill="var(--ink)">30</text>
            </svg>
          </div>
        </Float>
      </div>

      <div className={`hero-tile hero-tile--rank ${popIn(1, 0.04).className}`} style={popIn(1, 0.04).style}>
        <Float dur={5} dy={6} rot={11} delay={0.9}>
          <div className="tile tile--ink">
            <div className="rank-bars">
              {[0.55, 1, 0.75].map((h, i) => (
                <span key={i} className="rank-bar" style={{ height: `${h * 82}%`, background: i === 1 ? 'var(--lime)' : 'var(--cream)', animationDuration: `${3.4 + i * 0.5}s` }} />
              ))}
            </div>
            <span className="rank-tag">#1</span>
          </div>
        </Float>
      </div>

      <div className={`hero-tile hero-tile--grid ${popIn(2, 0.04).className}`} style={popIn(2, 0.04).style}>
        <Float dur={4} dy={4} rot={-4}>
          <div className="tile tile--cream tile--grid">
            <MiniGrid size={3} odd={5} glyph="dot" gap={7} cell="var(--cream-2)" radius={12} />
          </div>
          <ImpactDashes size={58} className="hero-dashes" />
        </Float>
      </div>
    </div>
  );
}
