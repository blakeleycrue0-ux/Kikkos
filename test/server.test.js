import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { boot, TestClient, sleep, cid } from './helpers.js';

test('las pantallas solo leen; el control exige clave', async () => {
  const s = await boot();
  const view = await new TestClient(s.base).connect();
  const ack = await view.cmd('event.add', { type: 'goal', team: 'home' });
  assert.equal(ack.ok, false);
  assert.equal(ack.error.code, 'forbidden');

  const bad = await new TestClient(s.base, { role: 'control', key: 'AAAA-BBBB' }).connect();
  assert.equal(bad.authResult.ok, false);
  const ack2 = await bad.cmd('clock.start1');
  assert.equal(ack2.error.code, 'forbidden');

  const good = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  assert.equal(good.authResult.ok, true);
  assert.equal((await good.cmd('clock.start1')).ok, true);
  [view, bad, good].forEach((c) => c.close());
  await s.close();
});

test('el estado público y las vistas nunca contienen credenciales de OBS ni la clave', async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  await ctl.cmd('settings.update', { patch: { obs: { password: 'secreto-obs', enabled: false } } });
  const view = await new TestClient(s.base).connect();
  const publicJson = JSON.stringify(view.states) + JSON.stringify(view.hello) + (await (await fetch(`${s.base}/api/state`)).text());
  assert.ok(!publicJson.includes('secreto-obs'));
  assert.ok(!publicJson.includes(s.key));
  assert.equal(view.admin, null, 'las vistas no reciben datos de administración');
  await sleep(300);
  assert.equal(ctl.admin.settings.obs.password, '', 'ni siquiera el mando recibe la contraseña');
  assert.equal(ctl.admin.settings.obs.passwordSet, true);
  assert.equal((await fetch(`${s.base}/api/admin`)).status, 401);
  assert.equal((await fetch(`${s.base}/api/admin?k=${s.key}`)).status, 200);
  [view, ctl].forEach((c) => c.close());
  await s.close();
});

test('un gol del mando llega a la pantalla; deshacerlo corrige resultado e historial', async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  const view = await new TestClient(s.base).connect();
  await ctl.cmd('clock.start1');
  const r = await ctl.cmd('event.add', { type: 'goal', team: 'home' });
  assert.equal(r.ok, true);
  const st = await view.waitState((x) => x.match.score.home === 1);
  assert.equal(st.match.events.length, 1);
  assert.equal(st.match.events[0].type, 'goal');
  assert.match(st.match.events[0].minute, /^\d+'$/);
  await ctl.cmd('event.undo');
  const st2 = await view.waitState((x) => x.match.score.home === 0);
  assert.equal(st2.match.events.length, 0);
  [view, ctl].forEach((c) => c.close());
  await s.close();
});

test('reintentos con el mismo identificador no duplican el evento', async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  const id = cid();
  const a1 = await ctl.cmd('event.add', { type: 'goal', team: 'away' }, id);
  const a2 = await ctl.cmd('event.add', { type: 'goal', team: 'away' }, id);
  const ctl2 = await new TestClient(s.base, { role: 'control', key: s.key, clientId: 'otro' }).connect();
  const a3 = await ctl2.cmd('event.add', { type: 'goal', team: 'away' }, id); // reintento desde otra conexión
  assert.equal(a1.ok && a2.ok && a3.ok, true);
  assert.equal(a2.dedup, true);
  assert.equal(a3.dedup, true);
  assert.equal(a1.result.eventId, a2.result.eventId);
  assert.equal(ctl.state.match.score.away, 1);
  assert.equal(ctl.state.match.events.length, 1);
  // doble pulsación real (identificadores distintos) del mismo mando
  const [d1, d2] = await Promise.all([ctl.cmd('event.add', { type: 'foul', team: 'home' }), ctl.cmd('event.add', { type: 'foul', team: 'home' })]);
  assert.equal(d1.ok && d2.ok, true);
  assert.equal(ctl.state.match.events.filter((e) => e.type === 'foul').length, 1);
  [ctl, ctl2].forEach((c) => c.close());
  await s.close();
});

test('recargar, reconectar y reiniciar la app conserva partido y reloj', async () => {
  const s = await boot();
  let ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  await ctl.cmd('clock.start1');
  await ctl.cmd('clock.set', { ms: 600_000 });
  await ctl.cmd('event.add', { type: 'goal', team: 'home', player: 'Paula' });
  const before = ctl.state;
  ctl.close();
  await sleep(1200);

  // reconexión: mismo estado, reloj continúa (no se reinicia)
  ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  assert.equal(ctl.state.match.id, before.match.id);
  assert.equal(ctl.state.match.score.home, 1);
  const elapsed = ctl.state.match.clock.running
    ? ctl.state.match.clock.baseMs + (ctl.state.serverTime - ctl.state.match.clock.startedAt)
    : ctl.state.match.clock.baseMs;
  assert.ok(elapsed >= 601_000 && elapsed < 606_000, `reloj tras reconectar: ${elapsed}`);
  ctl.close();

  // reinicio completo del servidor con los mismos datos
  const dataDir = s.dataDir;
  const key = s.key;
  await s.close();
  await sleep(1000);
  const s2 = await boot({ dataDir });
  assert.equal(s2.key, key, 'la clave persiste');
  const v = await new TestClient(s2.base).connect();
  assert.equal(v.state.match.id, before.match.id);
  assert.equal(v.state.match.score.home, 1);
  assert.equal(v.state.match.events[0].player, 'Paula');
  const el2 = v.state.match.clock.baseMs + (v.state.serverTime - v.state.match.clock.startedAt);
  assert.ok(v.state.match.clock.running && el2 >= 602_000 && el2 < 612_000, `reloj tras reiniciar: ${el2}`);
  // un reintento con un identificador anterior al reinicio tampoco duplica
  v.close();
  await s2.close();
});

