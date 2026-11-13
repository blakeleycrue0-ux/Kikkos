import type { GlyphId } from '@shared/oddspot.ts';
import { Glyph } from '../components/Glyph';

const BLUE = { hue: 221, sat: 91, light: 59 };
const CORAL = { hue: 16, sat: 100, light: 69 };

/** Small animated Odd Spot grid used in illustrations. The odd cell pulses and gets "tapped" (CSS only). */
export function MiniGrid({ size = 3, odd = 5, glyph = 'dot', oddGlyph, tap = true, gap = 6, cell = '#fffdf7', radius = 10, oddColor = 'coral' }:
  { size?: number; odd?: number; glyph?: GlyphId; oddGlyph?: GlyphId; tap?: boolean; gap?: number; cell?: string; radius?: number; oddColor?: 'coral' | 'blue' }) {
  const n = size * size;
  return (
    <div className="minigrid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gap }}>
      {Array.from({ length: n }, (_, i) => {
        const isOdd = i === odd;
        const look = { glyph: isOdd && oddGlyph ? oddGlyph : glyph, rot: 0, flip: false, scale: 1,
          ...(isOdd && !oddGlyph ? (oddColor === 'coral' ? CORAL : BLUE) : BLUE) };
        return (
          <div key={i} className={`minigrid__cell ${isOdd && tap ? 'is-tapped' : ''}`} style={{ background: cell, borderRadius: radius }}>
            <div className="minigrid__glyph"><Glyph look={look} /></div>
            {isOdd && tap && <span aria-hidden className="minigrid__ring" style={{ borderRadius: radius + 3 }} />}
          </div>
        );
      })}
    </div>
  );
}
