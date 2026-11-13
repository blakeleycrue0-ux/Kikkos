import { AnimatePresence, MotionConfig, motion, type Variants } from 'motion/react';
import { AppProvider, useApp } from './app/store';
import type { Direction, Route } from './app/routes';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { lazy, Suspense, useEffect } from 'react';
import { Home } from './features/Home';
import { Onboarding } from './features/Onboarding';
import { Welcome } from './features/Welcome';

// Secondary screens are split out and prefetched while the browser is idle,
// so the first paint is fast and later transitions never wait on the network.
const loaders = {
  Arcade: () => import('./features/Arcade'),
  Auth: () => import('./features/Auth'),
  Friends: () => import('./features/Friends'),
  Group: () => import('./features/Group'),
  Join: () => import('./features/Join'),
  Play: () => import('./features/Play'),
  Prep: () => import('./features/Prep'),
  Profile: () => import('./features/Profile'),
  Results: () => import('./features/Results'),
  World: () => import('./features/World'),
};
const Arcade = lazy(() => loaders.Arcade().then((m) => ({ default: m.Arcade })));
const Auth = lazy(() => loaders.Auth().then((m) => ({ default: m.Auth })));
const Friends = lazy(() => loaders.Friends().then((m) => ({ default: m.Friends })));
const Group = lazy(() => loaders.Group().then((m) => ({ default: m.Group })));
const Join = lazy(() => loaders.Join().then((m) => ({ default: m.Join })));
const Play = lazy(() => loaders.Play().then((m) => ({ default: m.Play })));
const Prep = lazy(() => loaders.Prep().then((m) => ({ default: m.Prep })));
const Profile = lazy(() => loaders.Profile().then((m) => ({ default: m.Profile })));
const Results = lazy(() => loaders.Results().then((m) => ({ default: m.Results })));
const World = lazy(() => loaders.World().then((m) => ({ default: m.World })));

function usePrefetchScreens() {
  useEffect(() => {
    const run = () => Object.values(loaders).forEach((l) => { void l().catch(() => {}); });
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 1200);
  }, []);
}

const spring = { type: 'spring' as const, stiffness: 380, damping: 38, mass: 0.9 };

const variants: Variants = {
  initial: (d: Direction) =>
    d === 'push' ? { x: '100%', opacity: 1, scale: 1 } :
    d === 'pop' ? { x: '-28%', opacity: 0.6, scale: 1 } :
    d === 'up' ? { y: '8%', opacity: 0, scale: 0.98 } :
    { opacity: 0, scale: 0.985 },
  animate: { x: 0, y: 0, opacity: 1, scale: 1, transition: spring },
  exit: (d: Direction) =>
    d === 'push' ? { x: '-28%', opacity: 0.6, transition: spring } :
    d === 'pop' ? { x: '100%', opacity: 1, zIndex: 2, transition: spring } :
    d === 'up' ? { opacity: 0, transition: { duration: 0.18 } } :
    { opacity: 0, transition: { duration: 0.16 } },
};

function screenFor(r: Route) {
  switch (r.name) {
    case 'welcome': return <Welcome />;
    case 'onboarding': return <Onboarding />;
    case 'auth': return <Auth reason={r.reason} />;
    case 'tabs':
      return r.tab === 'home' ? <Home /> : r.tab === 'world' ? <World /> : r.tab === 'friends' ? <Friends /> : <Arcade />;
    case 'profile': return <Profile />;
    case 'prep': return <Prep />;
    case 'play': return <Play route={r} />;
    case 'results': return <Results route={r} />;
    case 'group': return <Group id={r.id} fresh={r.fresh} />;
    case 'join': return <Join code={r.code} />;
  }
}

function keyFor(r: Route, depth: number) {
  if (r.name === 'tabs') return `tab-${r.tab}`;
  if (r.name === 'play') return `play-${r.mode === 'daily' ? r.attempt.attemptId : r.seed}`;
  if (r.name === 'results') return `results-${depth}-${r.mode}-${r.mode === 'daily' ? String(!!r.result) : r.score}`;
  return `${r.name}-${depth}`;
}

function Shell() {
  const { route, direction, depth } = useApp();
  usePrefetchScreens();
  return (
    <div className="app-frame">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div key={keyFor(route, depth)} className="screen-host" custom={direction}
          variants={variants} initial="initial" animate="animate" exit="exit">
          <Suspense fallback={<div className="screen screen--loading" />}>{screenFor(route)}</Suspense>
        </motion.div>
      </AnimatePresence>
      {route.name === 'tabs' && <TabBar active={route.tab} />}
      <div id="overlay-root" className="overlay-root" />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppProvider><Shell /></AppProvider>
    </MotionConfig>
  );
}
