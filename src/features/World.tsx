import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { backend, type BoardRow, type HistoryItem, type WorldBoard } from '../backend';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Key } from '../components/Key';
import { Burst } from '../components/Motifs';
import { dayKey, formatDayLabel, shiftDay } from '../lib/time';
import { TIE_BREAK_DOC } from '@shared/oddspot.ts';
import { useStats } from './useStats';

type Seg = 'today' | 'yesterday' | 'mine';

export function World() {
  const { today, session, go } = useApp();
  const [seg, setSeg] = useState<Seg>('today');
  const [board, setBoard] = useState<WorldBoard | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nonce, setNonce] = useState(0);
  const stats = useStats();
  const day = today?.day ?? dayKey();
  const target = seg === 'yesterday' ? shiftDay(day, -1) : day;
  const needsAuth = backend.mode === 'online' && !session;

  useEffect(() => {
    if (seg === 'mine' || needsAuth) return;
    let live = true;
    setState('loading');
    backend.worldBoard(target).then((b) => { if (live) { setBoard(b); setState('ready'); } })
      .catch(() => live && setState('error'));
    return () => { live = false; };
  }, [target, seg, nonce, needsAuth, today?.attempt?.status]);

  return (
    <div className="screen world">
      <header className="world__head on-dark">
        <div className="world__burst" aria-hidden="true"><Burst size={220} color="var(--blue-soft)" points={11} /></div>
        <div className="world__title-row">
          <h1 className="display d-lg">World</h1>
          {seg !== 'mine' && board && state === 'ready' && (
            <span className={`chip ${board.final ? 'chip--cream' : 'chip--lime'}`}>
              {board.final ? 'Final' : <><span className="live-dot" /> Live · provisional</>}
            </span>
          )}
        </div>
        <p className="small world__sub">{seg === 'mine' ? 'Your daily results' : `${formatDayLabel(target)} · Daily #${(today?.number ?? 1) - (seg === 'yesterday' ? 1 : 0)}`}</p>
        <Segmented value={seg} onChange={setSeg} options={[['today', 'Today'], ['yesterday', 'Yesterday'], ['mine', 'Mine']]} />
      </header>

      <div className="scroll world__body">
        {seg === 'mine' ? (
          <History items={stats.history} />
        ) : needsAuth ? (
          <Empty title="Sign in to see the board" text="Create a player, play today’s game and see where you land." action={<Key tone="coral" onClick={() => go({ name: 'auth', reason: 'play' })}>Create player</Key>} />
        ) : state === 'loading' ? (
          <BoardSkeleton />
        ) : state === 'error' || !board ? (
          <Empty title="Couldn’t load the ranking" text="Check your connection and try again." action={<Key tone="blue" size="sm" onClick={() => setNonce((n) => n + 1)}><Icon name="refresh" size={18} /> Retry</Key>} />
        ) : board.top.length === 0 ? (
          <Empty title={seg === 'today' ? 'No scores yet today' : 'No scores that day'} text={seg === 'today' ? 'Be the first name on today’s board.' : 'Nobody played this one.'}
            action={seg === 'today' && !today?.attempt ? <Key tone="coral" onClick={() => go(session?.profile ? { name: 'prep' } : { name: 'auth', reason: 'play' })}>Play today</Key> : undefined} />
        ) : (
          <Board board={board} />
        )}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, light }: { value: T; onChange: (v: T) => void; options: [T, string][]; light?: boolean }) {
  return (
    <div className={`seg ${light ? 'seg--light' : ''}`} role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className="seg__item" onClick={() => onChange(v)}>
          {value === v && <motion.span layoutId={`seg-${options.map((o) => o[0]).join()}`} className="seg__thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function Board({ board }: { board: WorldBoard }) {
  const [first, second, third] = board.top;
  const rest = board.top.slice(3);
  const meVisible = board.me && board.top.some((r) => r.isMe);
  const around = board.me && !meVisible ? board.around : [];
  return (
    <>
      {board.sample && (
        <div className="sample-note">
          <span className="demo-flag">Example data</span>
          <p className="small">These players are samples so you can preview the ranking. Real rankings need the server.</p>
        </div>
      )}
      <p className="small muted board__count">{board.total.toLocaleString()} {board.total === 1 ? 'player' : 'players'}{board.final ? '' : ' so far'}</p>
      <div className="podium">
        {first && <TopCard row={first} place={1} />}
        <div className="podium__pair">
          {second && <TopCard row={second} place={2} />}
          {third && <TopCard row={third} place={3} />}
        </div>
      </div>
      <ol className="board">
        {rest.map((r, i) => <Row key={r.userId} row={r} i={i} />)}
      </ol>
      {around.length > 0 && (
        <>
          <div className="board__gap"><span /><span /><span /></div>
          <ol className="board">{around.map((r, i) => <Row key={r.userId} row={r} i={i} />)}</ol>
        </>
      )}
      <p className="small muted board__rules">{TIE_BREAK_DOC}</p>
    </>
  );
}

function TopCard({ row, place }: { row: BoardRow; place: 1 | 2 | 3 }) {
  return (
    <motion.div className={`top top--${place} ${row.isMe ? 'is-me' : ''}`}
      initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay: place * 0.07 }}>
      <span className="num top__place">{place}</span>
      <Avatar name={row.username} seed={row.avatarSeed} size={place === 1 ? 52 : 40} />
      <div className="top__who">
        <span className="top__name">{row.username}{row.isMe && <em> · you</em>}</span>
        <span className="num top__score">{row.score.toLocaleString()}</span>
      </div>
      {row.sample && <span className="top__sample">Sample</span>}
    </motion.div>
  );
}

