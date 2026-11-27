// Pantalla de emisión (solo lectura): "con cámara" (fondo transparente) o "sin cámara" (fondo lila).
// Rutas: /overlay/h /overlay/v /studio/h /studio/v  ·  /live (sigue el modo elegido en el mando)
import { $, esc, clockMs, fmtClock, PHASE_LABEL, TYPE_LABEL, TYPE_NOTICE, addedInfo, badge, icon, eventDetail, Link } from './common.js';

const q = new URLSearchParams(location.search);
const pm = /^\/(overlay|studio)(?:\/(h|v))?\/?$/.exec(location.pathname);
const fixedMode = pm ? (pm[1] === 'overlay' ? 'camera' : 'studio') : (['camera', 'studio'].includes(q.get('mode')) ? q.get('mode') : null);
const fixedLayout = ['h', 'v'].includes(q.get('layout')) ? q.get('layout') : (pm && pm[2]) || null;
const autoLayout = !fixedLayout && !!pm; // /overlay y /studio sin sufijo: según la proporción de la ventana
const guides = q.get('guides') === '1';
const forcedScreen = q.get('screen'); // para pruebas: ?screen=lineup
const delayOverride = {
  score: q.has('sd') ? Number(q.get('sd')) : null,
  clock: q.has('cd') ? Number(q.get('cd')) : null,
};

const SIZE = { h: [1920, 1080], v: [1080, 1920] };
const VIDEO_BAND_V = { top: 656, height: 607 }; // vídeo 16:9 a ancho completo en un lienzo 9:16, centrado
const AWAIT_MS = 12000; // tiempo máximo que se espera al nombre de la jugadora antes de animar un gol

const stage = $('#stage');
const view = $('#view');
const noticesEl = $('#notices');
const sweepEl = document.createElement('div');
sweepEl.id = 'sweep';
stage.appendChild(sweepEl);
const fxEl = document.createElement('div');
fxEl.id = 'fx';
stage.appendChild(fxEl);

let snaps = [];
let latestDisplay = null;
let extras = { squad: { roster: [], staff: {} }, sponsors: [], strip: { enabled: false, seconds: 7, messages: [], sponsors: true }, season: { scorers: [], form: { last: [], streak: null } }, club: {} };
let sig = '';
let prevScore = null;
let cur = { mode: null, layout: null, screen: null };

const link = new Link({
  role: 'view',
  onHello: (h) => { snaps = (h.snapshots || []).slice(); },
  onState: (st) => {
    snaps.push({ t: st.serverTime, match: st.match, display: st.display });
    const cut = st.serverTime - 150000;
    while (snaps.length > 1 && snaps[0].t < cut) snaps.shift();
    latestDisplay = st.display;
    extras = { squad: st.squad, sponsors: st.sponsors, strip: st.strip, season: st.season, club: st.club };
  },
});
link.start();

const pick = (t, tol = 150) => {
  let best = null;
  for (const s of snaps) { if (s.t <= t + tol) best = s; else break; }
  return best || snaps[0] || null;
};

const rosterById = (id) => extras.squad.roster.find((p) => p.id === id);
const phaseText = (m) => (PHASE_LABEL[m.clock.phase] || '').toUpperCase();
const testTag = (m) => (m.isTest ? '<span class="testtag">PRUEBA</span>' : '');

// -------------------------------------------------------------- piezas comunes
function teamBlock(t, side) {
  return `<div class="team ${side}" style="--tc:${esc(t.color)}">${badge(t, 'b')}<span class="nm">${esc(t.short)}</span></div>`;
}
const scoreHtml = (score) => `<div class="score"><span class="sc sc-h">${score.home}</span><i class="dash"></i><span class="sc sc-a">${score.away}</span></div>`;
const clockHtml = () => '<div class="clk"><small class="ph"></small><b class="cl tnum">00:00</b><em class="ad"></em></div>';

