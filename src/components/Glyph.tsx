import { memo } from 'react';
import type { GlyphId, Look } from '@shared/oddspot.ts';
import { burstPath } from './Motifs';

const BURST = burstPath(50, 50, 33, 21, 8, 0);

function shape(g: GlyphId, c: string) {
  switch (g) {
    case 'dot': return <circle cx="50" cy="50" r="29" fill={c} />;
    case 'ring': return <circle cx="50" cy="50" r="24" fill="none" stroke={c} strokeWidth="12" />;
    case 'square': return <rect x="23" y="23" width="54" height="54" rx="5" fill={c} />;
    case 'squircle': return <rect x="22" y="22" width="56" height="56" rx="21" fill={c} />;
    case 'tri': return <path d="M50 22 79 73H21Z" fill={c} stroke={c} strokeWidth="7" strokeLinejoin="round" />;
    case 'chevron': return <path d="M24 38 50 64 76 38" fill="none" stroke={c} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />;
    case 'bolt': return <path d="M57 15 27 55h20l-6 30 32-42H52Z" fill={c} stroke={c} strokeWidth="4" strokeLinejoin="round" />;
    case 'burst': return <path d={BURST} fill={c} stroke={c} strokeWidth="3" strokeLinejoin="round" />;
    case 'plus': return <path d="M50 22v56M22 50h56" stroke={c} strokeWidth="15" strokeLinecap="round" />;
    case 'cross': return <path d="M30 30l40 40M70 30 30 70" stroke={c} strokeWidth="15" strokeLinecap="round" />;
    case 'half': return <path d="M19 60a31 31 0 0 1 62 0Z" fill={c} stroke={c} strokeWidth="4" strokeLinejoin="round" />;
    case 'drop': return <path d="M50 21h29v29a29 29 0 1 1-29-29Z" fill={c} />;
    case 'key': return <path d="M27 21h17v39h29v17H27Z" fill={c} stroke={c} strokeWidth="5" strokeLinejoin="round" />;
    case 'arc': return <path d="M68 30a27 27 0 1 0 0 40" fill="none" stroke={c} strokeWidth="13" strokeLinecap="round" />;
    case 'ticks': return <g stroke={c} strokeWidth="12" strokeLinecap="round"><path d="M40 20 28 80" /><path d="M66 46 60 80" /></g>;
    case 'pill': return <rect x="17" y="35" width="66" height="30" rx="15" fill={c} />;
  }
}

export const Glyph = memo(function Glyph({ look, size = '100%' }: { look: Look; size?: number | string }) {
  const color = `hsl(${look.hue} ${look.sat}% ${look.light}%)`;
  const t = `rotate(${look.rot} 50 50) translate(50 50) scale(${(look.flip ? -1 : 1) * look.scale} ${look.scale}) translate(-50 -50)`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <g transform={t}>{shape(look.glyph, color)}</g>
    </svg>
  );
});
