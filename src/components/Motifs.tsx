/** KIKKO geometric motifs, derived from the logo: the impact burst, the impact dashes, the speed ticks. */
import type { CSSProperties } from 'react';

export function burstPath(cx: number, cy: number, rOuter: number, rInner: number, points = 9, jitter = 0.18): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const wobble = i % 2 === 0 ? 1 + ((i * 37) % 7) / 7 * jitter - jitter / 2 : 1;
    const r = (i % 2 === 0 ? rOuter : rInner) * wobble;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function Burst({ size = 120, color = 'var(--lime)', points = 9, style, className }:
  { size?: number; color?: string; points?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style} className={className} aria-hidden="true">
      <path d={burstPath(50, 50, 49, 33, points)} fill={color} strokeLinejoin="round" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

/** The two impact dashes (coral + lime) that fly off the logo's button. */
export function ImpactDashes({ size = 40, style, className, a = 'var(--coral)', b = 'var(--lime)' }:
  { size?: number; style?: CSSProperties; className?: string; a?: string; b?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={style} className={className} aria-hidden="true">
      <path d="M12 26 22 5" stroke={a} strokeWidth="6.5" strokeLinecap="round" />
      <path d="M22 33 35 20" stroke={b} strokeWidth="6.5" strokeLinecap="round" />
    </svg>
  );
}

/** Twin speed ticks. */
export function Ticks({ size = 26, color = 'currentColor', style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" style={style} aria-hidden="true">
      <path d="M9 6 5 20M17 6l-4 14" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
