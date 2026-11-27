// Fuente única de verdad: estado del partido, ajustes, comandos idempotentes,
// integración con OBS y clips. Todo cliente (mando, pantallas) solo lee de aquí.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Store } from './store.js';
import {
  CmdError, createMatch, execMatchCommand, publicMatch, matchSummary, initials, computeScore,
} from './engine.js';
import { ObsClient } from './obs.js';
import { ClipManager } from './clips.js';
import { ffmpegVersion } from './ffmpeg.js';
import { parseRoster } from './roster.js';
import { BUILD, VERSION } from './config.js';
import { uid, makeKey, clamp, isObj, safeEqual, normalizeKey } from './util.js';

const CMD_LOG_MAX = 400;
const SNAPSHOT_KEEP_MS = 150000;
const SNAPSHOT_MAX = 160;

const MATCH_CMDS = /^(clock\.|event\.|match\.update$)/;

export class App extends EventEmitter {
  constructor({ dataDir, port }) {
    super();
    this.port = port;
    this.dataDir = dataDir;
    this.store = new Store(dataDir);
    this.settings = this.store.loadSettings();
    this.obs = new ObsClient();
    this.clips = new ClipManager({ store: this.store, getSettings: () => this.settings, obs: this.obs, dataDir });
    this.cmdLog = new Map(this.store.loadCmdLog());
    this.snapshots = [];
    this.match = this.loadActiveMatch();
    this.ffmpeg = { ok: null };
    this.adminTimer = null;
    this.bufferInfo = null;
    this.failures = new Map(); // ip -> { n, until }

    this.obs.on('status', () => this.scheduleAdmin());
    this.obs.on('connected', () => this.afterObsConnected());
    this.clips.on('change', () => this.scheduleAdmin());
    this.recordSnapshot(Date.now());
  }

  async start() {
    this.obs.configure(this.settings.obs);
    this.clips.start();
    this.ffmpeg = await ffmpegVersion(this.settings);
    this.scheduleAdmin();
  }

  stop() {
    this.clips.stop();
    this.obs.close();
    this.persistCmdLog();
  }

  // ----------------------------------------------------------- partido activo
  loadActiveMatch() {
    let m = this.settings.activeMatchId ? this.store.loadMatch(this.settings.activeMatchId) : null;
    if (!m) {
      const all = this.store.listMatches().sort((a, b) => b.updatedAt - a.updatedAt);
      m = all[0] || null;
    }
    if (!m) m = this.newTestMatch(Date.now());
    this.settings.activeMatchId = m.id;
    this.store.saveSettings(this.settings);
    return m;
  }

  newTestMatch(now) {
    const m = createMatch({
      isTest: true,
      name: 'PARTIDO DE PRUEBA',
      category: 'Prueba',
      durations: [5, 5],
      ffspSide: 'home',
      rival: { name: 'Rival de prueba', short: 'RIV', color: '#FFFFFF' },
    }, this.settings, now);
    this.store.saveMatch(m);
    return m;
  }

  backgroundFile() {
    for (const ext of ['png', 'jpg', 'webp']) {
      const f = path.join(this.store.assetsDir, `background.${ext}`);
      if (fs.existsSync(f)) return f;
    }
    return null;
  }

  // -------------------------------------------------------------------- estado
  publicState(now = Date.now()) {
    const st = this.settings;
    return {
      serverTime: now,
      match: publicMatch(this.match),
      display: st.display,
      club: { name: st.club.name, short: st.club.short, nextMatch: st.club.nextMatch || '' },
      squad: { roster: st.roster.map((p) => ({ id: p.id, number: p.number, name: p.name, starter: !!p.starter })), staff: st.staff },
      sponsors: st.sponsors.map((x) => ({ id: x.id, url: x.url })),
      strip: st.strip,
      season: this.seasonStats(),
    };
  }