test('la deduplicación de comandos sobrevive al reinicio del servidor', async () => {
  const s = await boot();
  const id = cid();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  await ctl.cmd('event.add', { type: 'goal', team: 'home' }, id);
  ctl.close();
  const { dataDir } = s;
  await s.close();
  const s2 = await boot({ dataDir });
  const c2 = await new TestClient(s2.base, { role: 'control', key: s2.key }).connect();
  const a = await c2.cmd('event.add', { type: 'goal', team: 'home' }, id);
  assert.equal(a.dedup, true);
  assert.equal(c2.state.match.score.home, 1);
  c2.close();
  await s2.close();
});

test('las vistas reciben instantáneas recientes para aplicar el retraso tras recargar', async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  await ctl.cmd('settings.update', { patch: { display: { delays: { scoreMs: 8000, clockMs: 8000 } } } });
  await ctl.cmd('event.add', { type: 'goal', team: 'home' });
  const view = await new TestClient(s.base).connect();
  assert.ok(view.hello.snapshots.length >= 2);
  const last = view.hello.snapshots.at(-1);
  const prev = view.hello.snapshots.find((x) => x.match.score.home === 0);
  assert.equal(last.match.score.home, 1);
  assert.ok(prev, 'se conserva el marcador anterior para mostrarlo durante el retraso');
  assert.ok(view.hello.serverTime >= last.t);
  [view, ctl].forEach((c) => c.close());
  await s.close();
});

test('login por clave crea sesión (cookie) y limita los intentos fallidos', async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/api/login`, { method: 'POST', body: JSON.stringify({ key: s.key.toLowerCase().replace('-', ' ') }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${s.base}/api/admin`, { headers: { cookie } })).status, 200);
  const ws = new WebSocket(s.base.replace('http', 'ws') + '/ws?role=control', { headers: { cookie } });
  const hello = await new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));
  assert.equal(hello.role, 'control');
  ws.terminate();
  for (let i = 0; i < 8; i++) await fetch(`${s.base}/api/login`, { method: 'POST', body: JSON.stringify({ key: 'MALA-CLAV' }) });
  const blocked = await fetch(`${s.base}/api/login`, { method: 'POST', body: JSON.stringify({ key: s.key }) });
  assert.equal(blocked.status, 429);
  await s.close();
});

test('exportación CSV/JSON y subida de escudos (solo imágenes)', async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  await ctl.cmd('clock.start1');
  await ctl.cmd('event.add', { type: 'goal', team: 'home', player: 'Júlia "Ju"; 7' });
  const id = ctl.state.match.id;
  const csv = await (await fetch(`${s.base}/api/matches/${id}/export?format=csv&k=${s.key}`)).text();
  assert.match(csv, /hora_real_iso/);
  assert.match(csv, /"Júlia ""Ju""; 7"/);
  const json = await (await fetch(`${s.base}/api/matches/${id}/export?k=${s.key}`)).json();
  assert.equal(json.events.length, 1);
  assert.ok(json.events[0].realAt && json.events[0].matchMs !== undefined);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await fetch(`${s.base}/api/upload/logo?k=${s.key}`, { method: 'POST', body: png });
  const { url } = await up.json();
  assert.match(url, /^\/assets\/logos\/.+\.png$/);
  const served = await fetch(s.base + url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  const evil = await fetch(`${s.base}/api/upload/logo?k=${s.key}`, { method: 'POST', body: Buffer.from('<html><script>alert(1)</script>') });
  assert.equal(evil.status, 415);
  assert.equal((await fetch(`${s.base}/api/upload/logo`, { method: 'POST', body: png })).status, 401);
  assert.equal((await fetch(`${s.base}/..%2f..%2fpackage.json`)).status === 200, false);
  // el escudo se asigna al equipo y llega a las pantallas
  await ctl.cmd('match.update', { patch: { away: { logo: url } } });
  assert.equal(ctl.state.match.away.logo, url);
  const rejected = await ctl.cmd('match.update', { patch: { away: { logo: 'https://evil.example/x.png' } } });
  assert.equal(rejected.ok, true);
  assert.equal(ctl.state.match.away.logo, '', 'solo se admiten escudos subidos');
  ctl.close();
  await s.close();
});

test('partidos: crear, listar, consultar anteriores y partido de prueba identificado', async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  assert.equal(ctl.state.match.isTest, true, 'primer arranque: partido de prueba identificado');
  assert.match(ctl.state.match.name, /PRUEBA/);
  const first = ctl.state.match.id;
  const bad = await ctl.cmd('match.create', { rival: { name: '' } });
  assert.equal(bad.ok, false);
  const c = await ctl.cmd('match.create', { rival: { name: 'CE Esporles' }, durations: [25, 25], category: 'Alevín', date: '2026-11-22', ffspSide: 'away' });
  assert.equal(c.ok, true);
  assert.equal(ctl.state.match.away.short, 'FFSP');
  assert.equal(ctl.state.match.home.name, 'CE Esporles');
  assert.equal(ctl.state.match.home.short, 'CE');
  assert.equal(ctl.state.match.isTest, false);
  await sleep(200);
  assert.equal(ctl.admin.matches.length, 2);
  await ctl.cmd('match.select', { id: first });
  assert.equal(ctl.state.match.id, first);
  const files = fs.readdirSync(path.join(s.dataDir, 'matches'));
  assert.equal(files.length, 2);
  ctl.close();
  await s.close();
});
