// Lógica pura del partido: reloj, eventos y marcador.
// El marcador SIEMPRE se calcula a partir de los eventos: así nunca puede quedar
// incoherente después de editar, anular, eliminar o deshacer.
import { uid, clamp, isObj } from './util.js';

export const EVENT_TYPES = ['goal', 'foul', 'yellow', 'red', 'sub', 'play'];
export const TEAM_REQUIRED = new Set(['goal', 'foul', 'yellow', 'red', 'sub']);
export const PHASES = ['pre', 'first', 'halftime', 'second', 'finished'];
export const DOUBLE_PRESS_MS = 1200;

export class CmdError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const bad = (code, msg) => { throw new CmdError(code, msg); };

export const clockMs = (clock, t) =>
  clock.running ? clock.baseMs + Math.max(0, t - clock.startedAt) : clock.baseMs;

export function periodOfPhase(phase) {
  return phase === 'second' || phase === 'finished' ? 2 : 1;
}

/** Etiqueta de minuto de fútbol: 1' … 45' | 45+2' … */
export function minuteLabel(durations, period, ms) {
  const min = Math.floor(Math.max(0, ms) / 60000) + 1;
  const d1 = durations[0];
  const total = durations[0] + durations[1];
  if (period === 1 && min > d1) return `${d1}+${min - d1}'`;
  if (period === 2 && min > total) return `${total}+${min - total}'`;
  return `${min}'`;
}

export function computeScore(events) {
  const score = { home: 0, away: 0 };
  for (const e of events) {
    if (e.type === 'goal' && !e.voided && (e.team === 'home' || e.team === 'away')) score[e.team]++;
  }
  return score;
}

const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const color = (v, fallback) => (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : fallback);

function cleanTeam(input, base) {
  const t = { ...base };
  if (!isObj(input)) return t;
  if ('name' in input) t.name = str(input.name, 60) || base.name;
  if ('short' in input) t.short = str(input.short, 5).toUpperCase() || base.short;
  if ('color' in input) t.color = color(input.color, base.color);
  if ('logo' in input) t.logo = /^\/assets\/logos\/[\w.-]+$/.test(String(input.logo)) ? input.logo : '';
  return t;
}

function cleanDurations(d, base) {
  if (!Array.isArray(d)) return base;
  const out = [Number(d[0]), Number(d[1] ?? d[0])].map((n) => Math.round(clamp(Number.isFinite(n) ? n : 0, 1, 60)));
  return out.some((n) => !n) ? base : out;
}

export function initials(name) {
  const w = str(name).split(/\s+/).filter(Boolean);
  if (!w.length) return '---';
  if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
  return w.slice(0, 3).map((x) => x[0]).join('').toUpperCase();
}

export function createMatch(input, settings, now) {
  const club = settings.club;
  const ffspSide = input.ffspSide === 'away' ? 'away' : 'home';
  const clubTeam = { name: club.name, short: club.short, color: club.color, logo: club.logo || '' };
  const rivalDefault = { name: 'Rival', short: 'RIV', color: '#FFFFFF', logo: '' };
  const rivalIn = isObj(input.rival) ? input.rival : {};
  const rival = cleanTeam(
    { ...rivalIn, short: rivalIn.short || (rivalIn.name ? initials(rivalIn.name).slice(0, 3) : undefined) },
    rivalDefault,
  );
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) ? input.date : new Date(now).toISOString().slice(0, 10);
  const m = {
    id: uid(10),
    name: '',
    isTest: !!input.isTest,
    category: str(input.category, 40),
    date,
    ffspSide,
    home: ffspSide === 'home' ? clubTeam : rival,
    away: ffspSide === 'home' ? rival : clubTeam,
    durations: cleanDurations(input.durations, [45, 45]),
    clock: { phase: 'pre', running: false, baseMs: 0, startedAt: 0, extra: { 1: 0, 2: 0 } },
    countdownEndsAt: 0, // cuenta atrás visible en pantalla (previa o descanso)
    starters: Array.isArray(input.starters) ? input.starters.map(String).slice(0, 40) : (settings.roster || []).filter((p) => p.starter).map((p) => p.id),
    mvp: '',
    events: [],
    seq: 0,
    audit: [],
    createdAt: now,
    updatedAt: now,
    rev: 1,
  };
  m.name = str(input.name, 80) || defaultName(m);
  return m;
}

export function defaultName(m) {
  return `${m.home.short} - ${m.away.short} · ${m.date}${m.isTest ? ' · PRUEBA' : ''}`;
}

