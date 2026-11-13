import { motion } from 'motion/react';
import { useApp } from '../app/store';
import type { Tab } from '../app/routes';
import { fx } from '../lib/feedback';
import { Icon, type IconName } from './Icon';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Today', icon: 'bolt' },
  { id: 'world', label: 'World', icon: 'globe' },
  { id: 'friends', label: 'Friends', icon: 'users' },
  { id: 'arcade', label: 'Arcade', icon: 'arcade' },
];

export function TabBar({ active }: { active: Tab }) {
  const { setTab } = useApp();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <motion.button key={t.id} className="tabbar__item" aria-current={active === t.id ? 'page' : undefined}
          whileTap={{ scale: 0.92 }} onClick={() => { if (active !== t.id) fx.tap(); setTab(t.id); }}>
          {active === t.id && (
            <motion.span layoutId="tab-glow" className="tabbar__glow" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />
          )}
          <motion.span animate={active === t.id ? { y: [0, -3, 0] } : { y: 0 }} transition={{ duration: 0.32 }}>
            <Icon name={t.icon} size={22} />
          </motion.span>
          <span>{t.label}</span>
        </motion.button>
      ))}
    </nav>
  );
}