  /** Goles por jugadora del club (partidos reales + el actual aunque sea de prueba) y racha de resultados. */
  seasonStats() {
    const matches = this.store.listMatches().filter((m) => !m.isTest && m.id !== this.match.id);
    matches.push(this.match);
    const goals = new Map();
    for (const m of matches) {
      for (const e of m.events) {
        if (e.type !== 'goal' || e.voided || e.team !== m.ffspSide) continue;
        const r = this.settings.roster.find((p) => p.id === e.rosterId);
        const name = r?.name || e.player;
        if (!name) continue;
        const key = r ? r.id : `${e.number}|${name.toLowerCase()}`;
        const g = goals.get(key) || { name, number: r?.number || e.number, goals: 0 };
        g.goals++;
        goals.set(key, g);
      }
    }
    const done = matches.filter((m) => !m.isTest && m.clock.phase === 'finished').sort((x, y) => (y.date + y.createdAt).localeCompare(x.date + x.createdAt));
    const last = done.slice(0, 5).map((m) => {
      const sc = computeScore(m.events);
      const mine = sc[m.ffspSide];
      const theirs = sc[m.ffspSide === 'home' ? 'away' : 'home'];
      return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
    });
    let n = 0;
    while (n < last.length && last[n] === last[0]) n++;
    return {
      scorers: [...goals.values()].sort((x, y) => y.goals - x.goals).slice(0, 12),
      form: { last, streak: last.length ? { type: last[0], n } : null },
    };
  }

  recordSnapshot(now) {
    const st = this.publicState(now);
    this.snapshots.push({ t: now, match: st.match, display: st.display });
    const cut = now - SNAPSHOT_KEEP_MS;
    while (this.snapshots.length > 1 && (this.snapshots[0].t < cut || this.snapshots.length > SNAPSHOT_MAX)) this.snapshots.shift();
    return st;
  }

  recentSnapshots(now = Date.now()) {
    const maxDelay = Math.max(this.settings.display.delays.scoreMs, this.settings.display.delays.clockMs, 0);
    const cut = now - maxDelay - 15000;
    const arr = this.snapshots.filter((s) => s.t >= cut);
    // Conservar siempre la última instantánea anterior al corte para poder reconstruir el pasado.
    const before = this.snapshots.filter((s) => s.t < cut).pop();
    return before ? [before, ...arr] : arr;
  }

  broadcastState(now = Date.now()) {
    const st = this.recordSnapshot(now);
    this.emit('state', st);
    this.scheduleAdmin();
  }

