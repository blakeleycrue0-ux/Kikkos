// Sincronización en tiempo real por WebSocket.
import { WebSocketServer } from 'ws';
import { parseCookies, clientIp } from './http.js';
import { uid } from './util.js';
import { BUILD } from './config.js';

export function attachWebSocket(server, app) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const clients = new Set();

  const send = (c, obj) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj)); };

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    // Evita que otra web abierta en el navegador use la sesión del mando.
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return socket.destroy(); } catch { return socket.destroy(); }
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const c = {
      ws,
      ip: clientIp(req),
      role: 'view',
      clientId: String(url.searchParams.get('cid') || uid(8)).slice(0, 40),
      alive: true,
    };
    const cookies = parseCookies(req.headers.cookie);
    if (url.searchParams.get('role') === 'control' && app.validSession(cookies.ffsp_s)) c.role = 'control';
    clients.add(c);

    const now = Date.now();
    send(c, { t: 'hello', role: c.role, build: BUILD, serverTime: now, snapshots: c.role === 'view' ? app.recentSnapshots(now) : undefined });
    send(c, { t: 'state', state: app.publicState(now) });
    if (c.role === 'control') send(c, { t: 'admin', admin: app.adminState() });

    ws.on('pong', () => { c.alive = true; });
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      switch (msg.t) {
        case 'ping':
          send(c, { t: 'pong', c: msg.c, s: Date.now() });
          break;
        case 'auth': {
          const wait = app.throttle(c.ip);
          if (wait) return send(c, { t: 'auth', ok: false, error: `Demasiados intentos. Espera ${wait} s.` });
          if (app.checkKey(msg.key)) {
            app.clearFailures(c.ip);
            c.role = 'control';
            send(c, { t: 'auth', ok: true });
            send(c, { t: 'admin', admin: app.adminState() });
          } else {
            app.noteFailure(c.ip);
            send(c, { t: 'auth', ok: false, error: 'Clave incorrecta' });
          }
          break;
        }
        case 'cmd': {
          if (c.role !== 'control') {
            return send(c, { t: 'ack', id: msg.id, ok: false, error: { code: 'forbidden', message: 'Sin permiso de control' } });
          }
          const ack = await app.exec(String(msg.name), msg.args, { cmdId: msg.id, clientId: c.clientId });
          send(c, { t: 'ack', id: msg.id, ...ack });
          break;
        }
        default:
      }
    });
    ws.on('close', () => clients.delete(c));
    ws.on('error', () => clients.delete(c));
  });

  app.connCounts = () => ({ views: [...clients].filter((c) => c.role === 'view').length, controls: [...clients].filter((c) => c.role === 'control').length });

  app.on('state', (state) => {
    const payload = JSON.stringify({ t: 'state', state });
    for (const c of clients) if (c.ws.readyState === 1) c.ws.send(payload);
  });
  app.on('admin', (admin) => {
    const payload = JSON.stringify({ t: 'admin', admin });
    for (const c of clients) if (c.role === 'control' && c.ws.readyState === 1) c.ws.send(payload);
  });

  // Detecta conexiones muertas (móvil sin cobertura) para liberarlas.
  const hb = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); clients.delete(c); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* */ }
    }
  }, 15000);
  wss.on('close', () => clearInterval(hb));

  return { wss, clients, close: () => { clearInterval(hb); for (const c of clients) c.ws.terminate(); wss.close(); } };
}
