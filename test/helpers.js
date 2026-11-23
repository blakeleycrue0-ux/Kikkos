import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function tmpDir(prefix = 'ffsp-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function boot(opts = {}) {
  const dataDir = opts.dataDir || tmpDir();
  const srv = await startServer({ port: 0, dataDir, quiet: true });
  srv.dataDir = dataDir;
  srv.base = `http://127.0.0.1:${srv.port}`;
  srv.key = srv.app.settings.key;
  return srv;
}

let n = 0;
export const cid = () => `cmd-${Date.now()}-${n++}`;

/** Cliente WebSocket de pruebas con ack por comando. */
export class TestClient {
  constructor(base, { role = 'view', key, clientId = 'test-client' } = {}) {
    this.base = base;
    this.role = role;
    this.key = key;
    this.clientId = clientId;
    this.states = [];
    this.admin = null;
    this.acks = new Map();
    this.hello = null;
  }

  async connect() {
    const url = this.base.replace('http', 'ws') + `/ws?role=${this.role}&cid=${this.clientId}`;
    this.ws = new WebSocket(url);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'state') { this.state = m.state; this.states.push(m.state); }
      else if (m.t === 'admin') this.admin = m.admin;
      else if (m.t === 'hello') this.hello = m;
      else if (m.t === 'ack') this.acks.get(m.id)?.(m);
      else if (m.t === 'auth') this.authResult = m;
    });
    await new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej); });
    if (this.role === 'control' && this.key) {
      this.ws.send(JSON.stringify({ t: 'auth', key: this.key }));
    }
    for (let i = 0; i < 100 && !this.state; i++) await sleep(10);
    if (this.role === 'control' && this.key) for (let i = 0; i < 100 && !this.authResult; i++) await sleep(10);
    return this;
  }

  cmd(name, args = {}, id = cid()) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`sin ack: ${name}`)), 5000);
      this.acks.set(id, (a) => { clearTimeout(t); resolve(a); });
      this.ws.send(JSON.stringify({ t: 'cmd', id, name, args }));
    });
  }

  async waitState(pred, ms = 3000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (this.state && pred(this.state)) return this.state;
      await sleep(15);
    }
    throw new Error('timeout esperando estado');
  }

  close() { try { this.ws.terminate(); } catch { /* */ } }
}
