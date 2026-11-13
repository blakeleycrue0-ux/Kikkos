import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { backend, type Group } from '../backend';
import { Icon } from '../components/Icon';
import { Key } from "../components/Key";
import { Sheet } from '../components/Sheet';
import { FriendsArt } from '../illustrations/Onboarding';
import { load as loadPref, remove as removePref } from '../lib/prefs';
import { BoardSkeleton, Empty } from './World';

export function Friends() {
  const { session, go, toast } = useApp();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<'create' | 'join' | null>(null);
  const [pending, setPending] = useState('');
  useEffect(() => {
    const code = loadPref<string>('pending-join', '');
    if (code && session?.profile) { removePref('pending-join'); setPending(code); setSheet('join'); }
  }, [session?.profile]);

  const load = useCallback(() => {
    if (!session?.profile) return;
    setError(false);
    backend.myGroups().then(setGroups).catch(() => setError(true));
  }, [session?.profile]);
  useEffect(load, [load]);

  const signedIn = !!session?.profile;

  return (
    <div className="screen friends">
      <div className="scroll friends__scroll">
        <header className="page-head">
          <h1 className="display d-lg">Friends</h1>
          <p className="small muted">Optional. Your daily score counts in every group you join.</p>
        </header>

        {!signedIn ? (
          <div className="friends__intro">
            <div className="friends__art"><FriendsArt /></div>
            <h2 className="display d-md">Rivals welcome,<br />not required.</h2>
            <p className="small muted">The World board is always on. Groups add a private leaderboard for your people.</p>
            <Key tone="coral" block onClick={() => go({ name: 'auth', reason: 'groups' })}>Create a player</Key>
          </div>
        ) : error ? (
          <Empty title="Couldn’t load groups" text="Check your connection." action={<Key tone="blue" size="sm" onClick={load}>Retry</Key>} />
        ) : !groups ? (
          <BoardSkeleton />
        ) : (
          <>
            {groups.length === 0 ? (
              <div className="friends__intro friends__intro--compact">
                <div className="friends__art friends__art--sm"><FriendsArt token={40} /></div>
                <h2 className="display d-md">No groups yet</h2>
                <p className="small muted">That’s fine, World is always on. Start one when your friends want in.</p>
              </div>
            ) : (
              <ul className="groups">
                {groups.map((g, i) => (
                  <motion.li key={g.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <motion.button className="group-card" whileTap={{ scale: 0.98 }} onClick={() => go({ name: 'group', id: g.id })}>
                      <span className="group-card__badge" aria-hidden="true">{g.name.slice(0, 1).toUpperCase()}</span>
                      <span className="group-card__copy">
                        <b>{g.name}</b>
                        <span className="small muted">{g.memberCount} {g.memberCount === 1 ? 'member' : 'members'} · {g.playedToday} played today</span>
                      </span>
                      <Icon name="chevron" size={20} />
                    </motion.button>
                  </motion.li>
                ))}
              </ul>
            )}
            <div className="friends__actions">
              <Key tone="coral" block onClick={() => setSheet('create')}><Icon name="plus" size={20} stroke={3} /> New group</Key>
              <button className="pill" onClick={() => setSheet('join')}><Icon name="link" size={18} /> Join with a code</button>
            </div>
          </>
        )}
      </div>

      <Sheet open={sheet === 'create'} onClose={() => setSheet(null)} label="Create group">
        <CreateGroup onDone={(g) => { setSheet(null); go({ name: 'group', id: g.id, fresh: true }); }} />
      </Sheet>
      <Sheet open={sheet === 'join'} onClose={() => setSheet(null)} label="Join group">
        <JoinGroup initial={pending} onDone={(g) => { setSheet(null); toast(`Joined ${g.name}`, 'good'); go({ name: 'group', id: g.id }); }} />
      </Sheet>
    </div>
  );
}

function CreateGroup({ onDone }: { onDone: (g: Group) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr('');
      try { onDone(await backend.createGroup(name)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      <h2 className="display d-md sheet__title">New group</h2>
      <p className="small muted" style={{ marginBottom: 16 }}>Give it a name. You’ll get an invite code next.</p>
      <input className="field" placeholder="e.g. Late Night Crew" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="field-error">{err}</div>
      <Key tone="coral" block busy={busy} type="submit" disabled={name.trim().length < 2}>Create</Key>
    </form>
  );
}

export function JoinGroup({ onDone, initial = '' }: { onDone: (g: Group) => void; initial?: string }) {
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr('');
      try { onDone(await backend.joinGroup(code)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      <h2 className="display d-md sheet__title">Join a group</h2>
      <p className="small muted" style={{ marginBottom: 16 }}>Enter the 6-character code a friend shared.</p>
      <input className="field field--code" placeholder="ABC123" maxLength={6} value={code} autoCapitalize="characters" autoComplete="off"
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoFocus />
      <div className="field-error">{err}</div>
      <Key tone="blue" block busy={busy} type="submit" disabled={code.length !== 6}>Join</Key>
    </form>
  );
}

