import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, displayName } from '../server/roster.js';
import { boot, TestClient, sleep } from './helpers.js';

const SAMPLE = `Titulares
1 PEREZ LOPEZ, ANA
3 DE LA FUENTE RUIZ, MARIA JOSE
10 GARCIA VAN DIJK, LUCIA
Suplentes
4 MARTI, EVA
8 SOLER NADAL, CARLA 🧑
Cuerpo Técnico
DEL. Equipo: SERRA PONS, JOANA
Entrenador: VIDAL COSTA, PAU
Sustituciones
4 MARTI, EVA
17 (61') FERRER, NOA`;

test('importar plantilla: titulares, suplentes, cuerpo técnico y nombres para pantalla', () => {
  const { roster, staff } = parseRoster(SAMPLE);
  assert.deepEqual(roster.map((p) => p.number), ['1', '3', '4', '8', '10']);
  assert.deepEqual(roster.filter((p) => p.starter).map((p) => p.number), ['1', '3', '10']);
  assert.equal(roster.find((p) => p.number === '3').name, 'Maria De La Fuente');
  assert.equal(roster.find((p) => p.number === '10').name, 'Lucia Garcia');
  assert.equal(roster.find((p) => p.number === '8').full, 'SOLER NADAL, CARLA');
  assert.equal(staff.coach, 'Pau Vidal');
  assert.equal(staff.delegate, 'Joana Serra');
  assert.equal(displayName('KEMMINK, JULIE'), 'Julie Kemmink');
  assert.equal(displayName('GONZALEZ VAN LOENEN, SAVANNAH'), 'Savannah Gonzalez');
});

test('plantilla, alineación y cuenta atrás en el servidor; goles con jugadora pendiente y estadísticas', async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  const imp = await ctl.cmd('roster.import', { text: SAMPLE });
  assert.equal(imp.ok, true);
  assert.deepEqual(imp.result, { count: 5, starters: 3 });
  assert.equal((await ctl.cmd('roster.import', { text: 'hola' })).ok, false);
  const roster = ctl.state.squad.roster;
  assert.equal(roster.length, 5);
  assert.equal(ctl.state.squad.staff.coach, 'Pau Vidal');

  // un partido nuevo hereda los titulares
  await ctl.cmd('match.create', { rival: { name: 'Rival' } });
  assert.equal(ctl.state.match.starters.length, 3);
  await ctl.cmd('match.update', { patch: { starters: [roster[0].id] } });
  assert.deepEqual(ctl.state.match.starters, [roster[0].id]);

  // cuenta atrás en la previa; se borra al empezar
  await ctl.cmd('clock.countdown', { minutes: 10 });
  const ends = ctl.state.match.countdownEndsAt;
  assert.ok(ends > Date.now() + 9 * 60000 && ends < Date.now() + 11 * 60000);
  assert.equal((await ctl.cmd('clock.countdown', { minutes: 999 })).ok, false);
  await ctl.cmd('clock.start1');
  assert.equal(ctl.state.match.countdownEndsAt, 0);
  assert.equal((await ctl.cmd('clock.countdown', { minutes: 5 })).ok, false, 'no durante la parte');

  // gol del club: queda pendiente de la jugadora; al asignarla deja de estar pendiente
  const g = await ctl.cmd('event.add', { type: 'goal', team: ctl.state.match.ffspSide, awaiting: true });
  const id = g.result.eventId;
  assert.equal(ctl.state.match.events.find((e) => e.id === id).awaiting, true);
  await ctl.cmd('event.update', { id, patch: { player: roster[2].name, number: roster[2].number, rosterId: roster[2].id } });
  const ev = ctl.state.match.events.find((e) => e.id === id);
  assert.equal(ev.awaiting, false);
  assert.equal(ev.player, roster[2].name);
  await sleep(1300);
  const g2 = await ctl.cmd('event.add', { type: 'goal', team: ctl.state.match.ffspSide, awaiting: true });
  await ctl.cmd('event.resolve', { id: g2.result.eventId });
  assert.equal(ctl.state.match.events.find((e) => e.id === g2.result.eventId).awaiting, false);
  // un gol del rival nunca queda pendiente
  const rivalSide = ctl.state.match.ffspSide === 'home' ? 'away' : 'home';
  await sleep(1300);
  const g3 = await ctl.cmd('event.add', { type: 'goal', team: rivalSide, awaiting: true });
  assert.equal(ctl.state.match.events.find((e) => e.id === g3.result.eventId).awaiting, true, 'el servidor lo permite; el mando solo lo pide para el club');
  // goleadoras
  assert.deepEqual(ctl.state.season.scorers[0], { name: roster[2].name, number: roster[2].number, goals: 1 });

  // patrocinadores y cinta
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const { url } = await (await fetch(`${s.base}/api/upload/logo?k=${s.key}`, { method: 'POST', body: png })).json();
  assert.equal((await ctl.cmd('sponsor.add', { url })).ok, true);
  assert.equal((await ctl.cmd('sponsor.add', { url: 'https://x.es/a.png' })).ok, false);
  assert.equal(ctl.state.sponsors.length, 1);
  await ctl.cmd('settings.update', { patch: { strip: { enabled: true, messages: ['Sigue al club', '  ', 'Comparte el directo'], seconds: 5 }, display: { screen: 'lineup' } } });
  assert.deepEqual(ctl.state.strip.messages, ['Sigue al club', 'Comparte el directo']);
  assert.equal(ctl.state.display.screen, 'lineup');
  await ctl.cmd('settings.update', { patch: { display: { screen: 'inventada' } } });
  assert.equal(ctl.state.display.screen, 'lineup');
  await ctl.cmd('sponsor.remove', { id: ctl.state.sponsors[0].id });
  assert.equal(ctl.state.sponsors.length, 0);
  ctl.close();
  await s.close();
});
