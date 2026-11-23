// OBS simulado que habla el protocolo obs-websocket 5.x (incluida la autenticación SHA256).
// El "vídeo" del búfer de repetición lleva el instante real codificado en cada fotograma
// (10 bits en bloques blancos/negros), así los tests pueden comprobar QUÉ fragmento contiene cada clip.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { ffmpegPath } from '../server/ffmpeg.js';

const FPS = 10;
const W = 320;
const H = 180;
const BLOCK = 32;
const WRAP = 1024; // décimas de segundo => 102,4 s

export function run(bin, args) {
  return new Promise((resolve, reject) => {
    const c = spawn(bin, args);
    const out = [];
    let err = '';
    c.stdout.on('data', (d) => out.push(d));
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', reject);
    c.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.slice(-400)))));
  });
}

/** Instante (s, módulo 102,4) codificado en el fotograma situado en `ss` (o `sseof` negativo desde el final). */
export async function decodeTimecode(file, { ss, sseof } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (sseof !== undefined) args.push('-sseof', String(sseof));
  else if (ss) args.push('-ss', String(ss));
  args.push('-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-');
  const buf = await run(ffmpegPath({}), args);
  let v = 0;
  for (let k = 0; k < 10; k++) {
    let sum = 0;
    let n = 0;
    for (let y = 60; y < 120; y++) for (let x = k * BLOCK + 6; x < (k + 1) * BLOCK - 6; x++) { sum += buf[y * W + x]; n++; }
    if (sum / n > 128) v |= 1 << k;
  }
  return v / 10;
}

/** Diferencia circular entre dos instantes módulo 102,4 s. */
export function circDiff(a, b) {
  const w = WRAP / 10;
  let d = (a - b) % w;
  if (d > w / 2) d -= w;
  if (d < -w / 2) d += w;
  return d;
}

export async function makeReplayFile(file, startAbsSec, durSec) {
  const startDeci = Math.round(startAbsSec * 10);
  const expr = `lum='255*mod(floor(mod(floor(T*10+0.5)+${startDeci},${WRAP})/pow(2,floor(X/${BLOCK}))),2)':cb=128:cr=128`;
  await run(ffmpegPath({}), [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${durSec.toFixed(2)}`,
    '-vf', `format=yuv420p,geq=${expr}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', file,
  ]);
}

export class MockObs {
  constructor({ password = '', bufferSec = 40, writeDelayMs = 0, dir, rbEnabled = true, mode = 'Simple', cameraLagSec = 0 } = {}) {
    this.cameraLagSec = cameraLagSec; // la cámara llega con retraso: el fotograma de OBS muestra el pasado
    this.password = password;
    this.writeDelayMs = writeDelayMs;
    this.dir = dir;
    this.params = {
      'Output.Mode': mode,
      [`${mode === 'Advanced' ? 'AdvOut' : 'SimpleOutput'}.RecRB`]: String(rbEnabled),
      [`${mode === 'Advanced' ? 'AdvOut' : 'SimpleOutput'}.RecRBTime`]: String(bufferSec),
      [`${mode === 'Advanced' ? 'AdvOut' : 'SimpleOutput'}.RecRBSize`]: '512',
    };
    this.replayActive = false;
    this.bufferStart = 0;
    this.lastReplay = '';
    this.saves = [];
    this.sockets = new Set();
    this.requests = [];
    this.failNextSave = 0;
  }

  async start(port = 0) {
    this.wss = new WebSocketServer({ port, handleProtocols: (p) => (p.has('obswebsocket.json') ? 'obswebsocket.json' : false) });
    await new Promise((r) => this.wss.once('listening', r));
    this.port = this.wss.address().port;
    this.wss.on('connection', (ws) => this.onConnection(ws));
    return this.port;
  }

  async stop() {
    for (const s of this.sockets) s.terminate();
    if (!this.wss) return;
    const w = this.wss;
    this.wss = null;
    await new Promise((r) => w.close(r));
  }

