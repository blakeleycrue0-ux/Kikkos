// Genera capturas de las pantallas de emisión con un partido y una plantilla de EJEMPLO (inventados).
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
const key = srv.app.settings.key;
const ctl = await new TestClient(base, { role: 'control', key }).connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const shield = (txt, c) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110"><path d="M50 4 92 18v34c0 24-18 38-42 46C26 90 8 76 8 52V18z" fill="${c}"/><path d="M50 14 82 25v27c0 18-13 29-32 36C31 81 18 70 18 52V25z" fill="#fff"/><text x="50" y="62" font-family="Arial" font-weight="700" font-size="30" text-anchor="middle" fill="${c}">${txt}</text></svg>`);
const logo = (txt, c) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 90"><rect width="300" height="90" fill="none"/><text x="150" y="58" font-family="Arial" font-weight="800" font-size="44" text-anchor="middle" fill="${c}">${txt}</text></svg>`);
const upl = async (b) => (await (await fetch(`${base}/api/upload/logo?k=${key}`, { method: 'POST', body: b })).json()).url;
await ctl.cmd('settings.update', { patch: { club: { logo: await upl(shield('SP', '#6d4fd0')), nextMatch: 'Sáb 29 nov · 12:00 · Campo municipal · vs CD Ejemplo' } } });
await ctl.cmd('roster.import', { text: `Titulares
1 PEREZ LOPEZ, ANA
3 DE LA FUENTE RUIZ, MARIA JOSE
5 KEMMINK, JULIE
6 SOLER NADAL, CARLA
7 VICH MARTI, SARA
9 FERRER COLL, MARTA
10 GARCIA VAN DIJK, LUCIA
11 RAMIS SERRA, CARLA
17 PONS VIDAL, NAYA
21 COLL NADAL, SANDRA
23 MARTI FERRER, ALEJANDRA
Suplentes
4 NOGUERA, ZENYA
14 SERRA PONS, RUTH
Entrenador: VIDAL COSTA, PAU
DEL. Equipo: SERRA PONS, JOANA` });
for (const [t, c] of [['MARCA', '#1b6e46'], ['BANCO', '#b4551d']]) await ctl.cmd('sponsor.add', { url: await upl(logo(t, c)) });
await ctl.cmd('settings.update', { patch: { display: { style: process.env.STYLE || 'pro' } } });
await ctl.cmd('settings.update', { patch: { strip: { enabled: true, messages: ['Sigue al club en @futbolfemeninosantaponsa', 'Comparte el directo'], seconds: 5 } } });
const rivalLogo = await upl(shield('CE', '#1b6e46'));
// Retratos de EJEMPLO (siluetas con degradado) para ver las fichas con foto
const portrait = (i) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${260 + i * 7} 55% 48%)"/><stop offset="1" stop-color="hsl(${280 + i * 5} 60% 22%)"/></linearGradient></defs><rect width="400" height="440" fill="url(#g)"/><circle cx="200" cy="170" r="78" fill="hsl(${20 + i * 9} 45% 62%)"/><path d="M70 440c0-110 60-170 130-170s130 60 130 170z" fill="hsl(${i * 40} 20% 92%)"/><path d="M120 150c0-60 40-95 85-95s75 30 75 85c-20-35-60-50-100-45-30 4-45 25-60 55z" fill="hsl(${i * 25} 40% 22%)"/></svg>`);
if (process.env.PHOTOS) {
  const cur = ctl.state.squad.roster;
  const withPhotos = [];
  for (let i = 0; i < cur.length; i++) withPhotos.push({ ...cur[i], photo: i === 3 ? '' : await upl(portrait(i)) });
  await ctl.cmd('roster.save', { roster: withPhotos });
}
const teamPhoto = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a62ec"/><stop offset="1" stop-color="#3a1a8a"/></linearGradient></defs>${Array.from({ length: 14 }, (_, k) => `<g transform="translate(${110 + k * 100} ${300 + (k % 2) * 90})"><circle r="46" cy="0" fill="hsl(${20 + k * 11} 45% 62%)"/><rect x="-62" y="46" width="124" height="320" rx="50" fill="hsl(${270 + k * 3} 50% ${32 + (k % 3) * 6}%)"/></g>`).join('')}</svg>`);
// (la foto del equipo de ejemplo se sube más abajo, convertida a PNG)
const R = ctl.state.squad.roster;
const by = (n) => R.find((p) => p.number === n);

// --- Partido 1: en la previa con cuenta atrás
await ctl.cmd('match.create', { rival: { name: 'CE Esporles', short: 'ESP', color: '#FFFFFF' }, category: 'Cadete', durations: [40, 40], date: '2026-11-22' });
await ctl.cmd('match.update', { patch: { away: { logo: rivalLogo } } });
await ctl.cmd('clock.countdown', { minutes: 9.9 });
const prematchId = ctl.state.match.id;

const browser = await chromium.launch();
if (!process.env.NO_TEAMPHOTO) {
  const pg = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.setContent(`<body style="margin:0;background:transparent">${teamPhoto.toString()}</body>`);
  const png = await pg.screenshot({ type: 'png', omitBackground: true });
  await pg.close();
  await fetch(`${base}/api/upload/teamphoto?k=${key}`, { method: 'POST', body: png });
}
async function shot(name, url, w, h, pre) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(base + url);
  await page.waitForTimeout(1900);
  if (pre) await pre(page);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
}
await shot('prematch-v', '/studio/v', 1080, 1920);
await shot('lineup-v', '/studio/v?screen=lineup', 1080, 1920);
await shot('lineup-h', '/studio/h?screen=lineup', 1920, 1080);
await shot('prematch-h', '/studio/h', 1920, 1080);

