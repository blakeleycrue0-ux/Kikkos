import crypto from 'node:crypto';

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function uid(len = 10) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function makeKey() {
  // Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L): fácil de teclear en el móvil.
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += alpha[b[i] % alpha.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeKey(k) {
  return String(k ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function slug(s, max = 40) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'x';
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (isObj(v) && isObj(target[k])) deepMerge(target[k], v);
    else target[k] = isObj(v) ? deepMerge({}, v) : v;
  }
  return target;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function pad2(n) { return String(n).padStart(2, '0'); }

export function stamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}
