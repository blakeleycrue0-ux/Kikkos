// Cliente de OBS WebSocket 5.x (obs-websocket, integrado en OBS 28+).
// Protocolo: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { uid, sleep } from './util.js';

const RPC_VERSION = 1;
const EVT_OUTPUTS = 1 << 6; // EventSubscription::Outputs

export class ObsClient extends EventEmitter {
  constructor() {
    super();
    this.cfg = { enabled: false, host: '127.0.0.1', port: 4455, password: '' };
    this.ws = null;
    this.state = 'disabled'; // disabled | connecting | connected | auth_failed | error | disconnected
    this.error = '';
    this.version = null;
    this.replayActive = null;
    this.streaming = null;
    this.pending = new Map();
    this.retryTimer = null;
    this.pollTimer = null;
    this.attempt = 0;
    this.gen = 0;
  }

  configure(cfg) {
    const next = { enabled: !!cfg.enabled, host: String(cfg.host || '127.0.0.1'), port: Number(cfg.port) || 4455, password: String(cfg.password || '') };
    const changed = JSON.stringify(next) !== JSON.stringify(this.cfg);
    this.cfg = next;
    if (changed || (next.enabled && !this.ws && this.state !== 'connecting')) this.restart();
  }

  get connected() { return this.state === 'connected'; }

  status() {
    return {
      state: this.state,
      error: this.error,
      version: this.version,
      replayActive: this.replayActive,
      streaming: this.streaming,
      host: this.cfg.host,
      port: this.cfg.port,
    };
  }

  setState(state, error = '') {
    if (this.state === state && this.error === error) return;
    this.state = state;
    this.error = error;
    this.emit('status', this.status());
  }

  restart() {
    this.gen++;
    this.teardown();
    clearTimeout(this.retryTimer);
    if (!this.cfg.enabled) { this.setState('disabled'); return; }
    this.attempt = 0;
    this.connect();
  }

