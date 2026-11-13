import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { backend, USERNAME_RE } from '../backend';
import { Icon } from '../components/Icon';
import { Key, Press } from '../components/Key';
import { Logo } from '../components/Logo';
import { Burst } from '../components/Motifs';

type Step = 'choose' | 'code' | 'name';

const suggest = () => `player_${Math.floor(1000 + Math.random() * 9000)}`;

export function Auth({ reason }: { reason?: 'play' | 'groups' | 'signin' }) {
  const { go, back, depth, session, refreshSession, refreshToday, toast } = useApp();
  const demo = backend.mode === 'demo';
  const [step, setStep] = useState<Step>(() => (demo ? 'name' : session && !session.profile ? 'name' : 'choose'));
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState(suggest);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // returning from OAuth: signed in but no username yet
  useEffect(() => { if (!demo && session && !session.profile) setStep('name'); }, [session, demo]);

  const finish = async () => {
    await refreshSession();
    await refreshToday();
    if (reason === 'play') go({ name: 'prep' }, { replace: true });
    else if (reason === 'groups') go({ name: 'tabs', tab: 'friends' }, { reset: true });
    else go({ name: 'tabs', tab: 'home' }, { reset: true });
  };

  const run = async (fn: () => Promise<void>) => {
    setErr(''); setBusy(true);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const skip = () => (depth > 1 ? back() : go({ name: 'tabs', tab: 'home' }, { reset: true }));

  const title = reason === 'play' ? <>One step<br />before you play</> :
    reason === 'groups' ? <>Pick a name<br />for your rivals</> : <>Save your<br />scores</>;
  const sub = demo
    ? 'Ranked games need a player name. Online play isn’t switched on yet, so this demo keeps your player on this device.'
    : 'Ranked games need a player, so your one daily shot is really yours. Practice is always open.';

  return (
    <div className="screen auth">
      <header className="auth__top">
        <Press className="icon-btn" onClick={skip} aria-label="Close"><Icon name="close" /></Press>
        {demo && <span className="demo-flag">Demo mode</span>}
      </header>
      <div className="scroll auth__body">
        <m.div className="auth__mark" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 30 }}>
          <div className="auth__burst spin" style={{ animationDuration: '60s' }}>
            <Burst size={150} color="var(--lime)" points={10} />
          </div>
          <Logo variant="icon" width={92} />
        </m.div>
        <h1 className="display d-lg auth__title">{step === 'name' && !demo ? <>What should<br />we call you?</> : title}</h1>
        <p className="lead muted auth__sub">{step === 'name' && !demo ? 'This is how you show up on leaderboards.' : sub}</p>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'choose' && (
            <m.div key="choose" className="auth__form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {backend.quickPlay && (
                <>
                  <Key tone="coral" block busy={busy} onClick={() => run(async () => { await backend.signInQuick(); const s = await refreshSession(); if (s?.profile) await finish(); else setStep('name'); })}>
                    <Icon name="bolt" size={20} /> Play now
                  </Key>
                  <p className="small muted auth__quick-note">No email needed. Your player is saved on this device.</p>
                  {!backend.emailLogin && <div className="field-error">{err}</div>}
                </>
              )}
              {backend.quickPlay && (backend.emailLogin || backend.oauthProviders.length > 0) && <div className="auth__or"><span>or</span></div>}
              {backend.oauthProviders.includes('apple') && (
                <button className="oauth oauth--apple" disabled={busy} onClick={() => run(() => backend.signInWithOAuth('apple'))}>
                  <Icon name="apple" size={22} /> Continue with Apple
                </button>
              )}
              {backend.oauthProviders.includes('google') && (
                <button className="oauth oauth--google" disabled={busy} onClick={() => run(() => backend.signInWithOAuth('google'))}>
                  <Icon name="google" size={20} /> Continue with Google
                </button>
              )}
              {backend.oauthProviders.length > 0 && backend.emailLogin && <div className="auth__or"><span>or with email</span></div>}
              {backend.emailLogin && <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await backend.sendEmailCode(email.trim()); setStep('code'); toast('Code sent. Check your inbox.', 'good'); }); }}>
                <label className="sr-only" htmlFor="email">Email</label>
                <input id="email" className="field" type="email" inputMode="email" autoComplete="email" placeholder="you@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required />
                <div className="field-error">{err}</div>
                <Key tone="blue" block busy={busy} type="submit" disabled={!/^\S+@\S+\.\S+$/.test(email)}>
                  <Icon name="mail" size={20} /> Email me a code
                </Key>
              </form>}
            </m.div>
          )}
          {step === 'code' && (
            <m.form key="code" className="auth__form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              onSubmit={(e) => { e.preventDefault(); void run(async () => { await backend.verifyEmailCode(email.trim(), code.trim()); const s = await refreshSession(); if (s?.profile) await finish(); else setStep('name'); }); }}>
              <p className="small muted" style={{ textAlign: 'center', marginBottom: 10 }}>Enter the 6-digit code sent to <b>{email}</b></p>
              <input className="field field--code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              <div className="field-error">{err}</div>
              <Key tone="blue" block busy={busy} type="submit" disabled={code.length !== 6}>Verify</Key>
              <button type="button" className="pill pill--ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => { setStep('choose'); setCode(''); setErr(''); }}>
                Use a different email
              </button>
            </m.form>
          )}
          {step === 'name' && (
            <m.form key="name" className="auth__form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (demo) await backend.createDemoPlayer(name.trim()); else await backend.setUsername(name.trim());
                  await finish();
                });
              }}>
              <label className="sr-only" htmlFor="uname">Player name</label>
              <input id="uname" className="field" autoComplete="nickname" autoCapitalize="off" spellCheck={false} maxLength={16}
                value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '_'))} />
              <div className="field-error">{err || (name && !USERNAME_RE.test(name) ? '3–16 letters, numbers or _' : '')}</div>
              <Key tone="coral" block busy={busy} type="submit" disabled={!USERNAME_RE.test(name)}>
                {demo ? 'Create player' : 'That’s me'}
              </Key>
            </m.form>
          )}
        </AnimatePresence>

        <button className="pill pill--ghost auth__skip" onClick={skip}>
          {reason === 'play' ? 'Not now' : 'Not now, just explore'}
        </button>
      </div>
    </div>
  );
}
