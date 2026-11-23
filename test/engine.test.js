import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../server/store.js';
import { createMatch, execMatchCommand, publicMatch, minuteLabel, clockMs, computeScore, CmdError } from '../server/engine.js';

const settings = DEFAULT_SETTINGS();
const T0 = 1_700_000_000_000;
const mk = (extra = {}) => createMatch({ rival: { name: 'Atlético Rival' }, durations: [30, 30], ...extra }, settings, T0);
const ex = (m, name, a, now, clientId = 'c1') => execMatchCommand(m, name, a, { now, clientId });

test('reloj: primera parte, descanso y segunda parte en el minuto configurado', () => {
  const m = mk();
  ex(m, 'clock.start1', {}, T0);
  assert.equal(clockMs(m.clock, T0 + 90_000), 90_000);
  ex(m, 'clock.halftime', {}, T0 + 31 * 60_000); // descanso con 1 min de añadido
  assert.equal(m.clock.phase, 'halftime');
  assert.equal(m.clock.running, false);
  assert.equal(clockMs(m.clock, T0 + 99 * 60_000), 31 * 60_000, 'el reloj no avanza en el descanso');
  ex(m, 'clock.start2', {}, T0 + 40 * 60_000);
  assert.equal(clockMs(m.clock, T0 + 40 * 60_000), 30 * 60_000, 'la 2ª parte arranca en el minuto 30 (duración configurada)');
  assert.equal(clockMs(m.clock, T0 + 40 * 60_000 + 5000), 30 * 60_000 + 5000);
  ex(m, 'clock.finish', {}, T0 + 70 * 60_000);
  assert.equal(m.clock.phase, 'finished');
});

test('reloj: duraciones distintas por categoría y segunda parte distinta', () => {
  const m = mk({ durations: [20, 25] });
  ex(m, 'clock.start1', {}, T0);
  ex(m, 'clock.halftime', {}, T0 + 20 * 60_000);
  ex(m, 'clock.start2', {}, T0 + 30 * 60_000);
  assert.equal(clockMs(m.clock, T0 + 30 * 60_000), 20 * 60_000);
  assert.equal(minuteLabel(m.durations, 2, 46 * 60_000 + 10_000), '45+2\'');
});

test('reloj: corregir, ajustar, pausar y reanudar', () => {
  const m = mk();
  ex(m, 'clock.start1', {}, T0);
  ex(m, 'clock.set', { ms: 10 * 60_000 }, T0 + 5000);
  assert.equal(clockMs(m.clock, T0 + 5000), 600_000);
  assert.equal(clockMs(m.clock, T0 + 15_000), 610_000);
  ex(m, 'clock.adjust', { deltaMs: -10_000 }, T0 + 15_000);
  assert.equal(clockMs(m.clock, T0 + 15_000), 600_000);
  ex(m, 'clock.pause', {}, T0 + 20_000);
  assert.equal(clockMs(m.clock, T0 + 99_000), 605_000);
  ex(m, 'clock.resume', {}, T0 + 100_000);
  assert.equal(clockMs(m.clock, T0 + 101_000), 606_000);
  ex(m, 'clock.extra', { period: 1, minutes: 3 }, T0);
  assert.equal(m.clock.extra[1], 3);
  assert.throws(() => ex(m, 'clock.set', { ms: -5 }, T0), CmdError);
});

test('transiciones de fase inválidas se rechazan y las repetidas son inocuas', () => {
  const m = mk();
  assert.throws(() => ex(m, 'clock.start2', {}, T0), /descanso/);
  assert.throws(() => ex(m, 'clock.halftime', {}, T0), /primera parte/);
  ex(m, 'clock.start1', {}, T0);
  const r = ex(m, 'clock.start1', {}, T0 + 1000);
  assert.equal(r.changed, false);
  assert.equal(m.clock.startedAt, T0, 'repetir no reinicia el reloj');
});

test('eventos: gol actualiza el marcador con minuto, varios en el mismo minuto', () => {
  const m = mk();
  ex(m, 'clock.start1', {}, T0);
  const t = T0 + 12 * 60_000 + 5000;
  ex(m, 'event.add', { type: 'goal', team: 'home' }, t, 'a');
  ex(m, 'event.add', { type: 'goal', team: 'away' }, t + 2000, 'b');
  ex(m, 'event.add', { type: 'yellow', team: 'away' }, t + 4000, 'c');
  const pm = publicMatch(m);
  assert.deepEqual(pm.score, { home: 1, away: 1 });
  assert.equal(pm.events.length, 3);
  assert.deepEqual([...new Set(pm.events.map((e) => e.minute))], ["13'"]);
  assert.ok(pm.events.every((e) => e.realAt >= t && e.id));
});

