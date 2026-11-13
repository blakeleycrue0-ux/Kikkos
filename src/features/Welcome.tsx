import { motion } from 'motion/react';
import { useApp } from '../app/store';
import { backend } from '../backend';
import { Key } from '../components/Key';
import { Logo } from '../components/Logo';
import { HeroStage } from '../illustrations/HeroStage';
import { fx } from '../lib/feedback';

export function Welcome() {
  const { go, finishOnboarding } = useApp();
  return (
    <div className="screen welcome on-dark">
      <motion.header className="welcome__top" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
        <Logo variant="reversed" width={156} />
      </motion.header>
      <div className="welcome__stage"><HeroStage /></div>
      <motion.section className="welcome__slab" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 28, delay: 0.35 }}>
        <h1 className="display d-xl">Play something new.<br /><span className="hl-blue">Every day.</span></h1>
        <p className="lead muted welcome__sub">One 30-second game. Same for everyone. See where you land.</p>
        <Key tone="coral" size="lg" block onClick={() => { fx.unlock(); go({ name: 'onboarding' }); }}>
          Let’s play
        </Key>
        {backend.mode === 'online' && (
          <button className="pill pill--ghost welcome__alt" onClick={() => { finishOnboarding(); go({ name: 'auth', reason: 'signin' }); }}>
            I already have an account
          </button>
        )}
      </motion.section>
    </div>
  );
}
