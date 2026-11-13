import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../app/store';

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast toast--${t.tone}`} layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}>
            <span className="toast__dot" />{t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
