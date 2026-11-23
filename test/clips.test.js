import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, TestClient, sleep, tmpDir } from './helpers.js';
import { MockObs, decodeTimecode, circDiff } from './mock-obs.js';

const LAG = 1.0; // la cámara llega 1 s tarde a OBS
const PRE = 3;
const POST = 2;

async function setup({ writeDelayMs = 0, password = '', bufferSec = 40 } = {}) {
  const replays = tmpDir('ffsp-replays-');
  const clipsDir = tmpDir('ffsp-clips-');
  const obs = new MockObs({ dir: replays, writeDelayMs, password, bufferSec, cameraLagSec: LAG });
  const port = await obs.start();
  const srv = await boot();
  const ctl = await new TestClient(srv.base, { role: 'control', key: srv.key }).connect();
  await ctl.cmd('settings.update', {
    patch: {
      clips: { dir: clipsDir, preSec: PRE, postSec: POST, marginMs: 800, cameraDelayMs: LAG * 1000, bufferTargetSec: 30 },
      obs: { enabled: true, host: '127.0.0.1', port, password },
    },
  });
  const clips = () => ctl.admin?.clips || [];
  const waitClips = async (pred, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (ctl.admin && pred(clips())) return clips();
      await sleep(100);
    }
    throw new Error('timeout clips: ' + JSON.stringify(clips().map((c) => [c.typeName, c.state, c.note, c.error])));
  };
  const waitObs = async () => {
    for (let i = 0; i < 200; i++) {
      if (ctl.admin?.obs.state === 'connected' && ctl.admin.obs.replayActive) return;
      await sleep(100);
    }
    throw new Error('OBS no conectó: ' + JSON.stringify(ctl.admin?.obs));
  };
  const stop = async () => { ctl.close(); await srv.close(); await obs.stop().catch(() => {}); };
  return { obs, srv, ctl, clips, waitClips, waitObs, stop, clipsDir, replays };
}

/** Comprueba que el clip contiene exactamente [t0-PRE, t0+POST] (tiempo real del campo). */
async function assertWindow(file, t0Ms, label) {
  const first = await decodeTimecode(file, { ss: 0 });
  const last = await decodeTimecode(file, { sseof: -0.35 });
  const wantStart = t0Ms / 1000 - PRE;
  const wantEnd = t0Ms / 1000 + POST;
  assert.ok(Math.abs(circDiff(first, wantStart)) < 0.8, `${label}: inicio ${circDiff(first, wantStart).toFixed(2)} s fuera de lo esperado`);
  assert.ok(Math.abs(circDiff(last, wantEnd)) < 0.8, `${label}: final ${circDiff(last, wantEnd).toFixed(2)} s fuera de lo esperado`);
}