  /** Simula que OBS se cierra o pierde la red (el búfer sigue acumulando vídeo). */
  async goOffline() { await this.stop(); }
  async goOnline() { await this.start(this.port); }

  dropConnections() { for (const s of this.sockets) s.terminate(); }

  startBuffer() { this.replayActive = true; this.bufferStart = Date.now(); this.emitAll('ReplayBufferStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' }); }

  emitAll(eventType, eventData) {
    for (const s of this.sockets) if (s.identified) s.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 64, eventData } }));
  }

  get cat() { return this.params['Output.Mode'] === 'Advanced' ? 'AdvOut' : 'SimpleOutput'; }

  onConnection(ws) {
    this.sockets.add(ws);
    ws.on('close', () => this.sockets.delete(ws));
    const salt = crypto.randomBytes(16).toString('base64');
    const challenge = crypto.randomBytes(16).toString('base64');
    const hello = { obsWebSocketVersion: '5.5.4', rpcVersion: 1 };
    if (this.password) hello.authentication = { challenge, salt };
    ws.send(JSON.stringify({ op: 0, d: hello }));
    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.op === 1) {
        if (this.password) {
          const secret = crypto.createHash('sha256').update(this.password + salt).digest('base64');
          const expect = crypto.createHash('sha256').update(secret + challenge).digest('base64');
          if (msg.d.authentication !== expect) return ws.close(4009, 'Authentication failed');
        }
        ws.identified = true;
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      } else if (msg.op === 6 && ws.identified) {
        const { requestType, requestId, requestData } = msg.d;
        this.requests.push(requestType);
        let status = { result: true, code: 100 };
        let data = {};
        try { data = (await this.handle(requestType, requestData || {})) || {}; } catch (e) { status = { result: false, code: 600, comment: e.message }; }
        ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: status, responseData: data } }));
      }
    });
  }

  async handle(type, d) {
    const p = this.params;
    switch (type) {
      case 'GetVersion': return { obsVersion: '31.0.0', obsWebSocketVersion: '5.5.4' };
      case 'GetReplayBufferStatus': return { outputActive: this.replayActive };
      case 'GetStreamStatus': return { outputActive: false };
      case 'StartReplayBuffer':
        if (!p[`${this.cat}.RecRB`] || p[`${this.cat}.RecRB`] === 'false') throw new Error('El búfer de repetición no está habilitado');
        this.startBuffer();
        return {};
      case 'StopReplayBuffer': this.replayActive = false; this.emitAll('ReplayBufferStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }); return {};
      case 'GetProfileParameter': return { parameterValue: p[`${d.parameterCategory}.${d.parameterName}`] ?? null, defaultParameterValue: null };
      case 'SetProfileParameter': p[`${d.parameterCategory}.${d.parameterName}`] = d.parameterValue; return {};
      case 'GetLastReplayBufferReplay': return { savedReplayPath: this.lastReplay };
      case 'SaveReplayBuffer': {
        if (!this.replayActive) throw new Error('El búfer de repetición no está activo');
        if (this.failNextSave > 0) { this.failNextSave--; throw new Error('fallo simulado de OBS'); }
        const end = Date.now();
        const have = (end - this.bufferStart) / 1000;
        const dur = Math.max(1, Math.min(Number(p[`${this.cat}.RecRBTime`]), have));
        const file = path.join(this.dir, `Replay ${this.saves.length + 1}.mp4`);
        this.lastReplay = file;
        this.saves.push({ file, endAt: end, durSec: dur });
        // OBS confirma enseguida y emite el evento; el archivo puede tardar en terminar de escribirse.
        setTimeout(() => this.emitAll('ReplayBufferSaved', { savedReplayPath: file }), 60);
        setTimeout(() => makeReplayFile(file, end / 1000 - dur - this.cameraLagSec, dur).catch((e) => console.error('mock-obs', e.message)), this.writeDelayMs);
        return {};
      }
      default: throw new Error(`petición no soportada: ${type}`);
    }
  }
}
