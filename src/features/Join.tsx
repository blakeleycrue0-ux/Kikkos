import { useApp } from '../app/store';
import { Icon } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { FriendsArt } from '../illustrations/Onboarding';
import { JoinGroup } from './Friends';
import { save } from '../lib/prefs';

export function Join({ code }: { code: string }) {
  const { session, go, toast, finishOnboarding } = useApp();
  const home = () => { finishOnboarding(); history.replaceState(null, '', '/'); go({ name: 'tabs', tab: 'home' }, { reset: true }); };
  return (
    <div className="screen join">
      <header className="bar"><span /><Press className="icon-btn" onClick={home} aria-label="Close"><Icon name="close" /></Press></header>
      <div className="scroll join__body">
        <div className="friends__art friends__art--sm"><FriendsArt token={40} /></div>
        {session?.profile ? (
          <JoinGroup initial={code} onDone={(g) => {
            finishOnboarding(); history.replaceState(null, '', '/'); toast(`Joined ${g.name}`, 'good');
            go({ name: 'tabs', tab: 'friends' }, { reset: true });
            go({ name: 'group', id: g.id });
          }} />
        ) : (
          <>
            <h1 className="display d-lg">You’re invited</h1>
            <p className="lead muted" style={{ margin: '10px 0 24px' }}>A friend wants you in their KIKKO group. Create a player to join with code <b>{code}</b>.</p>
            <Key tone="coral" block onClick={() => { finishOnboarding(); save('pending-join', code); go({ name: 'auth', reason: 'groups' }); }}>Create player</Key>
          </>
        )}
      </div>
    </div>
  );
}
