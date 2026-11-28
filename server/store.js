// Persistencia en disco: ficheros JSON con escritura atómica.
import fs from 'node:fs';
import path from 'node:path';
import { deepMerge, makeKey, isObj } from './util.js';

export const DEFAULT_SETTINGS = () => ({
  version: 1,
  key: '',
  sessions: [],
  activeMatchId: null,
  club: { name: 'Club Femenino Santa Ponsa', short: 'FFSP', color: '#B9A5F0', logo: '', nextMatch: '' },
  roster: [], // { id, number, name, full, starter, photo }
  staff: { coach: '', delegate: '' },
  sponsors: [], // { id, url }
  strip: { enabled: false, seconds: 7, messages: [], sponsors: true, whiteBadge: false },
  display: {
    mode: 'camera', // camera | studio  (lo que muestra /live)
    style: 'pro', // pro | classic  (aspecto de la pantalla sin cámara)
    screen: 'auto', // auto | live | prematch | lineup | halftime | final | stats | sponsors (pantalla sin cámara)
    askScorer: true, // al registrar un gol/tarjeta del club, pregunta qué jugadora
    goalAnim: true, // animación grande de gol en la pantalla sin cámara
    layout: 'h', // h = 16:9, v = 9:16 (lo que muestra /live si no se fuerza)
    // Márgenes en píxeles sobre el lienzo de 1920x1080 (h) o 1080x1920 (v).
    margins: {
      h: { top: 40, right: 60, bottom: 40, left: 60 },
      v: { top: 260, right: 60, bottom: 380, left: 60 },
    },
    delays: { scoreMs: 0, clockMs: 0 }, // retraso solo en pantallas "con cámara"
    noticeSeconds: 6,
    noticeTypes: { goal: true, yellow: true, red: true, sub: true, foul: false, play: false },
    recentEvents: 3,
    whiteLogos: false, // opcional: convierte los escudos en silueta blanca (mejor subir escudos ya en blanco)
  },
  clips: {
    enabled: true,
    dir: '',
    preSec: 20,
    postSec: 10,
    cameraDelayMs: 0,
    marginMs: 2500,
    triggers: { goal: true, foul: true, play: true, yellow: false, red: false, sub: false },
    mode: 'accurate', // accurate = recodifica (corte exacto) | fast = copia (corte en fotograma clave)
    bufferTargetSec: 90,
    autoStartBuffer: true,
  },
  obs: { enabled: true, host: '127.0.0.1', port: 4455, password: '' },
  ffmpegPath: '',
});

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, text);
    try { fs.unlinkSync(tmp); } catch { /* */ }
  }
}

export class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.matchesDir = path.join(dataDir, 'matches');
    this.assetsDir = path.join(dataDir, 'assets');
    this.logosDir = path.join(this.assetsDir, 'logos');
    this.sampleDir = path.join(dataDir, 'sample');
    for (const d of [this.dir, this.matchesDir, this.logosDir, this.sampleDir]) fs.mkdirSync(d, { recursive: true });
    this.settingsFile = path.join(dataDir, 'settings.json');
    this.cmdFile = path.join(dataDir, 'cmdlog.json');
    this.clipsFile = path.join(dataDir, 'clips.json');
    this.matchCache = new Map();
  }

  readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // Fichero dañado: conservar copia para no perder datos y seguir con valores por defecto.
        try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* */ }
      }
      return fallback;
    }
  }

  loadSettings() {
    const s = deepMerge(DEFAULT_SETTINGS(), this.readJson(this.settingsFile, {}));
    if (!isObj(s.club)) s.club = DEFAULT_SETTINGS().club;
    if (!s.key) s.key = makeKey();
    this.saveSettings(s);
    return s;
  }

  saveSettings(s) {
    atomicWrite(this.settingsFile, JSON.stringify(s, null, 2));
  }

  matchFile(id) {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error('id de partido no válido');
    return path.join(this.matchesDir, `${id}.json`);
  }

  loadMatch(id) {
    if (this.matchCache.has(id)) return this.matchCache.get(id);
    const m = this.readJson(this.matchFile(id), null);
    if (m) this.matchCache.set(id, m);
    return m;
  }

  saveMatch(m) {
    this.matchCache.set(m.id, m);
    atomicWrite(this.matchFile(m.id), JSON.stringify(m));
  }

  deleteMatch(id) {
    this.matchCache.delete(id);
    try { fs.unlinkSync(this.matchFile(id)); } catch { /* */ }
  }

  listMatches() {
    const out = [];
    for (const f of fs.readdirSync(this.matchesDir)) {
      if (!f.endsWith('.json')) continue;
      const m = this.loadMatch(f.slice(0, -5));
      if (m) out.push(m);
    }
    return out;
  }

  loadCmdLog() { return this.readJson(this.cmdFile, []); }
  saveCmdLog(arr) { atomicWrite(this.cmdFile, JSON.stringify(arr)); }
  loadClips() { return this.readJson(this.clipsFile, []); }
  saveClips(arr) { atomicWrite(this.clipsFile, JSON.stringify(arr)); }
}
