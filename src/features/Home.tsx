import { m } from 'motion/react';
import { CHROME, useChrome } from '../components/chrome';
import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { backend, type BoardRow, type Group } from '../backend';
import { Avatar } from '../components/Avatar';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { useNow } from '../components/hooks';
import { Icon } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { Logo } from '../components/Logo';
import { Burst, Ticks } from '../components/Motifs';
import { Float } from '../illustrations/Float';
import { MiniGrid } from '../illustrations/MiniGrid';
import { COUNTDOWN_MS, DURATION_MS } from '@shared/oddspot.ts';
import { formatDayLabel } from '../lib/time';
import { NextGame } from '../components/NextGame';
import { useStats } from './useStats';

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.025 },
});

export function Home() {
  const { go, setTab, session, today, todayError, refreshToday } = useApp();
  const stats = useStats();
  useChrome(CHROME.cream);
  const now = useNow(15_000, today?.serverOffsetMs ?? 0);
  const [me, setMe] = useState<BoardRow | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);

  const attempt = today?.attempt ?? null;
  const expired = attempt?.status === 'started' && now > attempt.startedAt + COUNTDOWN_MS + DURATION_MS + 15_000;
  const done = attempt && (attempt.status !== 'started' || expired);
  const inProgress = attempt?.status === 'started' && !expired;

  useEffect(() => {
    if (!session?.profile || backend.mode === 'demo' || attempt?.status !== 'scored' || !today) { setMe(null); return; }
    backend.worldBoard(today.day).then((b) => setMe(b.me)).catch(() => setMe(null));
  }, [session?.profile, attempt?.status, today]);

  useEffect(() => {
    if (!session?.profile) { setGroups(null); return; }
    backend.myGroups().then(setGroups).catch(() => setGroups(null));
  }, [session?.profile]);

  const play = () => {
    if (!session?.profile) go({ name: 'auth', reason: 'play' });
    else go({ name: 'prep' });
  };

  return (
    <div className="screen home">
      <div className="scroll home__scroll">
        <m.header className="home__top" {...stagger(0)}>
          <Logo width={112} />
          <div className="home__top-right">
            {stats.streak > 0 && (
              <span className="chip chip--ink" title="Daily streak"><Icon name="flame" size={16} stroke={2.6} style={{ color: 'var(--coral)' }} />{stats.streak}</span>
            )}
            <Press className="home__me" onClick={() => go({ name: 'profile' })} aria-label="Your profile">
              {session?.profile
                ? <Avatar name={session.profile.username} seed={session.profile.avatarSeed} size={42} />
                : <span className="icon-btn"><Icon name="user" /></span>}
            </Press>
          </div>
        </m.header>

        {/* ─── Today ─── */}
        <m.section className="today on-dark" {...stagger(1)} aria-labelledby="today-title">
          <Ticks size={34} color="rgba(255,248,233,.18)" style={{ position: 'absolute', right: 18, bottom: 132 }} />
          <div className="today__row">
            <span className="chip chip--light">Daily #{today?.number ?? '·'}</span>
            <span className="small" style={{ opacity: 0.8 }}>{today ? formatDayLabel(today.day) : ''}</span>
          </div>
          <div className="today__body">
            <div className="today__copy">
              <span className="eyebrow" style={{ opacity: 0.75 }}>Today’s game</span>
              <h1 id="today-title" className="display today__title">Odd<br />Spot</h1>
              <p className="small today__meta">30 sec <span>·</span> 1 shot <span>·</span> Ranked</p>
            </div>
            <div className="today__art" aria-hidden="true">
              <div className="today__burst"><Burst size={150} color="var(--blue-soft)" points={10} /></div>
              <Float dur={4.2} dy={4} rot={7}>
                <div className="tile tile--cream today__tile"><MiniGrid size={3} odd={7} glyph="burst" gap={5} cell="var(--cream-2)" radius={8} /></div>
              </Float>
            </div>
          </div>

          {todayError ? (
            <div className="today__done">
              <p className="small">Couldn’t reach the server. {todayError}</p>
              <Key tone="cream" onBlue block onClick={() => void refreshToday()}><Icon name="refresh" size={20} /> Retry</Key>
            </div>
          ) : done ? (
            <div className="today__done">
              <div className="today__score">
                <div>
                  <span className="eyebrow" style={{ opacity: 0.75 }}>Your score</span>
                  <div className="num today__score-n">
                    {attempt.status === 'scored' ? <AnimatedNumber value={attempt.score} duration={0.9} /> : '0'}
                  </div>
                  {attempt.status !== 'scored' && <p className="small" style={{ opacity: 0.8 }}>{attempt.status === 'rejected' ? 'Attempt couldn’t be verified' : 'Attempt wasn’t finished'}</p>}
                </div>
                {me ? (
                  <button className="today__rank" onClick={() => setTab('world')}>
                    <span className="eyebrow">World</span>
                    <span className="num">#{me.rank}</span>
                    <span className="small">Provisional</span>
                  </button>
                ) : null}
              </div>
              <div className="today__next">
                <span className="small" style={{ opacity: 0.8 }}>Next game in</span>
                <NextGame offset={today?.serverOffsetMs ?? 0} className="num today__clock" />
              </div>
            </div>
          ) : (
            <div className="today__cta">
              <Key tone="lime" size="lg" block onBlue onClick={play}>
                <Icon name="bolt" size={22} /> {inProgress ? 'Resume' : 'Play'}
              </Key>
              {!session?.profile && <p className="small today__hint">Ranked play needs a player name. Takes 10 seconds.</p>}
            </div>
          )}
        </m.section>

        {/* ─── World & Friends ─── */}
        <div className="home__duo">
          <m.button className="duo duo--world on-dark" {...stagger(2)} whileTap={{ scale: 0.97 }} onClick={() => setTab('world')}>
            <span className="duo__label"><Icon name="globe" size={18} /> World</span>
            {backend.mode === 'demo' ? (
              <>
                <span className="num duo__big">{stats.bestScore ? stats.bestScore.toLocaleString() : '—'}</span>
                <span className="small duo__sub">{stats.bestScore ? 'Your best score' : 'Rankings need the server'}</span>
              </>
            ) : me ? (
              <>
                <span className="num duo__big">#{me.rank}</span>
                <span className="small duo__sub">Today, provisional</span>
              </>
            ) : (
              <>
                <span className="num duo__big">{stats.bestRank ? `#${stats.bestRank}` : '—'}</span>
                <span className="small duo__sub">{stats.bestRank ? 'Best rank' : 'Play to get ranked'}</span>
              </>
            )}
            <Icon name="chevron" size={18} className="duo__go" />
          </m.button>
          <m.button className="duo duo--friends" {...stagger(3)} whileTap={{ scale: 0.97 }} onClick={() => setTab('friends')}>
            <span className="duo__label"><Icon name="users" size={18} /> Friends</span>
            {groups && groups.length ? (
              <>
                <span className="num duo__big">{groups.length}</span>
                <span className="small duo__sub">{groups.length === 1 ? 'group' : 'groups'}</span>
              </>
            ) : (
              <>
                <span className="num duo__big duo__big--sm">Optional</span>
                <span className="small duo__sub">Start a private group</span>
              </>
            )}
            <Icon name="chevron" size={18} className="duo__go" />
          </m.button>
        </div>

        <m.button className="arcade-strip" {...stagger(4)} whileTap={{ scale: 0.98 }} onClick={() => setTab('arcade')}>
          <span className="arcade-strip__icon"><Icon name="arcade" size={24} /></span>
          <span className="arcade-strip__copy">
            <b>Arcade</b>
            <span className="small muted">Practice anytime. Doesn’t touch your daily shot.</span>
          </span>
          <Icon name="chevron" size={20} />
        </m.button>

        {backend.mode === 'demo' && (
          <m.p className="small muted home__demo" {...stagger(5)}>
            <span className="demo-flag">Demo mode</span> Online play isn’t switched on yet. Scores stay on this device and aren’t verified.
          </m.p>
        )}
      </div>
    </div>
  );
}
