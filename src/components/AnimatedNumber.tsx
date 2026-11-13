import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** Counts up to `value` with an ease-out; calls onDone when finished. */
export function AnimatedNumber({ value, duration = 1.2, delay = 0, format = (n: number) => n.toLocaleString(), onDone, className }:
  { value: number; duration?: number; delay?: number; format?: (n: number) => string; onDone?: () => void; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (reduce) { setShown(value); done.current?.(); return; }
    const c = animate(from.current, value, {
      duration, delay, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => { from.current = value; done.current?.(); },
    });
    return () => c.stop();
  }, [value, duration, delay, reduce]);
  return <span className={className}>{format(shown)}</span>;
}