function rowHtml(e, match, compact = false) {
  const { team, text } = eventDetail(e, match);
  return `<div class="row ${e.voided ? 'voided' : ''} t-${e.type}" data-id="${esc(e.id)}" style="--tc:${esc(team?.color || '#c9b8f6')}">
    <span class="rm tnum">${esc(e.minute)}</span><span class="ri">${icon(e.type)}</span>
    <span class="rt"><b>${esc(TYPE_LABEL[e.type])}${e.voided ? ' · anulado' : ''}</b>${text && !compact ? `<span class="rd">${esc(text)}</span>` : ''}</span>
    <span class="rtm">${esc(team ? team.short : '')}</span></div>`;
}

function tlRow(e, match) {
  const { team, text } = eventDetail(e, match);
  const who = [e.number, e.player].filter(Boolean).join(' ');
  const main = e.type === 'sub' ? (text || TYPE_LABEL.sub) : (who || `${TYPE_LABEL[e.type]}${team ? ' ' + team.short : ''}`);
  const sub = e.type === 'sub' || !who ? (e.note || '') : `${TYPE_LABEL[e.type]}${team ? ' · ' + team.short : ''}${e.note ? ' · ' + e.note : ''}`;
  return `<div class="tl-row ${e.voided ? 'voided' : ''} t-${e.type}" data-id="${esc(e.id)}">
    <span class="dot"></span><span class="tl-min tnum">${esc(e.minute)}</span><span class="tl-ico">${icon(e.type)}</span>
    <span class="tl-txt"><b>${esc(main)}</b>${sub || e.voided ? `<small>${esc(sub)}${e.voided ? (sub ? ' · ' : '') + 'anulado' : ''}</small>` : ''}</span></div>`;
}

const teamsNums = (m, score) => `<div class="st-teams">${['home', 'away'].map((s) =>
  `<div class="st-t ${s}" style="--tc:${esc(m[s].color)}">${badge(m[s], 'b')}<b class="num sc sc-${s === 'home' ? 'h' : 'a'}">${score[s]}</b></div>`).join('')}</div>`;

const teamsBadges = (m) => `<div class="st-teams vs">${badge(m.home, 'b')}<span class="vs-t">VS</span>${badge(m.away, 'b')}</div>`;

/** Cinta rotatoria: mensajes del club y logos de patrocinadores. */
function stripHtml() {
  const s = extras.strip;
  if (!s.enabled) return '';
  const items = [...s.messages.map((t) => `<div class="rot-i msg">${esc(t)}</div>`),
    ...(s.sponsors ? extras.sponsors.map((x) => `<div class="rot-i logo"><img src="${esc(x.url)}" alt=""></div>`) : [])];
  if (!items.length) return '';
  return `<div class="strip"><div class="rot" data-s="${s.seconds}">${items.join('')}</div></div>`;
}

/** Estadísticas comparadas por equipo (sin contar eventos anulados). */
function statsOf(m) {
  const c = { home: { fouls: 0, yellow: 0, red: 0, sub: 0, goal: 0 }, away: { fouls: 0, yellow: 0, red: 0, sub: 0, goal: 0 } };
  for (const e of m.events) {
    if (e.voided || !e.team) continue;
    const k = e.type === 'foul' ? 'fouls' : e.type;
    if (k in c[e.team]) c[e.team][k]++;
  }
  return c;
}
function statsHtml(m) {
  const c = statsOf(m);
  const rows = [['fouls', 'Faltas'], ['yellow', 'Amarillas'], ['red', 'Rojas'], ['sub', 'Cambios']];
  return `<div class="stats">${rows.map(([k, l]) => {
    const a = c.home[k]; const b = c.away[k]; const t = Math.max(1, a + b);
    return `<div class="st-row"><b class="v tnum">${a}</b><div class="bars"><i class="bar l" style="width:${(a / t) * 100}%"></i><span>${l}</span><i class="bar r" style="width:${(b / t) * 100}%"></i></div><b class="v tnum">${b}</b></div>`;
  }).join('')}</div>`;
}

