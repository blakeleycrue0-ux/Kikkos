import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { fx } from '../lib/feedback';

type Tone = 'coral' | 'lime' | 'cream' | 'blue' | 'dark';

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  onBlue?: boolean;
  busy?: boolean;
  children: ReactNode;
}

const DEPTH = { sm: 4, md: 6, lg: 7 };

/** The KIKKO key: a tactile button whose face physically presses into its base. */
export function Key({ tone = 'coral', size = 'md', block, onBlue, busy, children, className = '', onClick, disabled, ...rest }: Props) {
  const depth = DEPTH[size];
  const cls = ['key', `key--${tone}`, size !== 'md' && `key--${size}`, block && 'key--block', onBlue && 'key--on-blue', busy && 'key--busy', className]
    .filter(Boolean).join(' ');
  return (
    <motion.button
      type="button"
      className={cls}
      style={{ ['--depth' as string]: `${depth}px` }}
      whileTap={disabled || busy ? undefined : 'down'}
      whileHover={disabled || busy ? undefined : 'hover'}
      initial="up"
      animate="up"
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={(e) => { if (busy) return; fx.press(); onClick?.(e); }}
      {...rest}
    >
      <motion.span
        className="key__face"
        variants={{ up: { y: 0 }, hover: { y: -1.5 }, down: { y: depth } }}
        transition={{ type: 'spring', stiffness: 900, damping: 32, mass: 0.6 }}
      >
        {busy ? <span className="spinner" aria-label="Loading" /> : children}
      </motion.span>
    </motion.button>
  );
}

/** Small press-scale wrapper for secondary controls. */
export function Press({ children, className, onClick, ...rest }: HTMLMotionProps<'button'>) {
  return (
    <motion.button
      type="button"
      className={className}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 800, damping: 30 }}
      onClick={(e) => { fx.tap(); onClick?.(e); }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