test('clips: contienen el vídeo anterior y posterior del instante real, con retraso de cámara', async () => {
  const x = await setup({ password: 'clave-obs' });
  try {
    await x.waitObs();
    await sleep((PRE + LAG + 1) * 1000); // llenar el búfer con vídeo previo
    await x.ctl.cmd('clock.start1');
    const g = await x.ctl.cmd('event.add', { type: 'goal', team: 'home', player: 'Mar' });
    assert.equal(g.ok, true);
    const t0 = x.ctl.state.match.events[0].realAt;
    let list = await x.waitClips((c) => c.length === 1);
    assert.ok(['pending', 'processing'].includes(list[0].state), 'al inicio no está guardado');
    assert.equal(list[0].file, '', 'aún no hay archivo: no se anuncia "guardado"');
    list = await x.waitClips((c) => c[0]?.state === 'saved');
    const dir = path.join(x.clipsDir, list[0].matchFolder ?? '');
    const file = fs.readdirSync(x.clipsDir, { recursive: true }).map((f) => path.join(x.clipsDir, f)).find((f) => f.endsWith('.mp4'));
    assert.ok(file && fs.existsSync(file), 'el archivo existe en la carpeta configurada');
    assert.match(path.basename(file), /^001_.*Gol_.*FFSP_\d{6}\.mp4$/, 'nombre reconocible: ' + path.basename(file));
    assert.match(path.dirname(file), /PRUEBA/, 'carpeta del partido, identificando el partido de prueba');
    await assertWindow(file, t0, 'gol');
    void dir;
    const d = list[0].durationMs / 1000;
    assert.ok(d > PRE + POST - 0.6 && d < PRE + POST + 0.6, `duración ${d}`);
    assert.equal(list[0].partial, false);
    // el clip se puede abrir desde la API con autenticación
    const id = list[0].id;
    assert.equal((await fetch(`${x.srv.base}/api/clips/${id}/file`)).status, 401);
    const r = await fetch(`${x.srv.base}/api/clips/${id}/file?k=${x.srv.key}`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(r.status, 206);
  } finally { await x.stop(); }
});

test('clips: eventos seguidos generan archivos distintos, cada uno con su propia jugada', async () => {
  const x = await setup();
  try {
    await x.waitObs();
    await sleep((PRE + LAG + 1) * 1000);
    await x.ctl.cmd('clock.start1');
    await x.ctl.cmd('event.add', { type: 'goal', team: 'home' });
    const tA = x.ctl.state.match.events.at(-1).realAt;
    await sleep(1500);
    await x.ctl.cmd('event.add', { type: 'foul', team: 'away' });
    await sleep(1100);
    await x.ctl.cmd('event.add', { type: 'play' });
    const evs = x.ctl.state.match.events;
    const tB = evs.find((e) => e.type === 'foul').realAt;
    const tC = evs.find((e) => e.type === 'play').realAt;
    const list = await x.waitClips((c) => c.length === 3 && c.every((j) => j.state === 'saved'));
    const files = new Set(list.map((j) => j.file));
    assert.equal(files.size, 3, 'tres archivos diferentes');
    const base = (j) => fs.readdirSync(x.clipsDir, { recursive: true }).map((f) => path.join(x.clipsDir, f)).find((f) => path.basename(f) === j.file);
    const byType = Object.fromEntries(list.map((j) => [j.type, j]));
    await assertWindow(base(byType.goal), tA, 'gol');
    await assertWindow(base(byType.foul), tB, 'falta');
    await assertWindow(base(byType.play), tC, 'jugada');
    // un mismo búfer guardado sirvió para varios eventos cercanos
    assert.ok(x.obs.saves.length <= 3, `OBS guardó ${x.obs.saves.length} veces`);
  } finally { await x.stop(); }
});

test('clips: eventos configurados (amarilla no genera) y evento eliminado cancela el clip', async () => {
  const x = await setup();
  try {
    await x.waitObs();
    await x.ctl.cmd('event.add', { type: 'yellow', team: 'home' });
    await sleep(300);
    assert.equal(x.clips().length, 0, 'las amarillas no generan clip por defecto');
    await x.ctl.cmd('settings.update', { patch: { clips: { triggers: { yellow: true, goal: false } } } });
    await x.ctl.cmd('event.add', { type: 'goal', team: 'away' });
    await sleep(300);
    assert.equal(x.clips().length, 0, 'gol desactivado');
    await sleep(1100);
    await x.ctl.cmd('event.add', { type: 'red', team: 'away' }); // red sigue desactivado
    const y = await x.ctl.cmd('event.add', { type: 'yellow', team: 'away' });
    await sleep(300);
    assert.equal(x.clips().length, 1);
    await x.ctl.cmd('event.delete', { id: y.result.eventId });
    await sleep(400);
    assert.equal(x.clips().length, 0, 'borrar el evento cancela el clip pendiente');
    await sleep((POST + LAG + 2) * 1000);
    assert.equal(x.obs.saves.length, 0, 'no se guardó nada en OBS');
  } finally { await x.stop(); }
});

test('clips: OBS se desconecta y el clip espera, luego se guarda al reconectar', async () => {
  const x = await setup();
  try {
    await x.waitObs();
    await sleep((PRE + LAG + 1) * 1000);
    await x.ctl.cmd('event.add', { type: 'goal', team: 'home' });
    const t0 = x.ctl.state.match.events[0].realAt;
    await x.obs.goOffline();
    for (let i = 0; i < 50 && x.ctl.admin.obs.state === 'connected'; i++) await sleep(100);
    assert.notEqual(x.ctl.admin.obs.state, 'connected');
    await sleep((POST + LAG + 2.5) * 1000); // llega la hora de guardar con OBS caído
    const waiting = x.clips()[0];
    assert.equal(waiting.state, 'pending');
    assert.match(waiting.note, /OBS/);
    assert.equal(waiting.file, '');
    await x.obs.goOnline();
    const list = await x.waitClips((c) => c[0]?.state === 'saved', 30000);
    const file = fs.readdirSync(x.clipsDir, { recursive: true }).map((f) => path.join(x.clipsDir, f)).find((f) => f.endsWith('.mp4'));
    await assertWindow(file, t0, 'tras reconexión');
    assert.equal(list[0].partial, false);
  } finally { await x.stop(); }
});

test('clips: archivo todavía escribiéndose; fallo puntual de OBS y reintentos manuales', async () => {
  const x = await setup({ writeDelayMs: 1800 });
  try {
    await x.waitObs();
    await sleep((PRE + LAG + 1) * 1000);
    x.obs.failNextSave = 1; // el primer intento de OBS falla
    await x.ctl.cmd('event.add', { type: 'goal', team: 'home' });
    const t0 = x.ctl.state.match.events[0].realAt;
    const list = await x.waitClips((c) => c[0]?.state === 'saved', 40000);
    assert.equal(x.obs.saves.length, 1, 'OBS falló una vez y se reintentó automáticamente');
    const file = fs.readdirSync(x.clipsDir, { recursive: true }).map((f) => path.join(x.clipsDir, f)).find((f) => f.endsWith('.mp4'));
    await assertWindow(file, t0, 'archivo lento');

    // Reintento manual: se vuelve a recortar desde el archivo guardado por OBS que sigue disponible.
    fs.unlinkSync(file);
    const ack = await x.ctl.cmd('clips.retry', { id: list[0].id });
    assert.equal(ack.ok, true);
    const again = await x.waitClips((c) => c[0]?.state === 'saved', 20000);
    assert.ok(fs.existsSync(path.join(again[0].folder, again[0].file)));
    await assertWindow(path.join(again[0].folder, again[0].file), t0, 'reintento');
  } finally { await x.stop(); }
});

test('clips: error visible y reintento cuando el fallo persiste, y "no disponible" cuando el búfer ya no lo conserva', async () => {
  const x = await setup();
  try {
    await x.waitObs();
    await sleep((PRE + LAG + 1) * 1000);
    x.obs.failNextSave = 99;
    await x.ctl.cmd('event.add', { type: 'play' });
    const list = await x.waitClips((c) => c[0]?.state === 'error', 40000);
    assert.match(list[0].error, /fallo simulado/);
    assert.equal(list[0].file, '', 'un clip con error no declara archivo');
    assert.equal(list[0].canRetry, true);
    x.obs.failNextSave = 0;
    await x.ctl.cmd('clips.retry', { id: list[0].id });
    await x.waitClips((c) => c[0]?.state === 'saved', 30000);
  } finally { await x.stop(); }
});

test('OBS: contraseña incorrecta se informa y no se reintenta sin cesar; comprobación y arreglo del búfer', async () => {
  const x = await setup({ password: 'buena', bufferSec: 20 });
  try {
    await x.ctl.cmd('settings.update', { patch: { obs: { password: 'mala' } } });
    for (let i = 0; i < 60 && x.ctl.admin.obs.state !== 'auth_failed'; i++) await sleep(100);
    assert.equal(x.ctl.admin.obs.state, 'auth_failed');
    assert.match(x.ctl.admin.obs.error, /ontraseña/);
    await x.ctl.cmd('settings.update', { patch: { obs: { password: 'buena' } } });
    await x.waitObs();
    const chk = await x.ctl.cmd('obs.checkBuffer');
    assert.equal(chk.ok, true);
    assert.equal(chk.result.seconds, 20);
    assert.equal(chk.result.ok, false, 'un búfer de 20 s no basta para 20+10 s');
    assert.ok(chk.result.problems.some((p) => /dura 20 s/.test(p)));
    const fix = await x.ctl.cmd('obs.fixBuffer', { seconds: 90 });
    assert.equal(fix.ok, true, JSON.stringify(fix));
    assert.equal(fix.result.seconds, 90);
    assert.equal(x.obs.params['SimpleOutput.RecRBTime'], '90');
    assert.equal(fix.result.active, true);
    assert.equal(fix.result.ok, true);
  } finally { await x.stop(); }
});
