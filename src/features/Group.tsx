import { m } from 'motion/react';
import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { backend, type Group as G, type GroupBoardRow } from '../backend';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { Sheet } from '../components/Sheet';
import { copyText, shareOrCopy } from '../lib/share';
import { dayKey, shiftDay } from '../lib/time';
import { BoardSkeleton, Empty, Segmented } from './World';

type Seg = 'today' | 'week' | 'season';

export function Group({ id, fresh }: { id: string; fresh?: boolean }) {
  const { back, today, toast } = useApp();
  const [group, setGroup] = useState<G | null>(null);
  const [rows, setRows] = useState<GroupBoardRow[] | null>(null);
  const [seg, setSeg] = useState<Seg>('today');
  const [invite, setInvite] = useState(!!fresh);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState(false);
  const day = today?.day ?? dayKey();

  useEffect(() => {
    backend.myGroups().then((gs) => setGroup(gs.find((g) => g.id === id) ?? null)).catch(() => setError(true));
  }, [id]);
  useEffect(() => {
    setRows(null);
    const from = seg === 'today' ? day : shiftDay(day, seg === 'week' ? -6 : -20);
    backend.groupBoard(id, from, day).then(setRows).catch(() => setError(true));
  }, [id, seg, day]);

  const link = group ? `${window.location.origin}/#/join/${group.code}` : '';
  const share = async () => {
    if (!group) return;
    const r = await shareOrCopy({ title: `Join ${group.name} on KIKKO`, text: `Join “${group.name}” on KIKKO. Code: ${group.code}`, url: link });
    if (r === 'copied') toast('Invite copied', 'good');
  };

  return (
    <div className="screen group">
      <header className="group__head">
        <div className="bar">
          <Press className="icon-btn" onClick={back} aria-label="Back"><Icon name="back" /></Press>
          <Press className="pill pill--sm group__invite-btn" onClick={() => setInvite(true)}><Icon name="plus" size={16} stroke={3} /> Invite</Press>
        </div>
        <h1 className="display d-lg group__name">{group?.name ?? ' '}</h1>
        <p className="small group__meta">{group ? `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'} · code ${group.code}` : ' '}</p>
        <Segmented value={seg} onChange={setSeg} options={[['today', 'Today'], ['week', '7 days'], ['season', 'Season']]} light />
      </header>
      <div className="scroll group__body">
        {seg === 'season' && <p className="small muted group__season">A season is the last 21 days. Total points decide the champion.</p>}
        {error ? <Empty title="Couldn’t load this group" text="It may have been deleted, or you’re offline." /> : !rows ? <BoardSkeleton /> : (
          <ol className="board">
            {rows.map((r, i) => (
              <m.li key={r.userId} className={`row ${r.isMe ? 'is-me' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: i * 0.02 }}>
                <span className={`num row__rank ${i === 0 && r.totalScore > 0 ? 'row__rank--lead' : ''}`}>{i + 1}</span>
                <Avatar name={r.username} seed={r.avatarSeed} size={34} />
                <span className="row__name">{r.username}{r.isMe && <em> · you</em>}
                  <span className="row__meta">{seg === 'today' ? (r.daysPlayed ? 'played' : 'not yet') : `${r.daysPlayed} ${r.daysPlayed === 1 ? 'day' : 'days'} · best ${r.best.toLocaleString()}`}</span>
                </span>
                <span className="num row__score">{r.totalScore.toLocaleString()}</span>
              </m.li>
            ))}
          </ol>
        )}
        {rows && rows.length === 1 && (
          <div className="group__solo">
            <p className="small muted">Just you so far. Send the code to your rivals.</p>
            <Key tone="coral" size="sm" onClick={() => setInvite(true)}>Invite friends</Key>
          </div>
        )}
        <button className="pill pill--ghost group__leave" onClick={() => setConfirmLeave(true)}><Icon name="logout" size={18} /> Leave group</button>
      </div>

      <Sheet open={invite} onClose={() => setInvite(false)} label="Invite friends">
        <h2 className="display d-md sheet__title">Invite rivals</h2>
        <p className="small muted">Share the link, or have them tap Join and enter the code.</p>
        <m.button className="invite-code" whileTap={{ scale: 0.97 }}
          onClick={async () => { if (group && (await copyText(group.code))) toast('Code copied', 'good'); }}>
          <span className="eyebrow muted">Invite code</span>
          <span className="num invite-code__value">{group?.code}</span>
          <span className="small muted"><Icon name="copy" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tap to copy</span>
        </m.button>
        {backend.mode === 'demo' && <p className="small muted" style={{ marginBottom: 12 }}><span className="demo-flag">Demo</span> Friends can join once the server is connected.</p>}
        <Key tone="blue" block onClick={share}><Icon name="share" size={20} /> Share invite</Key>
      </Sheet>
      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} label="Leave group">
        <h2 className="display d-md sheet__title">Leave {group?.name}?</h2>
        <p className="small muted" style={{ marginBottom: 18 }}>Your scores stay on the World board. You can rejoin with the code.</p>
        <Key tone="coral" block onClick={async () => {
          try { await backend.leaveGroup(id); toast('Left the group'); back(); } catch (e) { toast((e as Error).message, 'bad'); }
        }}>Leave group</Key>
        <button className="pill pill--ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setConfirmLeave(false)}>Stay</button>
      </Sheet>
    </div>
  );
}