/** Línea de 90 minutos con los goles y las tarjetas de cada equipo. */
function mapHtml(m) {
  const total = m.durations[0] + m.durations[1];
  const x = (e) => Math.min(985, Math.max(15, (e.matchMs / 60000 / total) * 1000));
  const dots = m.events.filter((e) => !e.voided && e.team && ['goal', 'yellow', 'red'].includes(e.type)).map((e) => {
    const y = e.team === 'home' ? 34 : 116;
    if (e.type === 'goal') return `<circle cx="${x(e)}" cy="${y}" r="14" fill="#fff"/>`;
    return `<rect x="${x(e) - 8}" y="${y - 12}" width="16" height="24" rx="3" fill="${e.type === 'yellow' ? '#f4d03f' : '#e5484d'}"/>`;
  }).join('');
  const half = (m.durations[0] / total) * 1000;
  return `<svg class="map" viewBox="-110 0 1110 160" preserveAspectRatio="xMidYMid meet">
    <line x1="0" y1="75" x2="1000" y2="75" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>
    <line x1="${half}" y1="58" x2="${half}" y2="92" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>
    <text x="2" y="104" class="mt">0'</text><text x="${half}" y="108" class="mt" text-anchor="middle">${m.durations[0]}'</text><text x="998" y="104" class="mt" text-anchor="end">${total}'</text>
    <text x="-108" y="44" class="ml">${esc(m.home.short)}</text><text x="-108" y="132" class="ml">${esc(m.away.short)}</text>${dots}</svg>`;
}

/** Resumen de goles y tarjetas (con jugadora) de un equipo. */
function summaryHtml(m, side, onlyPeriod) {
  const list = m.events.filter((e) => !e.voided && e.team === side && ['goal', 'yellow', 'red'].includes(e.type) && (!onlyPeriod || e.period === onlyPeriod))
    .sort((a, b) => a.matchMs - b.matchMs);
  const rows = list.map((e) => {
    const who = [e.number, e.player].filter(Boolean).join(' ') || TYPE_LABEL[e.type];
    return `<div class="sm-row t-${e.type}"><span class="sm-min tnum">${esc(e.minute)}</span><span class="sm-ico">${icon(e.type)}</span><span class="sm-txt">${esc(who)}</span></div>`;
  }).join('') || '<div class="sm-empty">—</div>';
  return `<div class="sm-col"><div class="sm-h">${badge(m[side], 'b')}<b>${esc(m[side].short)}</b></div>${rows}</div>`;
}

const formHtml = () => {
  const f = extras.season.form;
  if (!f.last.length) return '';
  const dots = f.last.map((r) => `<i class="fd ${r}">${{ W: 'V', D: 'E', L: 'D' }[r]}</i>`).join('');
  const word = { W: 'victorias seguidas', D: 'empates seguidos', L: 'derrotas seguidas' };
  const streak = f.streak && f.streak.n >= 2 ? `<span class="streak">${f.streak.n} ${word[f.streak.type]}</span>` : '';
  return `<div class="form"><span class="form-l">Últimos partidos</span><span class="fds">${dots}</span>${streak}</div>`;
};

// ------------------------------------------------------------ pantallas "sin cámara"
function pitchSvg(layout) {
  const l = 'stroke="#fff" stroke-opacity=".22" stroke-width="3" fill="none"';
  return layout === 'v'
    ? `<svg class="pitch" viewBox="0 0 680 1050" preserveAspectRatio="xMidYMid slice"><g ${l}><rect x="30" y="30" width="620" height="990"/><line x1="30" y1="525" x2="650" y2="525"/><circle cx="340" cy="525" r="90"/><rect x="170" y="30" width="340" height="150"/><rect x="250" y="30" width="180" height="55"/><rect x="170" y="870" width="340" height="150"/><rect x="250" y="965" width="180" height="55"/><path d="M270 180a70 70 0 0 0 140 0M270 870a70 70 0 0 1 140 0"/></g></svg>`
    : `<svg class="pitch" viewBox="0 0 1050 680" preserveAspectRatio="xMidYMid slice"><g ${l}><rect x="30" y="30" width="990" height="620"/><line x1="525" y1="30" x2="525" y2="650"/><circle cx="525" cy="340" r="90"/><rect x="30" y="170" width="150" height="340"/><rect x="30" y="250" width="55" height="180"/><rect x="870" y="170" width="150" height="340"/><rect x="965" y="250" width="55" height="180"/><path d="M180 270a70 70 0 0 1 0 140M870 270a70 70 0 0 0 0 140"/></g></svg>`;
}