  // --------------------------------------------------------------------- admin
  lanAddresses() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      for (const i of list || []) {
        if (i.family !== 'IPv4' || i.internal) continue;
        const ip = i.address;
        const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
        if (ip.startsWith('169.254.')) continue;
        out.push({ name, ip, url: `http://${ip}:${this.port}`, likely: priv && !/vethernet|virtual|vmware|vbox|wsl|docker|tailscale|hyper-v/i.test(name) });
      }
    }
    out.sort((a, b) => Number(b.likely) - Number(a.likely));
    return out;
  }

  adminState() {
    const s = JSON.parse(JSON.stringify(this.settings));
    delete s.sessions;
    s.obs.passwordSet = !!this.settings.obs.password;
    s.obs.password = '';
    return {
      settings: s,
      key: this.settings.key,
      obs: { ...this.obs.status(), buffer: this.bufferInfo },
      ffmpeg: this.ffmpeg,
      clips: this.clips.list(),
      clipsDir: this.clips.clipsDir(),
      hasBackground: !!this.backgroundFile(),
      build: BUILD,
      version: VERSION,
      matches: this.store.listMatches().map(matchSummary).sort((a, b) => b.updatedAt - a.updatedAt),
      lan: this.lanAddresses(),
      port: this.port,
      serverTime: Date.now(),
    };
  }

  scheduleAdmin() {
    if (this.adminTimer) return;
    this.adminTimer = setTimeout(() => {
      this.adminTimer = null;
      this.emit('admin', this.adminState());
    }, 120);
  }

  // ---------------------------------------------------------------- seguridad
  checkKey(key) {
    return safeEqual(normalizeKey(key), normalizeKey(this.settings.key));
  }

  throttle(ip) {
    const f = this.failures.get(ip);
    return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
  }

  noteFailure(ip) {
    const f = this.failures.get(ip) || { n: 0, until: 0 };
    f.n++;
    if (f.n >= 8) { f.until = Date.now() + 60000; f.n = 0; }
    this.failures.set(ip, f);
  }

  clearFailures(ip) { this.failures.delete(ip); }

  newSession(ua = '') {
    const token = uid(32);
    this.settings.sessions.push({ token, createdAt: Date.now(), ua: String(ua).slice(0, 120) });
    if (this.settings.sessions.length > 30) this.settings.sessions.shift();
    this.store.saveSettings(this.settings);
    return token;
  }

  validSession(token) {
    return !!token && this.settings.sessions.some((s) => safeEqual(s.token, token));
  }

  // ------------------------------------------------------------------ comandos
  persistCmdLog() {
    try { this.store.saveCmdLog([...this.cmdLog.entries()]); } catch { /* */ }
  }

  rememberCmd(id, ack) {
    this.cmdLog.set(id, { ack, ts: Date.now() });
    while (this.cmdLog.size > CMD_LOG_MAX) this.cmdLog.delete(this.cmdLog.keys().next().value);
    this.persistCmdLog();
  }

  /**
   * Ejecuta un comando de forma idempotente. El mismo `cmdId` reenviado (reintento
   * tras perder la conexión, doble pulsación) devuelve el resultado original sin repetir nada.
   */
  async exec(name, args, { cmdId, clientId }) {
    if (!cmdId || typeof cmdId !== 'string' || cmdId.length > 64) return { ok: false, error: { code: 'invalid', message: 'Falta el identificador del comando' } };
    const known = this.cmdLog.get(cmdId);
    if (known) return { ...known.ack, dedup: true };
    let ack;
    try {
      const result = await this.run(name, isObj(args) ? args : {}, clientId);
      ack = { ok: true, result };
    } catch (e) {
      if (!(e instanceof CmdError)) console.error('[cmd]', name, e);
      ack = { ok: false, error: { code: e.code || 'error', message: e.message || 'Error' } };
    }
    // Los errores de validación también se recuerdan: un reintento recibe la misma respuesta.
    this.rememberCmd(cmdId, ack);
    return ack;
  }

  async run(name, a, clientId) {
    const now = Date.now();

    if (MATCH_CMDS.test(name)) {
      const m = this.match;
      const r = execMatchCommand(m, name, a, { now, clientId });
      if (r.changed) {
        this.store.saveMatch(m);
        if (r.event && name === 'event.add') this.clips.onEvent(m, r.event);
        if (r.removed) this.clips.onEventRemoved(m.id, r.removed.id);
        this.broadcastState(now);
      }
      return r.result;
    }

    switch (name) {
      case 'match.create': {
        const rival = isObj(a.rival) ? a.rival : {};
        if (!String(rival.name || '').trim() && !a.isTest) throw new CmdError('invalid', 'Indica el nombre del rival');
        const m = createMatch({ ...a, rival: { ...rival, short: rival.short || initials(rival.name) } }, this.settings, now);
        this.store.saveMatch(m);
        this.setActive(m, now);
        return { id: m.id };
      }
      case 'match.createTest': {
        const m = this.newTestMatch(now);
        this.setActive(m, now);
        return { id: m.id };
      }
      case 'match.select': {
        const m = this.store.loadMatch(String(a.id));
        if (!m) throw new CmdError('not_found', 'Partido no encontrado');
        this.setActive(m, now);
        return { id: m.id };
      }
      case 'match.delete': {
        const id = String(a.id);
        const m = this.store.loadMatch(id);
        if (!m) throw new CmdError('not_found', 'Partido no encontrado');
        if (m.id === this.match.id && m.clock.running) throw new CmdError('busy', 'No se puede eliminar un partido con el reloj en marcha');
        this.store.deleteMatch(id);
        if (id === this.match.id) {
          const rest = this.store.listMatches().sort((x, y) => y.updatedAt - x.updatedAt)[0] || this.newTestMatch(now);
          this.setActive(rest, now);
        } else this.scheduleAdmin();
        return {};
      }
      case 'settings.update':
        return this.updateSettings(a.patch, now);
      case 'roster.import': {
        const { roster, staff } = parseRoster(a.text);
        if (!roster.length) throw new CmdError('invalid', 'No he encontrado jugadoras. Pega líneas como «7  APELLIDOS, NOMBRE».');
        const old = this.settings.roster;
        this.settings.roster = roster.map((p) => ({ id: old.find((o) => o.number === p.number)?.id || uid(6), ...p }));
        if (staff.coach || staff.delegate) this.settings.staff = { coach: staff.coach || '', delegate: staff.delegate || '' };
        this.store.saveSettings(this.settings);
        this.broadcastState(now);
        return { count: roster.length, starters: roster.filter((p) => p.starter).length };
      }
      case 'roster.save': {
        if (!Array.isArray(a.roster) || a.roster.length > 60) throw new CmdError('invalid', 'Plantilla no válida');
        const seen = new Set();
        this.settings.roster = a.roster.map((p) => ({
          id: String(p.id || uid(6)).slice(0, 20),
          number: String(p.number ?? '').trim().slice(0, 3),
          name: String(p.name ?? '').trim().slice(0, 40),
          full: String(p.full ?? '').trim().slice(0, 80),
          starter: !!p.starter,
        })).filter((p) => p.number && p.name && !seen.has(p.number) && seen.add(p.number));
        if (isObj(a.staff)) this.settings.staff = { coach: String(a.staff.coach ?? '').trim().slice(0, 40), delegate: String(a.staff.delegate ?? '').trim().slice(0, 40) };
        this.store.saveSettings(this.settings);
        this.broadcastState(now);
        return { count: this.settings.roster.length };
      }
      case 'sponsor.add': {
        if (!/^\/assets\/logos\/[\w.-]+$/.test(String(a.url))) throw new CmdError('invalid', 'Imagen no válida');
        if (this.settings.sponsors.length >= 12) throw new CmdError('invalid', 'Máximo 12 patrocinadores');
        this.settings.sponsors.push({ id: uid(6), url: a.url });
        this.store.saveSettings(this.settings);
        this.broadcastState(now);
        return {};
      }
      case 'sponsor.remove':
        this.settings.sponsors = this.settings.sponsors.filter((x) => x.id !== String(a.id));
        this.store.saveSettings(this.settings);
        this.broadcastState(now);
        return {};
      case 'key.regenerate': {
        this.settings.key = makeKey();
        this.settings.sessions = [];
        this.store.saveSettings(this.settings);
        this.scheduleAdmin();
        return { key: this.settings.key };
      }
      case 'clips.retry': {
        const j = await this.clips.retry(String(a.id));
        return { state: j.state };
      }
      case 'clips.remove': {
        const i = this.clips.jobs.findIndex((j) => j.id === String(a.id));
        if (i >= 0 && this.clips.jobs[i].state !== 'processing') { this.clips.jobs.splice(i, 1); this.clips.changed(); }
        return {};
      }
      case 'obs.reconnect':
        this.obs.configure(this.settings.obs);
        this.obs.restart();
        return {};
      case 'obs.checkBuffer':
        return this.checkBuffer();
      case 'obs.fixBuffer': {
        if (!this.obs.connected) throw new CmdError('obs', 'OBS no está conectado');
        const target = clamp(Number(a.seconds) || this.settings.clips.bufferTargetSec, 30, 600);
        try {
          this.bufferInfo = await this.obs.fixBuffer(target);
        } catch (e) { throw new CmdError('obs', e.message); }
        this.afterBufferInfo();
        return this.bufferInfo;
      }
      default:
        throw new CmdError('unknown', `Comando desconocido: ${name}`);
    }
  }

  setActive(m, now) {
    this.match = m;
    this.settings.activeMatchId = m.id;
    this.store.saveSettings(this.settings);
    this.broadcastState(now);
  }

  updateSettings(patch, now) {
    if (!isObj(patch)) throw new CmdError('invalid', 'Ajustes no válidos');
    const s = this.settings;
    const p = JSON.parse(JSON.stringify(patch));
    const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? clamp(Math.round(Number(v)), lo, hi) : d);

    if (p.club) {
      const c = p.club;
      if ('name' in c) s.club.name = String(c.name).trim().slice(0, 60) || s.club.name;
      if ('short' in c) s.club.short = String(c.short).trim().toUpperCase().slice(0, 5) || s.club.short;
      if ('color' in c && /^#[0-9a-fA-F]{6}$/.test(c.color)) s.club.color = c.color;
      if ('nextMatch' in c) s.club.nextMatch = String(c.nextMatch).trim().slice(0, 140);
      if ('logo' in c) s.club.logo = /^\/assets\/logos\/[\w.-]+$/.test(String(c.logo)) ? c.logo : '';
    }
    if (p.display) {
      const d = p.display;
      if (d.mode === 'camera' || d.mode === 'studio') s.display.mode = d.mode;
      if (d.layout === 'h' || d.layout === 'v') s.display.layout = d.layout;
      for (const lay of ['h', 'v']) {
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const v = d.margins?.[lay]?.[side];
          if (v !== undefined) s.display.margins[lay][side] = num(v, 0, lay === 'h' ? 500 : 800, s.display.margins[lay][side]);
        }
      }
      if (d.delays) {
        if ('scoreMs' in d.delays) s.display.delays.scoreMs = num(d.delays.scoreMs, 0, 60000, 0);
        if ('clockMs' in d.delays) s.display.delays.clockMs = num(d.delays.clockMs, 0, 60000, 0);
      }
      if ('noticeSeconds' in d) s.display.noticeSeconds = num(d.noticeSeconds, 2, 20, 6);
      if ('whiteLogos' in d) s.display.whiteLogos = !!d.whiteLogos;
      if (['auto', 'live', 'prematch', 'lineup', 'halftime', 'final', 'stats', 'sponsors'].includes(d.screen)) s.display.screen = d.screen;
      if ('askScorer' in d) s.display.askScorer = !!d.askScorer;
      if ('goalAnim' in d) s.display.goalAnim = !!d.goalAnim;
      if ('recentEvents' in d) s.display.recentEvents = num(d.recentEvents, 1, 6, 3);
      if (isObj(d.noticeTypes)) for (const k of Object.keys(s.display.noticeTypes)) if (k in d.noticeTypes) s.display.noticeTypes[k] = !!d.noticeTypes[k];
    }
    if (p.clips) {
      const c = p.clips;
      if ('enabled' in c) s.clips.enabled = !!c.enabled;
      if ('dir' in c) s.clips.dir = this.checkClipsDir(String(c.dir || '').trim());
      if ('preSec' in c) s.clips.preSec = num(c.preSec, 0, 120, 20);
      if ('postSec' in c) s.clips.postSec = num(c.postSec, 1, 120, 10);
      if ('cameraDelayMs' in c) s.clips.cameraDelayMs = num(c.cameraDelayMs, 0, 60000, 0);
      if ('marginMs' in c) s.clips.marginMs = num(c.marginMs, 500, 15000, 2500);
      if ('bufferTargetSec' in c) s.clips.bufferTargetSec = num(c.bufferTargetSec, 30, 600, 90);
      if ('autoStartBuffer' in c) s.clips.autoStartBuffer = !!c.autoStartBuffer;
      if (c.mode === 'accurate' || c.mode === 'fast') s.clips.mode = c.mode;
      if (isObj(c.triggers)) for (const k of Object.keys(s.clips.triggers)) if (k in c.triggers) s.clips.triggers[k] = !!c.triggers[k];
    }
    if (p.strip) {
      const t = p.strip;
      if ('enabled' in t) s.strip.enabled = !!t.enabled;
      if ('sponsors' in t) s.strip.sponsors = !!t.sponsors;
      if ('whiteBadge' in t) s.strip.whiteBadge = !!t.whiteBadge;
      if ('seconds' in t) s.strip.seconds = num(t.seconds, 3, 30, 7);
      if (Array.isArray(t.messages)) s.strip.messages = t.messages.map((x) => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 10);
    }
    if (p.obs) {
      const o = p.obs;
      if ('enabled' in o) s.obs.enabled = !!o.enabled;
      if ('host' in o) s.obs.host = String(o.host).trim().slice(0, 100) || '127.0.0.1';
      if ('port' in o) s.obs.port = num(o.port, 1, 65535, 4455);
      if (typeof o.password === 'string' && (o.password !== '' || o.clearPassword)) s.obs.password = o.password.slice(0, 200);
    }
    if ('ffmpegPath' in p) {
      s.ffmpegPath = String(p.ffmpegPath || '').trim().slice(0, 300);
      ffmpegVersion(s).then((v) => { this.ffmpeg = v; this.scheduleAdmin(); });
    }
    this.store.saveSettings(s);
    if (p.obs) this.obs.configure(s.obs);
    this.broadcastState(now);
    return {};
  }

  checkClipsDir(dir) {
    if (!dir) return '';
    // Comprueba que se puede crear y escribir antes de aceptarla.
    try {
      return probeDir(dir);
    } catch (e) {
      throw new CmdError('invalid', `No se puede usar esa carpeta: ${e.message}`);
    }
  }

  // ------------------------------------------------------------------ OBS
  async afterObsConnected() {
    try {
      await this.checkBuffer();
      if (!this.obs.replayActive && this.settings.clips.autoStartBuffer && this.bufferInfo?.enabled) {
        await this.obs.startBuffer().catch(() => {});
        await this.checkBuffer();
      }
    } catch { /* se mostrará en el estado */ }
    this.scheduleAdmin();
  }

  async checkBuffer() {
    if (!this.obs.connected) throw new CmdError('obs', 'OBS no está conectado');
    try {
      this.bufferInfo = await this.obs.bufferInfo();
    } catch (e) { throw new CmdError('obs', e.message); }
    this.afterBufferInfo();
    return this.bufferInfo;
  }

  afterBufferInfo() {
    const b = this.bufferInfo;
    const c = this.settings.clips;
    const needSec = Math.ceil((c.preSec * 1000 + c.postSec * 1000 + c.cameraDelayMs + c.marginMs) / 1000) + 15;
    b.neededSec = needSec;
    b.ok = !!b.enabled && b.seconds >= needSec && b.active;
    b.problems = [];
    if (!b.enabled) b.problems.push('El búfer de repetición no está activado en OBS (Ajustes → Salida → Búfer de repetición).');
    if (b.seconds < needSec) b.problems.push(`El búfer dura ${b.seconds} s y hacen falta al menos ${needSec} s.`);
    if (b.enabled && !b.active) b.problems.push('El búfer de repetición no está iniciado.');
    this.obs.bufferSecKnown = b.seconds;
    this.scheduleAdmin();
  }
}

function probeDir(dir) {
  const abs = path.resolve(dir);
  fs.mkdirSync(abs, { recursive: true });
  const t = path.join(abs, `.ffsp-write-test-${process.pid}`);
  fs.writeFileSync(t, 'ok');
  fs.unlinkSync(t);
  return abs;
}
