import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { backend, USERNAME_RE, type Group } from '../backend';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { Burst } from '../components/Motifs';
import { Sheet } from '../components/Sheet';
import { getHaptics, getSound, setHaptics, setSound } from '../lib/feedback';
import { formatDayLabel } from '../lib/time';
import { PENALTY_WRONG, POINTS_CORRECT, SPEED_BONUS_MAX, TIE_BREAK_DOC } from '@shared/oddspot.ts';
import { useStats } from './useStats';

export function Profile() {
  const { back, session, go, setTab, toast, refreshSession, refreshToday } = useApp();
  const stats = useStats();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [sound, setS] = useState(getSound());
  const [haptics, setH] = useState(getHaptics());
  const [editing, setEditing] = useState(false);
  const [rules, setRules] = useState(false);
  const p = session?.profile;

  useEffect(() => { if (p) backend.myGroups().then(setGroups).catch(() => setGroups(null)); }, [p]);

  return (
    <div className="screen profile">
      <header className="bar">
        <Press className="icon-btn" onClick={back} aria-label="Back"><Icon name="back" /></Press>
        <span className={`chip ${backend.mode === 'online' ? 'chip--lime' : 'chip--ink'}`}>{backend.mode === 'online' ? 'Online' : 'Demo mode'}</span>
      </header>
      <div className="scroll profile__body">
        <motion.div className="profile__id" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="profile__avatar">
            <motion.div className="profile__burst" animate={{ rotate: 360 }} transition={{ duration: 70, repeat: Infinity, ease: 'linear' }} aria-hidden="true">
              <Burst size={170} color="var(--cream-3)" points={11} />
            </motion.div>
            <Avatar name={p?.username ?? '?'} seed={p?.avatarSeed ?? 3} size={96} ring />
          </div>
          {p ? (
            <>
              <button className="profile__name" onClick={() => setEditing(true)}>
                <span className="display d-md">{p.username}</span><Icon name="edit" size={18} />
              </button>
              <p className="small muted">Playing since {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
            </>
          ) : (
            <>
              <h1 className="display d-md">Guest</h1>
              <p className="small muted" style={{ margin: '6px 0 16px' }}>Create a player to play ranked and keep stats.</p>
              <Key tone="coral" onClick={() => go({ name: 'auth', reason: 'signin' })}>Create player</Key>
            </>
          )}
        </motion.div>

        {p && (
          <>
            <div className="stats">
              <Stat icon="target" value={stats.played} label="Played" />
              <Stat icon="flame" value={stats.streak} label="Streak" accent />
              {backend.mode === 'online'
                ? <Stat icon="trophy" value={stats.bestRank ? `#${stats.bestRank}` : '—'} label="Best rank" />
                : <Stat icon="trophy" value={stats.bestScore || '—'} label="Best score" />}
            </div>

            <section className="profile__section">
              <h2 className="eyebrow muted">Recent</h2>
              {stats.history && stats.history.length ? (
                <ul className="recent">
                  {stats.history.slice(0, 5).map((h) => (
                    <li key={h.day}>
                      <span><b>#{h.number}</b> <span className="muted">{formatDayLabel(h.day)}</span></span>
                      <span className="num">{h.score.toLocaleString()}{h.rank ? <em className="muted"> · #{h.rank}</em> : null}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="small muted">No daily games yet.</p>}
            </section>

            <button className="profile__row" onClick={() => setTab('friends')}>
              <Icon name="users" /> <span>Groups</span><span className="muted">{groups ? groups.length : '·'}</span><Icon name="chevron" size={18} />
            </button>
          </>
        )}

        <section className="profile__section">
          <h2 className="eyebrow muted">Settings</h2>
          <Toggle icon={sound ? 'sound' : 'mute'} label="Sound effects" on={sound} onChange={(v) => { setSound(v); setS(v); }} />
          <Toggle icon="vibrate" label="Haptics" hint="Android only" on={haptics} onChange={(v) => { setHaptics(v); setH(v); }} />
          <button className="profile__row" onClick={() => setRules(true)}><Icon name="target" /> <span>How scoring works</span><Icon name="chevron" size={18} /></button>
          {p && (
            <button className="profile__row" onClick={async () => { await backend.signOut(); await refreshSession(); await refreshToday(); toast('Signed out'); setTab('home'); }}>
              <Icon name="logout" /> <span>{backend.mode === 'demo' ? 'Remove local player' : 'Sign out'}</span>
            </button>
          )}
          {backend.mode === 'demo' && (
            <button className="profile__row" onClick={async () => { await backend.resetDemo?.(); await refreshSession(); await refreshToday(); toast('Demo data cleared'); setTab('home'); }}>
              <Icon name="refresh" /> <span>Reset demo data</span>
            </button>
          )}
        </section>
        <p className="small muted profile__foot">KIKKO · {backend.mode === 'online' ? 'Scores verified by the server' : 'Demo: no server configured, nothing leaves this device'}</p>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} label="Edit name"><EditName onDone={() => setEditing(false)} /></Sheet>
      <Sheet open={rules} onClose={() => setRules(false)} label="Scoring">
        <h2 className="display d-md sheet__title">Scoring</h2>
        <ul className="rules">
          <li><b>+{POINTS_CORRECT}</b> for every odd symbol you find.</li>
          <li><b>+{SPEED_BONUS_MAX} max</b> speed bonus: full under 0.8 s, fading to zero at 3.8 s.</li>
          <li><b>−{PENALTY_WRONG}</b> for a wrong tap, plus a short freeze. Scores never go below zero.</li>
          <li>One official try per day. The day flips at 00:00 UTC for everyone.</li>
          <li>{TIE_BREAK_DOC}</li>
          <li>Ranks are provisional until the day closes.</li>
        </ul>
      </Sheet>
    </div>
  );
}

function Stat({ icon, value, label, accent }: { icon: IconName; value: number | string; label: string; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? 'stat--accent' : ''}`}>
      <Icon name={icon} size={18} stroke={2.6} />
      <span className="num stat__v">{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span className="small stat__l">{label}</span>
    </div>
  );
}

function Toggle({ icon, label, hint, on, onChange }: { icon: IconName; label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="profile__row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <Icon name={icon} /> <span>{label}{hint && <em className="muted"> · {hint}</em>}</span>
      <span className={`switch ${on ? 'is-on' : ''}`}><motion.span layout transition={{ type: 'spring', stiffness: 700, damping: 35 }} /></span>
    </button>
  );
}

function EditName({ onDone }: { onDone: () => void }) {
  const { session, refreshSession, toast } = useApp();
  const [name, setName] = useState(session?.profile?.username ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr('');
      try { await backend.setUsername(name.trim()); await refreshSession(); toast('Name updated', 'good'); onDone(); }
      catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      <h2 className="display d-md sheet__title">Player name</h2>
      <input className="field" value={name} maxLength={16} autoCapitalize="off" spellCheck={false} onChange={(e) => setName(e.target.value.replace(/\s/g, '_'))} autoFocus />
      <div className="field-error">{err || (name && !USERNAME_RE.test(name) ? '3–16 letters, numbers or _' : '')}</div>
      <Key tone="coral" block busy={busy} type="submit" disabled={!USERNAME_RE.test(name)}>Save</Key>
    </form>
  );
}