function resolveScreen(m, d) {
  const want = forcedScreen || d.screen || 'auto';
  if (want !== 'auto') return want;
  const ph = m.clock.phase;
  return ph === 'pre' ? 'prematch' : ph === 'halftime' ? 'halftime' : ph === 'finished' ? 'final' : 'live';
}

function cdHtml(m, label) {
  if (!m.countdownEndsAt) return '';
  return `<div class="sp-cd"><small>${label}</small><b class="cdv tnum">00:00</b></div>`;
}

function renderStudio(screen, m, d, score, events, layout) {
  const head = (t) => `<div class="st-live"><span>${t}</span>${testTag(m)}</div>`;
  const strip = stripHtml();
  const cls = `safe studio sp-${screen} st-${layout}`;
  switch (screen) {
    case 'prematch':
      return `<div class="${cls}">${head('EN DIRECTO')}<div class="sp-center">${teamsBadges(m)}
        ${m.countdownEndsAt ? cdHtml(m, 'COMIENZA EN') : '<div class="sp-cd"><small>PRÓXIMAMENTE</small><b class="soon">El partido va a empezar</b></div>'}
        ${formHtml()}</div>${strip}</div>`;
    case 'lineup': {
      const starters = extras.squad.roster.filter((p) => m.starters.includes(p.id)).sort((a, b) => Number(a.number) - Number(b.number));
      const rows = starters.map((p, i) => `<div class="lu-row" style="--i:${i}"><span class="lu-n">${esc(p.number)}</span><span class="lu-name">${esc(p.name)}</span></div>`).join('')
        || '<div class="empty">Elige las titulares en Ajustes → Alineación del partido</div>';
      const club = m.ffspSide === 'home' ? m.home : m.away;
      return `${pitchSvg(layout)}<div class="${cls}">${head('ALINEACIÓN')}
        <div class="lu-team">${badge(club, 'b')}<b>${esc(club.name)}</b></div>
        <div class="lu-list">${rows}</div>
        ${extras.squad.staff.coach ? `<div class="lu-coach"><small>ENTRENADOR</small><b>${esc(extras.squad.staff.coach)}</b></div>` : ''}${strip}</div>`;
    }
    case 'halftime':
      return `<div class="${cls}">${head('DESCANSO')}
        <div class="sp-left">${teamsNums(m, score)}${cdHtml(m, '2ª PARTE EN')}</div>
        <div class="sp-right"><div class="blk-h">Resumen de la primera parte</div><div class="sm">${summaryHtml(m, 'home', 1)}${summaryHtml(m, 'away', 1)}</div>
          <div class="blk-h">Estadísticas</div>${statsHtml(m)}</div>${strip}</div>`;
    case 'final': {
      const mvp = rosterById(m.mvp);
      const next = extras.club.nextMatch;
      return `<div class="${cls}">${head('FINAL')}
        <div class="sp-left">${teamsNums(m, score)}
          ${mvp ? `<div class="mvp"><small>JUGADORA DEL PARTIDO</small><b>${esc(mvp.number)} · ${esc(mvp.name)}</b></div>` : ''}
          ${formHtml()}${next ? `<div class="next"><small>PRÓXIMO PARTIDO</small><b>${esc(next)}</b></div>` : ''}</div>
        <div class="sp-right"><div class="blk-h">Goles y tarjetas</div><div class="sm">${summaryHtml(m, 'home')}${summaryHtml(m, 'away')}</div>
          <div class="blk-h">Estadísticas</div>${statsHtml(m)}<div class="blk-h">El partido minuto a minuto</div>${mapHtml(m)}</div>${strip}</div>`;
    }
    case 'stats':
      return `<div class="${cls}">${head('ESTADÍSTICAS')}
        <div class="sp-left">${teamsNums(m, score)}${clockHtml()}</div>
        <div class="sp-right">${statsHtml(m)}<div class="blk-h">El partido minuto a minuto</div>${mapHtml(m)}</div>${strip}</div>`;
    case 'sponsors': {
      const s = extras.strip;
      const items = [...extras.sponsors.map((x) => `<div class="rot-i logo big"><img src="${esc(x.url)}" alt=""></div>`),
        ...s.messages.map((t) => `<div class="rot-i msg">${esc(t)}</div>`)];
      return `<div class="${cls}">${head('GRACIAS')}<div class="sp-center"><div class="thanks">A NUESTROS PATROCINADORES</div>
        <div class="rot big" data-s="${s.seconds}">${items.join('') || '<div class="rot-i msg on">Gracias por acompañarnos</div>'}</div>
        <div class="mini-score">${esc(m.home.short)} <b>${score.home}</b> – <b>${score.away}</b> ${esc(m.away.short)}</div></div></div>`;
    }
    default: { // live
      const rows = events.slice(0, 40).map((e) => tlRow(e, m)).join('') || '<div class="empty">Todavía no hay eventos</div>';
      return `<div class="${cls} st-live-screen">
        <div class="st-main">${head('EN DIRECTO')}${teamsNums(m, score)}
          <div class="st-clock"><b class="cl tnum">00:00</b><span class="ph"></span><em class="ad"></em></div>${strip}</div>
        <div class="timeline"><div class="tl-line"></div>${rows}</div></div>`;
    }
  }
}

