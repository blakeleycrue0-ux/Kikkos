import { AnimatePresence, m } from 'motion/react';
import { CHROME, useChrome } from '../components/chrome';
import { useState } from 'react';
import { useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { DiscoverArt, FriendsArt, WorldArt } from '../illustrations/Onboarding';

const PAGES = [
  {
    bg: 'var(--blue)', hex: CHROME.blue, dark: true, art: <DiscoverArt />,
    title: <>Short games.<br /><span className="hl-lime">New every day.</span></>,
    sub: 'A different 30-second challenge each day. Quick to learn, hard to master.',
  },
  {
    bg: 'var(--ink)', hex: CHROME.ink, dark: true, art: <WorldArt />,
    title: <>No squad<br /><span className="hl-lime">needed.</span></>,
    sub: 'Everyone in the world gets the same challenge. One shot. Climb the ranking solo.',
  },
  {
    bg: 'var(--cream)', hex: CHROME.cream, dark: false, art: <FriendsArt />,
    title: <>Bring your<br /><span className="hl-coral">rivals.</span></>,
    sub: 'Optional private groups. Your daily score counts there too.',
  },
];

export function Onboarding() {
  const { go, finishOnboarding } = useApp();
  const [[page, dir], setPage] = useState<[number, number]>([0, 1]);
  const p = PAGES[page];
  const last = page === PAGES.length - 1;
  useChrome(p.hex);

  const to = (n: number) => { if (n >= 0 && n < PAGES.length) setPage([n, n > page ? 1 : -1]); };
  const done = () => { finishOnboarding(); go({ name: 'auth' }, { reset: true }); };

  return (
    <m.div className={`screen onboarding ${p.dark ? 'on-dark' : ''} ${page === 1 ? 'on-ink' : ''}`} animate={{ backgroundColor: p.bg }}
      initial={{ backgroundColor: PAGES[0].bg }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <header className="ob-top">
        <AnimatePresence>
          {page > 0 && (
            <m.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <Press className={`icon-btn ${p.dark ? 'icon-btn--light' : ''}`} onClick={() => to(page - 1)} aria-label="Back">
                <Icon name="back" />
              </Press>
            </m.div>
          )}
        </AnimatePresence>
        <div className="ob-dots" role="tablist" aria-label="Onboarding progress">
          {PAGES.map((_, i) => (
            <button key={i} role="tab" aria-selected={i === page} aria-label={`Page ${i + 1}`} onClick={() => to(i)} className="ob-dot-hit">
              <m.span className="ob-dot" animate={{ width: i === page ? 26 : 8, opacity: i === page ? 1 : 0.4 }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }} />
            </button>
          ))}
        </div>
        {!last ? (
          <button className={`pill pill--sm ${p.dark ? 'pill--light' : ''}`} onClick={done}>Skip</button>
        ) : <span style={{ width: 46 }} />}
      </header>

      <m.div className="ob-stage" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18}
        onDragEnd={(_, i) => { if (i.offset.x < -60) to(page + 1); else if (i.offset.x > 60) to(page - 1); }}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <m.div key={page} className="ob-stage__inner" custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 90, opacity: 0, scale: 0.96 }),
              center: { x: 0, opacity: 1, scale: 1 },
              exit: (d: number) => ({ x: d * -90, opacity: 0, scale: 0.96 }),
            }}
            initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}>
            {p.art}
          </m.div>
        </AnimatePresence>
      </m.div>

      <footer className="ob-copy">
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={page} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
            <h2 className="display d-lg">{p.title}</h2>
            <p className="lead muted ob-sub">{p.sub}</p>
          </m.div>
        </AnimatePresence>
        <Key tone={last ? 'coral' : p.dark && page === 1 ? 'lime' : 'cream'} size="lg" block onBlue={page === 0}
          onClick={() => (last ? done() : to(page + 1))}>
          {last ? 'Start playing' : 'Next'} <Icon name="arrow" size={22} stroke={2.8} />
        </Key>
      </footer>
    </m.div>
  );
}
