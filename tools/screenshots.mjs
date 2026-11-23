// Genera capturas de las pantallas de emisión con un partido de ejemplo (requiere Playwright).
//   node tools/screenshots.mjs [carpetaSalida]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { startServer } from '../server/index.js';
import { TestClient } from '../test/helpers.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const out = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(out, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffsp-shots-'));
const srv = await startServer({ port: 0, dataDir, quiet: true });
const base = `http://127.0.0.1:${srv.port}`;
const ctl = await new TestClient(base, { role: 'control', key: srv.app.settings.key }).connect();

// Escudos de ejemplo (SVG en color: con «escudos en blanco» se ven blancos).
const shield = (txt, c) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110"><path d="M50 4 92 18v34c0 24-18 38-42 46C26 90 8 76 8 52V18z" fill="${c}"/><path d="M50 14 82 25v27c0 18-13 29-32 36C31 81 18 70 18 52V25z" fill="#fff"/><text x="50" y="62" font-family="Arial" font-weight="700" font-size="30" text-anchor="middle" fill="${c}">${txt}</text></svg>`);
const key = srv.app.settings.key;
const upl = async (b) => (await (await fetch(`${base}/api/upload/logo?k=${key}`, { method: 'POST', body: b })).json()).url;
const clubLogo = process.env.NO_CLUB_LOGO ? null : await upl(shield('SP', '#6d4fd0'));
const rivalLogo = await upl(shield('CE', '#1b6e46'));
if (clubLogo) await ctl.cmd('settings.update', { patch: { club: { logo: clubLogo } } });

await ctl.cmd('match.create', { rival: { name: 'CE Esporles', short: 'ESP', color: '#FFFFFF' }, category: 'Cadete', durations: [40, 40], date: '2026-11-22', ffspSide: 'home' });
await ctl.cmd('match.update', { patch: { away: { logo: rivalLogo } } });
await ctl.cmd('clock.start1');
await ctl.cmd('clock.set', { ms: 63 * 60000 + 14000 });
await ctl.cmd('clock.halftime');
await ctl.cmd('clock.start2');
await ctl.cmd('clock.set', { ms: 63 * 60000 + 14000 });
const add = (a) => ctl.cmd('event.add', a, undefined).then(() => new Promise((r) => setTimeout(r, 1250)));
await add({ type: 'goal', team: 'home', player: 'Marta Ferrer', number: '9', matchMs: 6 * 60000 });
await add({ type: 'yellow', team: 'away', player: 'Laia', number: '4', matchMs: 11 * 60000 });
await add({ type: 'foul', team: 'away', matchMs: 15 * 60000 });
await add({ type: 'goal', team: 'away', player: 'Carla Ramis', number: '7', matchMs: 19 * 60000 });
await add({ type: 'sub', team: 'home', player: 'Aina', playerIn: 'Júlia', matchMs: 31 * 60000 });
await add({ type: 'goal', team: 'home', player: 'Paula Coll', number: '11', matchMs: 38 * 60000 });
await add({ type: 'play', matchMs: 44 * 60000, note: 'Parada espectacular de la portera tras un remate desde fuera del área' });
await add({ type: 'red', team: 'away', player: 'María del Carmen Fernández de la Vega', number: '14', note: 'Doble amarilla por protestar al árbitro', matchMs: 52 * 60000 });
await add({ type: 'foul', team: 'home', matchMs: 55 * 60000 });
await add({ type: 'yellow', team: 'home', player: 'Joana', matchMs: 58 * 60000 });
await add({ type: 'goal', team: 'home', matchMs: 60 * 60000 });
await add({ type: 'sub', team: 'away', player: 'Núria', playerIn: 'Berta', matchMs: 61 * 60000 });
await add({ type: 'goal', team: 'home', player: 'Sofía Martínez-Calafat', number: '10', matchMs: 63 * 60000 });
await new Promise((r) => setTimeout(r, 400));

const browser = await chromium.launch();
const shots = [
  ['studio-h', '/studio/h', 1920, 1080],
  ['studio-v', '/studio/v', 1080, 1920],
  ['overlay-h', '/overlay/h?guides=0', 1920, 1080],
  ['overlay-v', '/overlay/v?guides=1', 1080, 1920],
  ['studio-v-phone', '/studio/v', 390, 693],
  ['studio-h-small', '/studio/h', 640, 360],
  ['overlay-h-small', '/overlay/h', 1280, 720],
];
for (const [name, url, w, h] of shots) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(base + url);
  await page.waitForTimeout(900);
  if (name.startsWith('overlay')) {
    // fondo de comprobación para ver la transparencia: campo verde
    await page.addStyleTag({ content: 'html{background:linear-gradient(135deg,#2f6b3a,#3f8a4c 60%,#2f6b3a)!important}' });
  }
  if (name === 'overlay-h') {
    await ctl.cmd('event.add', { type: 'goal', team: 'home', player: 'Marta Ferrer', number: '9' }, undefined);
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
}
await browser.close();
ctl.close();
await srv.close();
console.log('capturas en', out);