function audit(m, now, cmd, summary, extra) {
  m.audit.push({ t: now, cmd, summary, ...(extra ? { data: extra } : {}) });
  if (m.audit.length > 2000) m.audit.splice(0, m.audit.length - 2000);
}

function sortedLast(m) {
  return m.events.reduce((a, e) => (!a || e.seq > a.seq ? e : a), null);
}

function findEvent(m, id) {
  const e = m.events.find((x) => x.id === id);
  if (!e) bad('not_found', 'El evento ya no existe');
  return e;
}

function sortEvents(m) {
  m.events.sort((a, b) => a.matchMs - b.matchMs || a.seq - b.seq);
}

function setPhase(m, now, phase, base, running) {
  m.countdownEndsAt = 0;
  m.clock.phase = phase;
  m.clock.baseMs = base;
  m.clock.running = running;
  m.clock.startedAt = running ? now : 0;
}

/**
 * Aplica un comando de partido (muta `m`). Devuelve { result, event?, removed?, changed }.
 * Lanza CmdError si no es válido.
 */
export function execMatchCommand(m, name, a, ctx) {
  const { now, clientId } = ctx;
  const c = m.clock;
  const cur = clockMs(c, now);
  a = isObj(a) ? a : {};
  let result = {};
  let event = null;
  let removed = null;
  let changed = true;

  switch (name) {
    // ---------------------------------------------------------------- reloj
    case 'clock.start1':
      if (c.phase === 'first') { changed = false; break; }
      if (c.phase !== 'pre') bad('bad_phase', 'La primera parte ya se jugó');
      setPhase(m, now, 'first', 0, true);
      audit(m, now, name, 'Inicio de la primera parte');
      break;
    case 'clock.halftime':
      if (c.phase === 'halftime') { changed = false; break; }
      if (c.phase !== 'first') bad('bad_phase', 'El descanso solo se puede iniciar durante la primera parte');
      setPhase(m, now, 'halftime', cur, false);
      audit(m, now, name, `Descanso (${Math.floor(cur / 1000)} s)`);
      break;
    case 'clock.start2':
      if (c.phase === 'second') { changed = false; break; }
      if (c.phase !== 'halftime') bad('bad_phase', 'La segunda parte empieza después del descanso');
      // La segunda parte arranca en el minuto que corresponde a la duración configurada.
      setPhase(m, now, 'second', m.durations[0] * 60000, true);
      audit(m, now, name, `Inicio de la segunda parte (minuto ${m.durations[0]})`);
      break;
    case 'clock.finish':
      if (c.phase === 'finished') { changed = false; break; }
      if (c.phase === 'pre') bad('bad_phase', 'El partido todavía no ha empezado');
      setPhase(m, now, 'finished', cur, false);
      audit(m, now, name, 'Final del partido');
      break;
    case 'clock.reopen': {
      // Deshace un "Finalizar" accidental: el reloj continúa donde se paró.
      if (c.phase !== 'finished') { changed = false; break; }
      const phase = c.baseMs >= m.durations[0] * 60000 ? 'second' : 'first';
      setPhase(m, now, phase, c.baseMs, true);
      audit(m, now, name, 'Partido reabierto');
      break;
    }
    case 'clock.reset':
      // Vuelve a la previa con el reloj a cero (los eventos se conservan).
      setPhase(m, now, 'pre', 0, false);
      c.extra = { 1: 0, 2: 0 };
      audit(m, now, name, 'Reloj reiniciado a cero');
      break;
    case 'clock.countdown': {
      const min = Number(a.minutes);
      if (!Number.isFinite(min) || min < 0 || min > 90) bad('invalid', 'Minutos no válidos');
      m.countdownEndsAt = min > 0 ? now + Math.round(min * 60000) : 0;
      audit(m, now, name, min > 0 ? `Cuenta atrás de ${min} min` : 'Cuenta atrás quitada');
      break;
    }
    case 'clock.pause':
      if (!c.running) { changed = false; break; }
      if (c.phase !== 'first' && c.phase !== 'second') bad('bad_phase', 'No hay reloj en marcha');
      c.baseMs = cur; c.running = false; c.startedAt = 0;
      audit(m, now, name, 'Reloj detenido');
      break;
    case 'clock.resume':
      if (c.running) { changed = false; break; }
      if (c.phase !== 'first' && c.phase !== 'second') bad('bad_phase', 'Solo se puede reanudar en una parte');
      c.running = true; c.startedAt = now;
      audit(m, now, name, 'Reloj reanudado');
      break;
    case 'clock.set': {
      const ms = Number(a.ms);
      if (!Number.isFinite(ms) || ms < 0 || ms > 6 * 3600 * 1000) bad('invalid', 'Tiempo no válido');
      c.baseMs = Math.round(ms);
      c.startedAt = c.running ? now : 0;
      audit(m, now, name, `Tiempo corregido a ${Math.floor(ms / 1000)} s (antes ${Math.floor(cur / 1000)} s)`);
      break;
    }
    case 'clock.adjust': {
      const d = Number(a.deltaMs);
      if (!Number.isFinite(d) || Math.abs(d) > 3600 * 1000) bad('invalid', 'Ajuste no válido');
      c.baseMs = Math.max(0, Math.round(cur + d));
      c.startedAt = c.running ? now : 0;
      audit(m, now, name, `Reloj ${d >= 0 ? '+' : ''}${Math.round(d / 1000)} s`);
      break;
    }
    case 'clock.extra': {
      const p = a.period === 2 ? 2 : 1;
      const min = Math.round(clamp(Number(a.minutes), 0, 30));
      if (!Number.isFinite(min)) bad('invalid', 'Minutos no válidos');
      c.extra[p] = min;
      audit(m, now, name, `Tiempo añadido ${p}ª parte: ${min} min`);
      break;
    }

    // ------------------------------------------------------------- eventos
    case 'event.add': {
      const type = String(a.type);
      if (!EVENT_TYPES.includes(type)) bad('invalid', 'Tipo de evento no válido');
      const team = a.team === 'home' || a.team === 'away' ? a.team : null;
      if (TEAM_REQUIRED.has(type) && !team) bad('invalid', 'Falta indicar el equipo');
      // Protección frente a doble pulsación (con otro identificador de comando).
      const dup = m.events.find(
        (e) => e.type === type && e.team === team && e.createdBy === clientId && now - e.createdAt < DOUBLE_PRESS_MS,
      );
      if (dup) {
        changed = false;
        result = { eventId: dup.id, deduped: true };
        event = dup;
        break;
      }
      // Si el mando pulsó sin conexión, `at` es el instante (hora del servidor estimada) de la pulsación:
      // el evento conserva su instante real y su minuto, aunque llegue tarde.
      const at = Number(a.at);
      const realAt = Number.isFinite(at) && at <= now + 500 && now - at <= 600000 ? Math.min(at, now) : now;
      const clockAt = c.running && realAt >= c.startedAt ? clockMs(c, realAt) : cur;
      const ms = a.matchMs != null && Number.isFinite(Number(a.matchMs)) ? Math.max(0, Number(a.matchMs)) : clockAt;
      const period = periodOfPhase(c.phase);
      event = {
        id: uid(10),
        seq: ++m.seq,
        type,
        team,
        period,
        matchMs: Math.round(ms),
        realAt,
        player: str(a.player, 60),
        number: str(a.number, 3),
        playerIn: str(a.playerIn, 60),
        note: str(a.note, 200),
        rosterId: str(a.rosterId, 20),
        awaiting: ['goal', 'yellow', 'red'].includes(type) && !!team && !!a.awaiting,
        voided: false,
        createdBy: clientId || '',
        createdAt: now,
        updatedAt: now,
        edited: false,
      };
      m.events.push(event);
      sortEvents(m);
      result = { eventId: event.id };
      audit(m, now, name, `${type}${team ? ' ' + team : ''} ${minuteLabel(m.durations, period, event.matchMs)}`, { id: event.id });
      break;
    }
    case 'event.update': {
      const e = findEvent(m, String(a.id));
      const p = isObj(a.patch) ? a.patch : {};
      const before = JSON.stringify({ t: e.type, tm: e.team, ms: e.matchMs, v: e.voided, p: e.player });
      if ('type' in p) {
        if (!EVENT_TYPES.includes(p.type)) bad('invalid', 'Tipo de evento no válido');
        e.type = p.type;
      }
      if ('team' in p) e.team = p.team === 'home' || p.team === 'away' ? p.team : null;
      if (TEAM_REQUIRED.has(e.type) && !e.team) bad('invalid', 'Falta indicar el equipo');
      if ('player' in p) e.player = str(p.player, 60);
      if ('number' in p) e.number = str(p.number, 3);
      if ('playerIn' in p) e.playerIn = str(p.playerIn, 60);
      if ('note' in p) e.note = str(p.note, 200);
      if ('rosterId' in p) e.rosterId = str(p.rosterId, 20);
      e.awaiting = false;
      if ('voided' in p) e.voided = !!p.voided;
      if ('period' in p) e.period = p.period === 2 ? 2 : 1;
      if ('minute' in p) {
        const mi = Math.round(Number(p.minute));
        if (!Number.isFinite(mi) || mi < 1 || mi > 200) bad('invalid', 'Minuto no válido');
        e.matchMs = (mi - 1) * 60000;
      }
      e.edited = true;
      e.updatedAt = now;
      sortEvents(m);
      result = { eventId: e.id };
      audit(m, now, name, `Evento editado (${e.type})`, { id: e.id, before });
      break;
    }
    case 'event.resolve': {
      const e = findEvent(m, String(a.id));
      if (!e.awaiting) { changed = false; break; }
      e.awaiting = false;
      result = { eventId: e.id };
      break;
    }
    case 'event.delete': {
      const e = findEvent(m, String(a.id));
      m.events = m.events.filter((x) => x.id !== e.id);
      removed = e;
      result = { eventId: e.id };
      audit(m, now, name, `Evento eliminado (${e.type})`, { event: e });
      break;
    }
    case 'event.undo': {
      const e = sortedLast(m);
      if (!e) bad('empty', 'No hay eventos que deshacer');
      m.events = m.events.filter((x) => x.id !== e.id);
      removed = e;
      result = { eventId: e.id, type: e.type };
      audit(m, now, name, `Deshecho: ${e.type}`, { event: e });
      break;
    }

    // -------------------------------------------------------------- partido
    case 'match.update': {
      const p = isObj(a.patch) ? a.patch : {};
      if ('name' in p) m.name = str(p.name, 80) || defaultName(m);
      if ('category' in p) m.category = str(p.category, 40);
      if ('date' in p && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date))) m.date = p.date;
      if ('durations' in p) m.durations = cleanDurations(p.durations, m.durations);
      if ('home' in p) m.home = cleanTeam(p.home, m.home);
      if ('away' in p) m.away = cleanTeam(p.away, m.away);
      if (Array.isArray(p.starters)) m.starters = p.starters.map(String).slice(0, 40);
      if ('mvp' in p) m.mvp = str(p.mvp, 20);
      audit(m, now, name, 'Datos del partido editados');
      break;
    }
    default:
      bad('unknown', `Comando desconocido: ${name}`);
  }

  if (changed) {
    m.updatedAt = now;
    m.rev++;
  }
  return { result, event, removed, changed };
}

