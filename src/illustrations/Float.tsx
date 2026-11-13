import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';

/** Slow independent idle drift: 3–5 s cycles, 3–7 px. */
export function Float({ children, dy = 5, dur = 4, delay = 0, rot = 0, rotAmp = 0.8, style, className }:
  { children: ReactNode; dy?: number; dur?: number; delay?: number; rot?: number; rotAmp?: number; style?: CSSProperties; className?: string }) {
  return (
    <motion.div className={className} style={{ ...style, rotate: rot }}
      animate={{ y: [0, -dy, 0], rotate: [rot, rot + rotAmp, rot] }}
      transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}>
      {children}
    </motion.div>
  );
}