  teardown() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.removeAllListeners();
      ws.on('error', () => {});
      try { ws.close(); } catch { /* */ }
    }
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('Conexión con OBS cerrada')); }
    this.pending.clear();
    this.replayActive = null;
    this.streaming = null;
  }

  scheduleRetry(gen) {
    if (gen !== this.gen || !this.cfg.enabled) return;
    clearTimeout(this.retryTimer);
    const wait = Math.min(15000, 1000 * 2 ** Math.min(this.attempt++, 4));
    this.retryTimer = setTimeout(() => { if (gen === this.gen) this.connect(); }, wait);
  }

  connect() {
    const gen = this.gen;
    this.setState('connecting');
    let ws;
    try {
      ws = new WebSocket(`ws://${this.cfg.host}:${this.cfg.port}`, 'obswebsocket.json', { handshakeTimeout: 5000 });
    } catch (e) {
      this.setState('error', e.message);
      this.scheduleRetry(gen);
      return;
    }
    this.ws = ws;
    let identified = false;
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const d = msg.d || {};
      switch (msg.op) {
        case 0: { // Hello
          const id = { rpcVersion: RPC_VERSION, eventSubscriptions: EVT_OUTPUTS };
          if (d.authentication) {
            if (!this.cfg.password) {
              this.setState('auth_failed', 'OBS pide contraseña');
              this.gen++; // no reintentar sin contraseña
              ws.close();
              return;
            }
            const secret = crypto.createHash('sha256').update(this.cfg.password + d.authentication.salt).digest('base64');
            id.authentication = crypto.createHash('sha256').update(secret + d.authentication.challenge).digest('base64');
          }
          ws.send(JSON.stringify({ op: 1, d: id }));
          break;
        }
        case 2: // Identified
          identified = true;
          this.attempt = 0;
          this.onIdentified().catch(() => {});
          break;
        case 5: // Event
          this.onEvent(d);
          break;
        case 7: { // RequestResponse
          const p = this.pending.get(d.requestId);
          if (!p) break;
          this.pending.delete(d.requestId);
          clearTimeout(p.timer);
          if (d.requestStatus?.result) p.resolve(d.responseData || {});
          else {
            const err = new Error(d.requestStatus?.comment || `OBS: error ${d.requestStatus?.code}`);
            err.code = d.requestStatus?.code;
            p.reject(err);
          }
          break;
        }
        default:
      }
    });
    ws.on('close', (code) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.teardown();
      if (code === 4009) {
        this.setState('auth_failed', 'Contraseña de OBS incorrecta');
        return; // no insistir con una contraseña errónea
      }
      if (gen !== this.gen) return;
      this.setState(identified ? 'disconnected' : (this.state === 'auth_failed' ? 'auth_failed' : 'error'), this.error);
      this.scheduleRetry(gen);
    });
    ws.on('error', (e) => {
      if (this.ws !== ws) return;
      const msg = e.code === 'ECONNREFUSED' ? 'OBS no responde (¿está abierto y con WebSocket activado?)' : e.message;
      this.error = msg;
      this.emit('status', this.status());
    });
  }

  async onIdentified() {
    try {
      const v = await this.request('GetVersion');
      this.version = { obs: v.obsVersion, ws: v.obsWebSocketVersion };
    } catch { /* */ }
    this.setState('connected');
    await this.refresh();
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.refresh().catch(() => {}), 5000);
    this.emit('connected');
  }

  async refresh() {
    try {
      const r = await this.request('GetReplayBufferStatus');
      this.replayActive = !!r.outputActive;
    } catch { this.replayActive = false; }
    try {
      const s = await this.request('GetStreamStatus');
      this.streaming = !!s.outputActive;
    } catch { /* */ }
    this.emit('status', this.status());
  }

  onEvent(d) {
    if (d.eventType === 'ReplayBufferStateChanged') {
      this.replayActive = !!d.eventData?.outputActive;
      this.emit('status', this.status());
    } else if (d.eventType === 'ReplayBufferSaved') {
      this.emit('replaySaved', { path: d.eventData?.savedReplayPath, at: Date.now() });
    }
  }

  request(type, data, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || (this.state !== 'connected' && type !== 'GetVersion')) {
        return reject(new Error('OBS no está conectado'));
      }
      const requestId = uid(12);
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`OBS no respondió a ${type}`)); }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId, ...(data ? { requestData: data } : {}) } }));
    });
  }

  /**
   * Pide a OBS que guarde el búfer de repetición y espera la ruta del archivo.
   * Devuelve { path, endAt }: endAt es el instante (ms epoch) en que el búfer terminaba.
   */
  async saveReplay() {
    if (!this.connected) throw new Error('OBS no está conectado');
    if (!this.replayActive) throw new Error('El búfer de repetición de OBS no está activo');
    const savedPromise = new Promise((resolve) => {
      const onSaved = (e) => { cleanup(); resolve(e); };
      const timer = setTimeout(() => { cleanup(); resolve(null); }, 15000);
      const cleanup = () => { clearTimeout(timer); this.off('replaySaved', onSaved); };
      this.on('replaySaved', onSaved);
    });
    const t0 = Date.now();
    await this.request('SaveReplayBuffer');
    const t1 = Date.now();
    const endAt = Math.round((t0 + t1) / 2);
    let path;
    const ev = await savedPromise;
    if (ev?.path) path = ev.path;
    else {
      await sleep(300);
      path = (await this.request('GetLastReplayBufferReplay')).savedReplayPath;
    }
    if (!path) throw new Error('OBS no devolvió la ruta del archivo guardado');
    return { path, endAt };
  }

  /** Lee la configuración del búfer de repetición del perfil actual. */
  async bufferInfo() {
    const get = async (cat, name) => {
      try { return (await this.request('GetProfileParameter', { parameterCategory: cat, parameterName: name })).parameterValue; } catch { return null; }
    };
    const mode = (await get('Output', 'Mode')) || 'Simple';
    const cat = mode === 'Advanced' ? 'AdvOut' : 'SimpleOutput';
    const enabled = await get(cat === 'AdvOut' ? 'AdvOut' : 'SimpleOutput', 'RecRB');
    const seconds = Number(await get(cat, 'RecRBTime'));
    const memMb = Number(await get(cat, 'RecRBSize'));
    await this.refresh();
    return {
      mode,
      category: cat,
      enabled: enabled === 'true' || enabled === true,
      seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 20,
      memMb: Number.isFinite(memMb) && memMb > 0 ? memMb : 512,
      active: !!this.replayActive,
    };
  }

  /** Ajusta duración del búfer (y reinicia el búfer para que se aplique). */
  async fixBuffer(targetSec) {
    const info = await this.bufferInfo();
    const needMem = Math.max(info.memMb, Math.ceil(targetSec * 12)); // ~12 MB por segundo de margen
    await this.request('SetProfileParameter', { parameterCategory: info.category, parameterName: 'RecRBTime', parameterValue: String(targetSec) });
    if (needMem !== info.memMb) {
      await this.request('SetProfileParameter', { parameterCategory: info.category, parameterName: 'RecRBSize', parameterValue: String(needMem) });
    }
    if (info.active) {
      await this.request('StopReplayBuffer').catch(() => {});
      await sleep(1200);
    }
    await this.request('StartReplayBuffer');
    await sleep(500);
    return this.bufferInfo();
  }

  async startBuffer() {
    await this.request('StartReplayBuffer');
    await sleep(400);
    await this.refresh();
  }

  close() {
    this.gen++;
    clearTimeout(this.retryTimer);
    this.teardown();
    this.setState('disabled');
  }
}
