import { motion } from 'motion/react';
import type { GlyphId } from '@shared/oddspot.ts';
import { Glyph } from '../components/Glyph';

const BLUE = { hue: 221, sat: 91, light: 59 };
const CORAL = { hue: 16, sat: 100, light: 69 };

/** Small animated Odd Spot grid used in illustrations. The odd cell pulses and gets "tapped". */
export function MiniGrid({ size = 3, odd = 5, glyph = 'dot', oddGlyph, tap = true, gap = 6, cell = '#fffdf7', radius = 10, oddColor = 'coral' }:
  { size?: number; odd?: number; glyph?: GlyphId; oddGlyph?: GlyphId; tap?: boolean; gap?: number; cell?: string; radius?: number; oddColor?: 'coral' | 'blue' }) {
  const n = size * size;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap, width: '100%', height: '100%' }}>
      {Array.from({ length: n }, (_, i) => {
        const isOdd = i === odd;
        const look = { glyph: isOdd && oddGlyph ? oddGlyph : glyph, rot: 0, flip: false, scale: 1,
          ...(isOdd && !oddGlyph ? (oddColor === 'coral' ? CORAL : BLUE) : BLUE) };
        return (
          <motion.div key={i} style={{ background: cell, borderRadius: radius, display: 'grid', placeItems: 'center', position: 'relative', aspectRatio: '1' }}
            animate={isOdd && tap ? { scale: [1, 1, 0.88, 1.06, 1] } : undefined}
            transition={isOdd && tap ? { duration: 3.2, times: [0, 0.62, 0.7, 0.8, 0.9], repeat: Infinity, ease: 'easeOut' } : undefined}>
            <div style={{ width: '62%', height: '62%' }}><Glyph look={look} /></div>
            {isOdd && tap && (
              <motion.span aria-hidden style={{ position: 'absolute', inset: -3, borderRadius: radius + 3, border: '3px solid var(--lime)' }}
                animate={{ opacity: [0, 0, 1, 0], scale: [0.9, 0.9, 1.05, 1.35] }}
                transition={{ duration: 3.2, times: [0, 0.66, 0.74, 0.95], repeat: Infinity }} />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