function Row({ row, i }: { row: BoardRow; i: number }) {
  return (
    <motion.li className={`row ${row.isMe ? 'is-me' : ''}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 + Math.min(i, 10) * 0.03 }}>
      <span className="num row__rank">{row.rank}</span>
      <Avatar name={row.username} seed={row.avatarSeed} size={34} />
      <span className="row__name">{row.username}{row.isMe && <em> · you</em>}{row.sample && <span className="row__sample">sample</span>}</span>
      <span className="num row__score">{row.score.toLocaleString()}</span>
    </motion.li>
  );
}

function History({ items }: { items: HistoryItem[] | null }) {
  const { go, session } = useApp();
  if (!items) return <BoardSkeleton />;
  if (!session?.profile || items.length === 0) {
    return <Empty title="No results yet" text="Your daily scores and ranks collect here." action={<Key tone="coral" onClick={() => go(session?.profile ? { name: 'prep' } : { name: 'auth', reason: 'play' })}>Play today</Key>} />;
  }
  return (
    <ol className="board">
      <AnimatePresence initial>
        {items.map((h, i) => (
          <motion.li key={h.day} className="row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <span className="num row__rank">#{h.number}</span>
            <span className="row__name">{formatDayLabel(h.day)}<span className="row__meta">{h.status === 'scored' ? `${h.correct} found · ${h.wrong} miss` : h.status === 'rejected' ? 'not verified' : 'unfinished'}</span></span>
            <span className="row__right">
              <span className="num row__score">{h.score.toLocaleString()}</span>
              {h.rank && <span className="small muted">#{h.rank} / {h.total}</span>}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="empty__mark" aria-hidden="true"><Burst size={64} color="var(--cream-3)" points={9} /></div>
      <h2 className="display d-sm">{title}</h2>
      <p className="small muted">{text}</p>
      {action && <div className="empty__action">{action}</div>}
    </motion.div>
  );
}

export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ height: 84, marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div className="skel" style={{ height: 72 }} /><div className="skel" style={{ height: 72 }} />
      </div>
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="skel" style={{ height: 52, marginBottom: 8, opacity: 1 - i * 0.13 }} />)}
    </div>
  );
}