test('deshacer, anular, editar y eliminar mantienen coherentes marcador e historial', () => {
  const m = mk();
  ex(m, 'clock.start1', {}, T0);
  const g1 = ex(m, 'event.add', { type: 'goal', team: 'home' }, T0 + 60_000, 'a').result.eventId;
  const g2 = ex(m, 'event.add', { type: 'goal', team: 'home' }, T0 + 120_000, 'a').result.eventId;
  ex(m, 'event.add', { type: 'goal', team: 'away' }, T0 + 180_000, 'a');
  assert.deepEqual(computeScore(m.events), { home: 2, away: 1 });
  ex(m, 'event.undo', {}, T0 + 181_000);
  assert.deepEqual(computeScore(m.events), { home: 2, away: 0 });
  ex(m, 'event.update', { id: g2, patch: { voided: true } }, T0 + 200_000);
  assert.deepEqual(computeScore(m.events), { home: 1, away: 0 });
  assert.equal(m.events.length, 2, 'el gol anulado se conserva en la línea del tiempo');
  ex(m, 'event.update', { id: g2, patch: { voided: false, team: 'away', player: 'Marta', number: '9', minute: 20, note: 'de penalti' } }, T0 + 210_000);
  assert.deepEqual(computeScore(m.events), { home: 1, away: 1 });
  const e = m.events.find((x) => x.id === g2);
  assert.equal(e.player, 'Marta');
  assert.equal(publicMatch(m).events.find((x) => x.id === g2).minute, "20'");
  ex(m, 'event.delete', { id: g1 }, T0 + 220_000);
  assert.deepEqual(computeScore(m.events), { home: 0, away: 1 });
  assert.ok(m.audit.some((a) => a.cmd === 'event.delete' && a.data?.event?.id === g1), 'la auditoría conserva lo eliminado');
  assert.throws(() => ex(m, 'event.delete', { id: g1 }, T0), /ya no existe/);
});

test('doble pulsación del mismo mando no duplica; otro mando o más tarde sí', () => {
  const m = mk();
  ex(m, 'clock.start1', {}, T0);
  const r1 = ex(m, 'event.add', { type: 'goal', team: 'home' }, T0 + 5000, 'mov1');
  const r2 = ex(m, 'event.add', { type: 'goal', team: 'home' }, T0 + 5400, 'mov1');
  assert.equal(r2.result.deduped, true);
  assert.equal(r2.result.eventId, r1.result.eventId);
  assert.equal(m.events.length, 1);
  ex(m, 'event.add', { type: 'goal', team: 'home' }, T0 + 5400, 'mov2');
  assert.equal(m.events.length, 2);
  ex(m, 'event.add', { type: 'goal', team: 'home' }, T0 + 8000, 'mov1');
  assert.equal(m.events.length, 3);
});

test('validaciones: equipo obligatorio, tipo inválido, jugadora opcional después', () => {
  const m = mk();
  assert.throws(() => ex(m, 'event.add', { type: 'goal' }, T0), /equipo/);
  assert.throws(() => ex(m, 'event.add', { type: 'volea', team: 'home' }, T0), /Tipo/);
  const p = ex(m, 'event.add', { type: 'play' }, T0).result.eventId;
  assert.equal(m.events.find((e) => e.id === p).team, null, 'guardar jugada no necesita equipo');
  const g = ex(m, 'event.add', { type: 'goal', team: 'home' }, T0 + 5000, 'z').result.eventId;
  assert.equal(m.events.find((e) => e.id === g).player, '');
  ex(m, 'event.update', { id: g, patch: { player: 'Aina' } }, T0 + 60_000);
  assert.equal(m.events.find((e) => e.id === g).player, 'Aina');
});

test('minutos con tiempo añadido', () => {
  assert.equal(minuteLabel([45, 45], 1, 44 * 60_000 + 59_000), "45'");
  assert.equal(minuteLabel([45, 45], 1, 45 * 60_000), "45+1'");
  assert.equal(minuteLabel([45, 45], 2, 90 * 60_000 + 1), "90+1'");
  assert.equal(minuteLabel([45, 45], 2, 50 * 60_000), "51'");
});

test('evento registrado sin conexión conserva su instante real y su minuto', () => {
  const m = mk();
  ex(m, 'clock.start1', {}, T0);
  const pressedAt = T0 + 10 * 60_000;
  const arrivedAt = pressedAt + 45_000; // llegó 45 s tarde
  const r = ex(m, 'event.add', { type: 'goal', team: 'home', at: pressedAt }, arrivedAt, 'mov');
  const e = m.events.find((x) => x.id === r.result.eventId);
  assert.equal(e.realAt, pressedAt);
  assert.equal(e.matchMs, 10 * 60_000);
  const far = ex(m, 'event.add', { type: 'foul', team: 'home', at: T0 - 99_999_999 }, arrivedAt, 'mov');
  assert.equal(m.events.find((x) => x.id === far.result.eventId).realAt, arrivedAt, 'una marca absurda se ignora');
});
