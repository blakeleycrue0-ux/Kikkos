import { load, save } from './prefs';

let soundOn = load('sound', true);
let hapticsOn = load('haptics', true);
let ctx: AudioContext | null = null;

export const getSound = () => soundOn;
export const getHaptics = () => hapticsOn;
export function setSound(v: boolean) { soundOn = v; save('sound', v); }
export function setHaptics(v: boolean) { hapticsOn = v; save('haptics', v); }

function audio(): AudioContext | null {
  if (!soundOn) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.08, slideTo?: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function buzz(pattern: number | number[]) {
  if (!hapticsOn) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported (iOS Safari) */ }
}

export const fx = {
  tap() { tone(520, 0.05, 'triangle', 0.04); buzz(8); },
  press() { tone(300, 0.06, 'sine', 0.05, 220); buzz(10); },
  correct(streak = 0) { tone(660 + Math.min(streak, 8) * 40, 0.09, 'triangle', 0.07, 990 + Math.min(streak, 8) * 40); buzz(12); },
  wrong() { tone(180, 0.18, 'sawtooth', 0.045, 110); buzz([20, 40, 20]); },
  tick() { tone(880, 0.05, 'square', 0.025); },
  go() { tone(523, 0.08, 'triangle', 0.06); tone(784, 0.16, 'triangle', 0.06, undefined, 0.08); buzz(20); },
  end() { tone(784, 0.1, 'triangle', 0.06); tone(523, 0.22, 'triangle', 0.06, undefined, 0.1); buzz([30, 30, 30]); },
  reveal() { tone(440, 0.08, 'sine', 0.05); tone(660, 0.08, 'sine', 0.05, undefined, 0.07); tone(880, 0.18, 'sine', 0.05, undefined, 0.14); },
  unlock() { audio(); },
};