// -------------------------------------------------- cámara (marcador sobre el vídeo)
function renderCameraH(m, d, score, events) {
  const recent = events.filter((e) => !e.voided).slice(0, d.recentEvents);
  return `<div class="safe cam-h">
    <div class="sb">${teamBlock(m.home, 'home')}${scoreHtml(score)}${teamBlock(m.away, 'away')}${clockHtml()}</div>
    ${testTag(m)}
    <div class="recent">${recent.map((e) => rowHtml(e, m, true)).join('')}</div>
  </div>`;
}

function renderCameraV(m, d, score, events) {
  const recent = events.filter((e) => !e.voided).slice(0, d.recentEvents);
  return `<div class="safe cam-v">
    <div class="cv-board">
      <div class="cv-top">${badge(m.home, 'b')}<span class="nm" style="--tc:${esc(m.home.color)}">${esc(m.home.short)}</span>${scoreHtml(score)}<span class="nm r" style="--tc:${esc(m.away.color)}">${esc(m.away.short)}</span>${badge(m.away, 'b')}</div>
      ${clockHtml()}
    </div>
    ${testTag(m)}
  </div>
  <div class="cv-recent">${recent.map((e) => rowHtml(e, m, false)).join('')}</div>`;
}

// ------------------------------------------------------------------ avisos y gol
const seen = new Map();
let seenInit = false;
const queue = [];
let showing = false;

function goalCounts(e, match) {
  const same = (x) => x.type === 'goal' && !x.voided && x.team === e.team && (e.rosterId ? x.rosterId === e.rosterId : (x.player && x.player === e.player));
  const today = match.events.filter((x) => same(x) && x.seq <= e.seq).length;
  const s = extras.season.scorers.find((x) => (e.rosterId && rosterById(e.rosterId)?.name === x.name) || (!e.rosterId && x.name === e.player));
  return { today, season: s ? s.goals : 0 };
}

function processNotices(match, display, refNow, studio) {
  const ids = new Set();
  const club = match.ffspSide;
  for (const e of match.events) {
    ids.add(e.id);
    const prev = seen.get(e.id);
    if (!prev) {
      // Esperar (hasta 12 s) a que el operador diga qué jugadora ha sido.
      if (e.awaiting && refNow - e.realAt < AWAIT_MS) continue;
      seen.set(e.id, { voided: e.voided });
      if (seenInit && !e.voided && display.noticeTypes?.[e.type]) {
        queue.push({ e, match, voided: false, goalfx: studio && display.goalAnim && e.type === 'goal' && e.team === club });
      }
    } else {
      if (seenInit && !prev.voided && e.voided && e.type === 'goal') queue.push({ e, match, voided: true, goalfx: false });
      prev.voided = e.voided;
    }
  }
  for (const id of [...seen.keys()]) if (!ids.has(id)) seen.delete(id);
  seenInit = true;
  if (!showing && queue.length) showNext(display);
}