/** Proyección pública (pantallas y mando): marcador y etiquetas ya calculados. */
export function publicMatch(m) {
  const events = m.events.map((e) => ({
    id: e.id,
    seq: e.seq,
    type: e.type,
    team: e.team,
    period: e.period,
    matchMs: e.matchMs,
    minute: minuteLabel(m.durations, e.period, e.matchMs),
    realAt: e.realAt,
    player: e.player,
    number: e.number,
    playerIn: e.playerIn,
    note: e.note,
    rosterId: e.rosterId || '',
    awaiting: !!e.awaiting,
    voided: e.voided,
    edited: e.edited,
  }));
  return {
    id: m.id,
    name: m.name,
    isTest: m.isTest,
    category: m.category,
    date: m.date,
    ffspSide: m.ffspSide,
    home: m.home,
    away: m.away,
    durations: m.durations,
    clock: { ...m.clock },
    countdownEndsAt: m.countdownEndsAt || 0,
    starters: m.starters || [],
    mvp: m.mvp || '',
    score: computeScore(m.events),
    events,
    rev: m.rev,
    updatedAt: m.updatedAt,
  };
}

export function matchSummary(m) {
  const s = computeScore(m.events);
  return {
    id: m.id,
    name: m.name,
    isTest: m.isTest,
    date: m.date,
    category: m.category,
    home: m.home.name,
    away: m.away.name,
    homeShort: m.home.short,
    awayShort: m.away.short,
    score: s,
    phase: m.clock.phase,
    events: m.events.length,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

const TYPE_ES = { goal: 'Gol', foul: 'Falta', yellow: 'Tarjeta amarilla', red: 'Tarjeta roja', sub: 'Cambio', play: 'Jugada' };
export const typeName = (t) => TYPE_ES[t] || t;

export function exportCsv(m) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['id', 'minuto', 'parte', 'tiempo_s', 'tipo', 'equipo', 'equipo_nombre', 'dorsal', 'jugadora', 'entra', 'nota', 'anulado', 'hora_real_iso', 'hora_real_ms'];
  const rows = m.events.map((e) => [
    e.id,
    minuteLabel(m.durations, e.period, e.matchMs),
    e.period,
    Math.floor(e.matchMs / 1000),
    typeName(e.type),
    e.team || '',
    e.team ? m[e.team].name : '',
    e.number,
    e.player,
    e.playerIn,
    e.note,
    e.voided ? 'si' : 'no',
    new Date(e.realAt).toISOString(),
    e.realAt,
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}