// --- Partido real: primera parte, descanso con cuenta atrás, final
const add = (a) => ctl.cmd('event.add', a, undefined).then(() => wait(1250));
await ctl.cmd('clock.start1');
await ctl.cmd('clock.set', { ms: 38 * 60000 });
await add({ type: 'goal', team: 'home', player: by('9').name, number: '9', rosterId: by('9').id, matchMs: 6 * 60000 });
await add({ type: 'yellow', team: 'away', player: 'Laia', number: '4', matchMs: 11 * 60000 });
await add({ type: 'foul', team: 'away', matchMs: 15 * 60000 });
await add({ type: 'goal', team: 'away', player: 'Carla Ramis', number: '7', matchMs: 19 * 60000 });
await add({ type: 'sub', team: 'home', player: 'Aina', playerIn: 'Júlia', matchMs: 31 * 60000 });
await add({ type: 'foul', team: 'home', matchMs: 33 * 60000 });
await add({ type: 'goal', team: 'home', player: by('10').name, number: '10', rosterId: by('10').id, matchMs: 37 * 60000 });
await ctl.cmd('clock.halftime');
await ctl.cmd('clock.countdown', { minutes: 4.2 });
await shot('halftime-v', '/studio/v', 1080, 1920);
await shot('halftime-h', '/studio/h', 1920, 1080);
await shot('sponsors-v', '/studio/v?screen=sponsors', 1080, 1920);
await ctl.cmd('clock.start2');
await ctl.cmd('clock.set', { ms: 63 * 60000 + 14000 });
await add({ type: 'red', team: 'away', player: 'María del Carmen Fernández de la Vega', number: '14', note: 'Doble amarilla por protestar al árbitro', matchMs: 52 * 60000 });
await add({ type: 'yellow', team: 'home', player: 'Joana', matchMs: 58 * 60000 });
await shot('live-v', '/studio/v', 1080, 1920);
await shot('live-h', '/studio/h', 1920, 1080);
await shot('stats-v', '/studio/v?screen=stats', 1080, 1920);
await shot('live-phone', '/studio/v', 390, 693);
// Gol con jugadora: el aviso espera al nombre y luego anima
for (const [nm, url, w, h] of [['goal-v', '/studio/v', 1080, 1920], ['goal-h', '/studio/h', 1920, 1080]]) {
  await shot(nm, url, w, h, async () => {
    const g = await ctl.cmd('event.add', { type: 'goal', team: 'home', awaiting: true }, undefined);
    await wait(700);
    await ctl.cmd('event.update', { id: g.result.eventId, patch: { player: by('9').name, number: '9', rosterId: by('9').id } });
    await wait(1300);
  });
  await wait(6500);
  await ctl.cmd('event.undo');
  await wait(1300);
}
await ctl.cmd('clock.finish');
await ctl.cmd('match.update', { patch: { mvp: by('9').id } });
await shot('final-v', '/studio/v', 1080, 1920);
await shot('final-h', '/studio/h', 1920, 1080);
await shot('final-phone', '/studio/v', 390, 693);
await browser.close();
ctl.close();
await srv.close();
console.log('capturas en', out, prematchId);