function showNext(display) {
  const item = queue.shift();
  if (!item) { showing = false; return; }
  showing = true;
  if (item.goalfx) return showGoalFx(item, display);
  const { e, match, voided } = item;
  const { team, text } = eventDetail(e, match);
  const title = voided ? 'GOL ANULADO' : TYPE_NOTICE[e.type];
  const el = document.createElement('div');
  el.className = `notice t-${e.type} ${voided ? 'voided' : ''}`;
  el.style.setProperty('--tc', team?.color || '#c9b8f6');
  const lead = team ? badge(team, 'b') : `<span class="ni">${icon(e.type)}</span>`;
  const bigIcon = e.type === 'yellow' || e.type === 'red' ? `<span class="ni">${icon(e.type)}</span>` : lead;
  el.innerHTML = `${bigIcon}<div class="nb"><div class="nt">${esc(title)}</div><div class="ns">${team ? `<b>${esc(team.short)}</b>` : ''}${text ? `${team ? ' · ' : ''}${esc(text)}` : ''}</div></div><div class="nm2 tnum">${esc(e.minute)}</div>`;
  noticesEl.appendChild(el);
  const secs = queue.length > 1 ? Math.min(3, display.noticeSeconds) : display.noticeSeconds;
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.remove(); showNext(display); }, 450);
  }, secs * 1000);
}

function showGoalFx({ e, match }, display) {
  const team = match[e.team];
  const { today, season } = goalCounts(e, match);
  const who = e.player;
  const lines = [];
  if (who) lines.push(today <= 1 ? 'Primer gol hoy' : `${today}.º gol hoy`);
  if (who && season > today) lines.push(`${season} en la temporada`);
  const sp = extras.strip.enabled && extras.sponsors.length ? `<div class="fx-sp"><small>CON EL APOYO DE</small><img src="${esc(extras.sponsors[0].url)}" alt=""></div>` : '';
  const el = document.createElement('div');
  el.className = 'goalfx';
  el.style.setProperty('--tc', team.color);
  el.innerHTML = `<div class="fx-flash"></div><div class="fx-in">
    <div class="fx-word">GOL</div>
    <div class="fx-team">${badge(team, 'b')}</div>
    ${who ? `<div class="fx-num">${esc(e.number || '')}</div><div class="fx-name">${esc(who)}</div>` : `<div class="fx-name">${esc(team.name)}</div>`}
    <div class="fx-min tnum">${esc(e.minute)}</div>
    ${lines.length ? `<div class="fx-lines">${lines.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}${sp}</div>`;
  fxEl.appendChild(el);
  const ms = Math.max(5000, display.noticeSeconds * 1000);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.remove(); showNext(display); }, 600);
  }, ms);
}

// ---------------------------------------------------------------- bucle
function fit(layout) {
  const [W, H] = SIZE[layout];
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${(innerWidth - W * s) / 2}px`;
  stage.style.top = `${(innerHeight - H * s) / 2}px`;
}

