// Gestor de clips: convierte eventos del partido en archivos de vídeo a partir del
// búfer de repetición de OBS.
//
// Tres instantes distintos, nunca mezclados:
//   realAt          instante real (servidor) en que se registró el evento.
//   startVideoAt..  instante en que esa jugada llega al vídeo de OBS = realAt + retraso de cámara.
//   readyAt         cuándo ya ha llegado el vídeo posterior necesario y se puede guardar.
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { uid, slug, pad2, sleep, clamp } from './util.js';
import { cutClip, probeDurationMs } from './ffmpeg.js';
import { minuteLabel, typeName } from './engine.js';

const MAX_ATTEMPTS = 3;
const WAIT_FILE_MS = 60000;

export class ClipManager extends EventEmitter {
  constructor({ store, getSettings, obs, dataDir }) {
    super();
    this.store = store;
    this.getSettings = getSettings;
    this.obs = obs;
    this.dataDir = dataDir;
    this.jobs = store.loadClips();
    // Si el programa se cerró a mitad de un trabajo, se vuelve a intentar.
    for (const j of this.jobs) if (j.state === 'processing') { j.state = 'pending'; j.note = 'Reanudado tras reiniciar'; }
    this.busy = false;
    this.timer = null;
    this.saveTimer = null;
    obs.on('connected', () => this.kick());
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.tick().catch((e) => console.error('[clips]', e)), 500);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.saveTimer);
    this.persistNow();
  }

  kick() { setTimeout(() => this.tick().catch(() => {}), 50); }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), 150);
  }

  persistNow() {
    try { this.store.saveClips(this.jobs); } catch (e) { console.error('[clips] no se pudo guardar', e.message); }
  }

  changed() {
    this.persist();
    this.emit('change');
  }

  clipsDir() {
    const d = this.getSettings().clips.dir;
    return d ? path.resolve(d) : path.join(this.dataDir, 'clips');
  }

  bufferSec() {
    return this.obs.bufferSecKnown || this.getSettings().clips.bufferTargetSec;
  }

  // ------------------------------------------------------------------ alta
  onEvent(match, ev) {
    const s = this.getSettings().clips;
    if (!s.enabled || !s.triggers[ev.type]) return null;
    if (this.jobs.some((j) => j.eventId === ev.id && j.state !== 'cancelled')) return null;
    const preMs = clamp(s.preSec, 0, 120) * 1000;
    const postMs = clamp(s.postSec, 1, 120) * 1000;
    const delay = Number(s.cameraDelayMs) || 0;
    const n = this.jobs.filter((j) => j.matchId === match.id).length + 1;
    const team = ev.team ? match[ev.team] : null;
    const job = {
      id: uid(10),
      n,
      matchId: match.id,
      matchName: match.name,
      matchFolder: `${match.date}_${slug(match.home.short, 8)}-${slug(match.away.short, 8)}_${match.id.slice(0, 4)}${match.isTest ? '_PRUEBA' : ''}`,
      eventId: ev.id,
      type: ev.type,
      typeName: typeName(ev.type),
      team: ev.team,
      teamShort: team?.short || '',
      minute: minuteLabel(match.durations, ev.period, ev.matchMs),
      realAt: ev.realAt,
      cameraDelayMs: delay,
      preMs,
      postMs,
      startVideoAt: ev.realAt + delay - preMs,
      endVideoAt: ev.realAt + delay + postMs,
      readyAt: ev.realAt + delay + postMs + (Number(s.marginMs) || 0),
      state: 'pending',
      note: 'Esperando el vídeo posterior',
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.push(job);
    this.changed();
    return job;
  }

  onEventRemoved(matchId, eventId) {
    for (const j of [...this.jobs]) {
      if (j.matchId !== matchId || j.eventId !== eventId) continue;
      if (j.state === 'saved') { j.orphan = true; j.updatedAt = Date.now(); }
      else if (j.state === 'processing') j.cancelled = true;
      else this.jobs.splice(this.jobs.indexOf(j), 1);
    }
    this.changed();
  }

  // ----------------------------------------------------------------- bucle
  async tick() {
    if (this.busy) return;
    const now = Date.now();
    const ready = this.jobs.filter((j) => j.state === 'pending' && j.readyAt <= now);
    if (!ready.length) return;
    this.busy = true;
    try {
      await this.processBatch(ready);
    } catch (e) {
      console.error('[clips] error inesperado', e);
    } finally {
      this.busy = false;
    }
  }

  expired(j, now = Date.now()) {
    // Pasado este momento, el búfer de OBS ya no conserva el inicio del clip.
    return now > j.endVideoAt + this.bufferSec() * 1000 - 3000;
  }

  fail(j, message) {
    j.state = 'error';
    j.error = message;
    j.note = '';
    j.updatedAt = Date.now();
  }

  async processBatch(ready) {
    const now = Date.now();
    if (!this.obs.connected || !this.obs.replayActive) {
      for (const j of ready) {
        if (this.expired(j, now)) this.fail(j, 'OBS no estaba disponible y el material ya no está en el búfer');
        else j.note = this.obs.connected ? 'Esperando a que el búfer de repetición esté activo' : 'Esperando la conexión con OBS';
      }
      if (this.obs.connected && !this.obs.replayActive && this.getSettings().clips.autoStartBuffer) {
        this.obs.startBuffer().catch(() => {});
      }
      this.changed();
      return;
    }

    for (const j of ready) { j.state = 'processing'; j.note = 'Guardando búfer de OBS'; j.updatedAt = now; }
    this.changed();

    let save;
    try {
      save = await this.obs.saveReplay();
    } catch (e) {
      for (const j of ready) this.retryOrFail(j, e.message);
      this.changed();
      return;
    }

    let dur;
    try {
      dur = await this.waitForFile(save.path);
    } catch (e) {
      for (const j of ready) this.retryOrFail(j, e.message);
      this.changed();
      return;
    }
    const cover = { start: save.endAt - dur, end: save.endAt };

    // Un mismo archivo guardado puede contener varios eventos cercanos; cada uno
    // se recorta a su propio archivo, así nunca se mezclan.
    const eligible = this.jobs.filter(
      (j) => (j.state === 'processing' || j.state === 'pending') && j.endVideoAt <= save.endAt - 200 && !j.cancelled,
    );
    for (const j of ready) if (!eligible.includes(j) && j.state === 'processing') { j.state = 'pending'; j.note = 'Esperando el vídeo posterior'; }
    for (const j of eligible) {
      j.state = 'processing';
      j.note = 'Recortando clip';
    }
    this.changed();
    for (const j of eligible) await this.cutJob(j, save.path, cover);
    this.changed();
  }

  retryOrFail(j, message) {
    j.attempts++;
    if (j.attempts >= MAX_ATTEMPTS || this.expired(j)) this.fail(j, message);
    else {
      j.state = 'pending';
      j.readyAt = Date.now() + 3000;
      j.note = `Reintentando (${j.attempts}/${MAX_ATTEMPTS}): ${message}`;
    }
    j.updatedAt = Date.now();
  }

  async waitForFile(file) {
    const settings = this.getSettings();
    const t0 = Date.now();
    let last = -1;
    while (Date.now() - t0 < WAIT_FILE_MS) {
      let size = 0;
      try { size = fs.statSync(file).size; } catch { size = 0; }
      // Archivo aún en escritura: crece o todavía no se puede leer su cabecera.
      if (size > 0 && size === last) {
        const d = await probeDurationMs(settings, file);
        if (d && d > 0) return d;
      }
      last = size;
      await sleep(500);
    }
    throw new Error('El archivo guardado por OBS no está listo (¿sigue escribiéndose?)');
  }

  outPath(j) {
    const t = new Date(j.realAt);
    const hhmmss = `${pad2(t.getHours())}${pad2(t.getMinutes())}${pad2(t.getSeconds())}`;
    const min = j.minute.replace(/'/g, 'min').replace(/\+/g, 'mas');
    const name = `${String(j.n).padStart(3, '0')}_${min}_${j.typeName.replace(/\s+/g, '-')}${j.teamShort ? '_' + slug(j.teamShort, 6) : ''}_${hhmmss}.mp4`
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    return path.join(this.clipsDir(), j.matchFolder, name);
  }

  async cutJob(j, rawPath, cover) {
    try {
      const startAt = Math.max(j.startVideoAt, cover.start);
      const endAt = Math.min(j.endVideoAt, cover.end);
      const durationMs = endAt - startAt;
      if (durationMs < 1000) throw new Error('El fragmento ya no está en el búfer de OBS');
      const partial = j.startVideoAt < cover.start - 800;
      const out = this.outPath(j);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const settings = this.getSettings();
      await cutClip(settings, {
        input: rawPath,
        output: out,
        startMs: startAt - cover.start,
        durationMs,
        mode: settings.clips.mode,
      });
      // Solo se declara "guardado" si el archivo existe y se puede leer.
      const st = fs.statSync(out);
      const outDur = await probeDurationMs(settings, out);
      if (!st.size || !outDur) throw new Error('El clip generado no es legible');
      if (j.cancelled) {
        try { fs.unlinkSync(out); } catch { /* */ }
        this.jobs.splice(this.jobs.indexOf(j), 1);
        return;
      }
      Object.assign(j, {
        state: 'saved',
        file: out,
        size: st.size,
        durationMs: outDur,
        rawPath,
        rawCover: cover,
        partial,
        note: partial ? 'Guardado, pero el búfer de OBS no llegaba a cubrir todos los segundos previos' : '',
        error: '',
        savedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (e) {
      j.attempts++;
      this.fail(j, e.message);
    }
    this.emit('change');
  }

  // ----------------------------------------------------------- reintentar
  async retry(id) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) throw new Error('Clip no encontrado');
    if (j.state === 'processing') throw new Error('El clip se está procesando');
    j.error = '';
    j.attempts = 0;
    // 1) Si el archivo guardado por OBS sigue ahí y cubre la jugada: recortar de nuevo.
    if (j.rawPath && j.rawCover && fs.existsSync(j.rawPath) && j.endVideoAt <= j.rawCover.end) {
      j.state = 'processing';
      j.note = 'Recortando clip';
      this.changed();
      this.busy = true;
      try { await this.cutJob(j, j.rawPath, j.rawCover); } finally { this.busy = false; }
      this.changed();
      return j;
    }
    // 2) Si el vídeo aún está en el búfer de OBS: guardar de nuevo.
    if (!this.expired(j)) {
      j.state = 'pending';
      j.readyAt = Math.max(Date.now(), j.readyAt - 0);
      j.note = 'Reintento programado';
      this.changed();
      this.kick();
      return j;
    }
    this.fail(j, 'El material ya no está disponible: el búfer de OBS lo ha sobrescrito');
    this.changed();
    return j;
  }

  // -------------------------------------------------------------- consulta
  view(j) {
    return {
      id: j.id,
      n: j.n,
      matchId: j.matchId,
      matchName: j.matchName,
      eventId: j.eventId,
      type: j.type,
      typeName: j.typeName,
      team: j.team,
      teamShort: j.teamShort,
      minute: j.minute,
      realAt: j.realAt,
      readyAt: j.readyAt,
      state: j.state,
      note: j.note || '',
      error: j.error || '',
      attempts: j.attempts,
      file: j.file ? path.basename(j.file) : '',
      folder: j.file ? path.dirname(j.file) : '',
      size: j.size || 0,
      durationMs: j.durationMs || 0,
      partial: !!j.partial,
      orphan: !!j.orphan,
      savedAt: j.savedAt || 0,
      canRetry: j.state === 'error' || j.state === 'saved',
    };
  }

  list(matchId) {
    return this.jobs
      .filter((j) => !matchId || j.matchId === matchId)
      .sort((a, b) => b.realAt - a.realAt)
      .map((j) => this.view(j));
  }

  filePath(id) {
    const j = this.jobs.find((x) => x.id === id && x.state === 'saved');
    if (!j || !j.file || !fs.existsSync(j.file)) return null;
    return j.file;
  }
}
