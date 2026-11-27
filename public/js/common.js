// Utilidades compartidas por el mando y las pantallas de emisión.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clockMs = (clock, t) => (clock.running ? clock.baseMs + Math.max(0, t - clock.startedAt) : clock.baseMs);

const pad = (n) => String(n).padStart(2, '0');
export function fmtClock(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export const PHASE_LABEL = { pre: 'Previa', first: '1ª parte', halftime: 'Descanso', second: '2ª parte', finished: 'Final' };
export const TYPE_LABEL = { goal: 'Gol', foul: 'Falta', yellow: 'Tarjeta amarilla', red: 'Tarjeta roja', sub: 'Cambio', play: 'Jugada' };
export const TYPE_NOTICE = { goal: 'GOL', foul: 'FALTA', yellow: 'TARJETA AMARILLA', red: 'TARJETA ROJA', sub: 'CAMBIO', play: 'JUGADA' };

/** Tiempo añadido: cuántos minutos se lleva sobre la duración de la parte y cuántos se anunciaron. */
export function addedInfo(match, ms) {
  const c = match.clock;
  const end = c.phase === 'first' || c.phase === 'halftime' ? match.durations[0] : match.durations[0] + match.durations[1];
  const period = c.phase === 'second' || c.phase === 'finished' ? 2 : 1;
  const over = Math.floor(ms / 60000) >= end ? Math.floor((ms - end * 60000) / 60000) + 1 : 0;
  const announced = c.phase === 'pre' ? 0 : c.extra?.[period] || 0;
  return { over, announced };
}

export function initialsOf(team) {
  return (team.short || team.name || '?').slice(0, 4).toUpperCase();
}

/** Escudo: imagen subida o, mientras falte, las iniciales del equipo. */
export function badge(team, cls = '') {
  const style = `--tc:${esc(team.color || '#ffffff')}`;
  if (team.logo) return `<span class="badge ${cls}" style="${style}"><img src="${esc(team.logo)}" alt=""></span>`;
  const ini = initialsOf(team);
  return `<span class="badge badge-init n${ini.length} ${cls}" style="${style}"><span>${esc(ini)}</span></span>`;
}

const SVG = (inner, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export function icon(type) {
  switch (type) {
    case 'goal': return SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6l3.6 2.6-1.4 4.2H9.8L8.4 10.2z"/><path d="M12 7.6V3.6M15.6 10.2l3.8-1.2M14.2 14.4l2.4 3.2M9.8 14.4l-2.4 3.2M8.4 10.2L4.6 9"/>');
    case 'foul': return SVG('<path d="M6 21V4"/><path d="M6 5h11l-2.4 3.6L17 12H6"/>');
    case 'yellow': return `<svg class="ico ico-card" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2" fill="var(--yellow)"/></svg>`;
    case 'red': return `<svg class="ico ico-card" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2" fill="var(--red)"/></svg>`;
    case 'sub': return SVG('<path d="M4 8h13M13 4l4 4-4 4"/><path d="M20 16H7M11 12l-4 4 4 4"/>');
    case 'play': return SVG('<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10.2 9.4v5.2l4.4-2.6z" fill="currentColor"/>');
    default: return '';
  }
}

/** Descripción corta de un evento para listas y avisos. */
export function eventDetail(e, match) {
  const team = e.team ? match[e.team] : null;
  const who = [e.number ? `${e.number}` : '', e.player].filter(Boolean).join(' · ');
  const bits = [];
  if (e.type === 'sub') {
    if (e.player) bits.push(`Sale ${e.player}`);
    if (e.playerIn) bits.push(`entra ${e.playerIn}`);
  } else if (who) bits.push(who);
  if (e.note) bits.push(e.note);
  return { team, text: bits.join(' — ') };
}

// ---------------------------------------------------------------------------
// Conexión en tiempo real con sincronización de reloj con el servidor.
// ---------------------------------------------------------------------------
export function getClientId() {
  try {
    let id = localStorage.getItem('ffsp_cid');
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem('ffsp_cid', id); }
    return id;
  } catch { return Math.random().toString(36).slice(2, 10); }
}

export class Link {
  constructor({ role = 'view', cid = getClientId(), onState, onAdmin, onAck, onStatus, onHello } = {}) {
    Object.assign(this, { role, cid, onState, onAdmin, onAck, onStatus, onHello });
    this.offset = 0; // servidor - cliente (ms)
    this.rtt = null;
    this.samples = [];
    this.status = 'connecting'; // connecting | online | offline
    this.ws = null;
    this.attempt = 0;
    this.lastMsg = 0;
    this.synced = false;
    this.snapshots = [];
    this.authRole = null;
  }

  now() { return Date.now() + this.offset; }

  start() {
    this.open();
    setInterval(() => this.watchdog(), 3000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.wake(); });
    window.addEventListener('online', () => this.wake());
  }

  wake() {
    if (!this.ws || this.ws.readyState > 1) { clearTimeout(this.retry); this.open(); } else this.ping();
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus?.(s);
  }

  open() {
    clearTimeout(this.retry);
    this.setStatus(this.status === 'online' ? 'offline' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try { ws = new WebSocket(`${proto}://${location.host}/ws?role=${this.role}&cid=${encodeURIComponent(this.cid)}`); } catch { return this.scheduleReconnect(); }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.lastMsg = Date.now();
      this.samples = [];
      let n = 0;
      const burst = () => { if (this.ws !== ws || ws.readyState !== 1 || n++ > 5) return; this.ping(); setTimeout(burst, 250); };
      burst();
    };
    ws.onmessage = (ev) => {
      this.lastMsg = Date.now();
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.t) {
        case 'hello':
          if (!this.synced) this.offset = m.serverTime - Date.now();
          this.authRole = m.role;
          if (m.build) {
            // Si el servidor se actualiza mientras la página sigue abierta, recarga para usar el código nuevo.
            if (this.build && this.build !== m.build) { location.reload(); return; }
            this.build = m.build;
          }
          this.snapshots = m.snapshots || [];
          this.setStatus('online');
          this.onHello?.(m);
          break;
        case 'state': this.onState?.(m.state); break;
        case 'admin': this.onAdmin?.(m.admin); break;
        case 'ack': this.onAck?.(m); break;
        case 'auth': this.onAuth?.(m); break;
        case 'pong': this.onPong(m); break;
        default:
      }
    };
    ws.onclose = () => { if (this.ws === ws) { this.setStatus('offline'); this.scheduleReconnect(); } };
    ws.onerror = () => { try { ws.close(); } catch { /* */ } };
  }

  scheduleReconnect() {
    clearTimeout(this.retry);
    const wait = Math.min(4000, 400 * 2 ** Math.min(this.attempt++, 4)) + Math.random() * 250;
    this.retry = setTimeout(() => this.open(), wait);
  }

  watchdog() {
    if (this.ws && this.ws.readyState === 1) {
      if (Date.now() - this.lastMsg > 20000) { try { this.ws.close(); } catch { /* */ } }
      else this.ping();
    }
  }

  ping() { this.send({ t: 'ping', c: Date.now() }); }

  onPong(m) {
    const t = Date.now();
    const rtt = t - m.c;
    if (rtt < 0 || rtt > 5000) return;
    this.samples.push({ rtt, offset: m.s + rtt / 2 - t });
    if (this.samples.length > 8) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.offset;
    this.rtt = best.rtt;
    this.synced = true;
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }
}