function tick() {
  const now = link.now();
  const latest = snaps[snaps.length - 1];
  if (!latest) return;
  const display = latestDisplay || latest.display;
  const mode = fixedMode || display.mode;
  const layout = fixedLayout || (autoLayout ? (innerHeight > innerWidth ? 'v' : 'h') : display.layout);
  const camera = mode === 'camera';
  // El retraso solo tiene sentido con vídeo (modo con cámara).
  const sd = camera ? (delayOverride.score ?? display.delays.scoreMs) : 0;
  const cd = camera ? (delayOverride.clock ?? display.delays.clockMs) : 0;
  const sSnap = sd ? pick(now - sd) : latest;
  const cSnap = cd ? pick(now - cd) : latest;
  const m = sSnap.match;
  const events = [...m.events].sort((a, b) => b.seq - a.seq);
  const margins = display.margins[layout];
  const screen = camera ? 'camera' : resolveScreen(m, display);

  const key = JSON.stringify([mode, layout, screen, margins, guides, m.home, m.away, m.score, m.name, m.category, m.date, m.isTest, m.starters, m.mvp, !!m.countdownEndsAt,
    events.map((e) => [e.id, e.type, e.team, e.minute, e.voided, e.player, e.number, e.playerIn, e.note]),
    display.recentEvents, display.whiteLogos, extras.squad, extras.sponsors, extras.strip, extras.club.nextMatch, extras.season,
    screen === 'halftime' || screen === 'final' || screen === 'stats' ? m.clock.phase : '']);

  const changedScreen = cur.mode !== mode || cur.layout !== layout || cur.screen !== screen;
  if (cur.mode !== mode || cur.layout !== layout) {
    document.body.className = `mode-${mode} layout-${layout}`;
    fit(layout);
    sig = '';
  }
  document.body.classList.toggle('white-logos', !!display.whiteLogos);
  document.body.classList.toggle('spon-bg', !!extras.strip.whiteBadge);

  if (key !== sig || changedScreen) {
    sig = key;
    stage.style.setProperty('--mt', `${margins.top}px`);
    stage.style.setProperty('--mr', `${margins.right}px`);
    stage.style.setProperty('--mb', `${margins.bottom}px`);
    stage.style.setProperty('--ml', `${margins.left}px`);
    let html;
    if (camera) html = layout === 'h' ? renderCameraH(m, display, m.score, events) : renderCameraV(m, display, m.score, events);
    else html = renderStudio(screen, m, display, m.score, events, layout);
    if (guides) html += guideHtml(layout, camera);
    view.innerHTML = html;
    if (prevScore && !changedScreen) {
      if (prevScore.home !== m.score.home) view.querySelectorAll('.sc-h').forEach((n) => n.classList.add('bump'));
      if (prevScore.away !== m.score.away) view.querySelectorAll('.sc-a').forEach((n) => n.classList.add('bump'));
    }
    prevScore = { ...m.score };
    if (changedScreen) {
      const had = cur.screen !== null;
      cur = { mode, layout, screen };
      view.classList.remove('enter');
      void view.offsetWidth;
      view.classList.add('enter');
      if (had && !camera) { sweepEl.classList.remove('go'); void sweepEl.offsetWidth; sweepEl.classList.add('go'); }
    }
  }

  // Reloj y estado: pueden ir con su propio retraso.
  const cm = cSnap.match;
  const clockAt = cd ? now - cd : now;
  const ms = clockMs(cm.clock, clockAt);
  const { over, announced } = addedInfo(cm, ms);
  view.querySelectorAll('.cl').forEach((n) => { const t = fmtClock(ms); if (n.textContent !== t) n.textContent = t; });
  view.querySelectorAll('.ph').forEach((n) => { const t = phaseText(cm); if (n.textContent !== t) n.textContent = t; });
  view.querySelectorAll('.ad').forEach((n) => {
    const t = cm.clock.phase === 'first' || cm.clock.phase === 'second' ? (over ? `+${over}` : (announced ? `+${announced}` : '')) : '';
    if (n.textContent !== t) n.textContent = t;
    n.classList.toggle('on', !!t);
    n.classList.toggle('over', !!over);
  });
  document.body.dataset.phase = cm.clock.phase;

  // Cuenta atrás (previa y descanso) y cinta rotatoria
  if (m.countdownEndsAt) {
    const left = Math.max(0, m.countdownEndsAt - now);
    const t = fmtClock(left);
    view.querySelectorAll('.cdv').forEach((n) => { if (n.textContent !== t) n.textContent = t; });
  }
  view.querySelectorAll('.rot').forEach((r) => {
    const items = r.children;
    if (!items.length) return;
    const i = Math.floor(now / ((Number(r.dataset.s) || 7) * 1000)) % items.length;
    [...items].forEach((it, k) => it.classList.toggle('on', k === i));
  });

  processNotices(m, display, now - sd, !camera);
}

function guideHtml(layout, camera) {
  const [W, H] = SIZE[layout];
  const mg = latestDisplay.margins[layout];
  let h = `<div class="mguide" style="left:${mg.left}px;top:${mg.top}px;width:${W - mg.left - mg.right}px;height:${H - mg.top - mg.bottom}px"></div>`;
  if (camera && layout === 'v') h += `<div class="vguide" style="top:${VIDEO_BAND_V.top}px;height:${VIDEO_BAND_V.height}px"><span>Vídeo 16:9 (1080 × 607)</span></div>`;
  return h;
}

addEventListener('resize', () => { if (cur.layout) fit(cur.layout); sig = ''; });
setInterval(tick, 100);
