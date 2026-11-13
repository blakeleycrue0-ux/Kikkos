import type { CSSProperties, ReactNode } from 'react';

/**
 * Slow independent idle drift (3–5 s, 3–7 px). Pure CSS keyframes so it runs on
 * the compositor and never competes with taps for the main thread.
 */
export function Float({ children, dy = 5, dur = 4, delay = 0, rot = 0, rotAmp = 0.8, style, className = '' }:
  { children: ReactNode; dy?: number; dur?: number; delay?: number; rot?: number; rotAmp?: number; style?: CSSProperties; className?: string }) {
  return (
    <div className={`float ${className}`} style={{
      ...style,
      ['--dy' as string]: `${-dy}px`,
      ['--rot' as string]: `${rot}deg`,
      ['--rot2' as string]: `${rot + rotAmp}deg`,
      animationDuration: `${dur}s`,
      animationDelay: `${-delay}s`,
    }}>
      {children}
    </div>
  );
}

/** Slow continuous rotation (CSS). */
export function Spin({ children, dur = 60, reverse, className = '', style }:
  { children: ReactNode; dur?: number; reverse?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={`spin ${reverse ? 'spin--rev' : ''} ${className}`} style={{ ...style, animationDuration: `${dur}s` }}>{children}</div>
  );
}

/** One-shot pop-in entrance (CSS), staggered by `i`. */
export function popIn(i: number, base = 0.03, step = 0.05): { className: string; style: CSSProperties } {
  return { className: 'pop-in', style: { animationDelay: `${base + i * step}s` } };
}
