// Pantalla de emisión (solo lectura): "con cámara" (fondo transparente) o "sin cámara" (fondo negro).
// Rutas: /overlay/h /overlay/v /studio/h /studio/v  ·  /live (sigue el modo elegido en el mando)
import { $, esc, clockMs, fmtClock, PHASE_LABEL, TYPE_LABEL, TYPE_NOTICE, addedInfo, badge, icon, eventDetail, Link } from './common.js';

const q = new URLSearchParams(location.search);
const pm = /^\/(overlay|studio)(?:\/(h|v))?\/?$/.exec(location.pathname);
const fixedMode = pm ? (pm[1] === 'overlay' ? 'camera' : 'studio') : (['camera', 'studio'].includes(q.get('mode')) ? q.get('mode') : null);
const fixedLayout = ['h', 'v'].includes(q.get('layout')) ? q.get('layout') : (pm && pm[2]) || null;
const autoLayout = !fixedLayout && !!pm; // /overlay y /studio sin sufijo: según la proporción de la ventana
const guides = q.get('guides') === '1';
const delayOverride = {
  score: q.has('sd') ? Number(q.get('sd')) : null,
  clock: q.has('cd') ? Number(q.get('cd')) : null,
};

const SIZE = { h: [1920, 1080], v: [1080, 1920] };
const VIDEO_BAND_V = { top: 656, height: 607 }; // vídeo 16:9 a ancho completo en un lienzo 9:16, centrado

const stage = $('#stage');
const view = $('#view');
const noticesEl = $('#notices');

let snaps = [];
let latestDisplay = null;
let sig = '';
let prevScore = null;
let cur = { mode: null, layout: null };

const link = new Link({
  role: 'view',
  onHello: (h) => { snaps = (h.snapshots || []).slice(); },
  onState: (st) => {
    snaps.push({ t: st.serverTime, match: st.match, display: st.display });
    const cut = st.serverTime - 150000;
    while (snaps.length > 1 && snaps[0].t < cut) snaps.shift();
    latestDisplay = st.display;
  },
});
link.start();

const pick = (t, tol = 150) => {
  let best = null;
  for (const s of snaps) { if (s.t <= t + tol) best = s; else break; }
  return best || snaps[0] || null;
};

// ---------------------------------------------------------------- plantillas
const phaseText = (m) => (PHASE_LABEL[m.clock.phase] || '').toUpperCase();

function teamBlock(t, side, cls = '') {
  return `<div class="team ${side} ${cls}" style="--tc:${esc(t.color)}">${badge(t, 'b')}<span class="nm">${esc(t.short)}</span></div>`;
}

function scoreHtml(score) {
  return `<div class="score"><span class="sc sc-h">${score.home}</span><i class="dash"></i><span class="sc sc-a">${score.away}</span></div>`;
}

function clockHtml() {
  return `<div class="clk"><small class="ph"></small><b class="cl tnum">00:00</b><em class="ad"></em></div>`;
}

function rowHtml(e, match, compact = false) {
  const { team, text } = eventDetail(e, match);
  return `<div class="row ${e.voided ? 'voided' : ''} t-${e.type}" data-id="${esc(e.id)}" style="--tc:${esc(team?.color || '#c9b8f6')}">
    <span class="rm tnum">${esc(e.minute)}</span><span class="ri">${icon(e.type)}</span>
    <span class="rt"><b>${esc(TYPE_LABEL[e.type])}${e.voided ? ' · anulado' : ''}</b>${text && !compact ? `<span class="rd">${esc(text)}</span>` : ''}</span>
    <span class="rtm">${esc(team ? team.short : '')}</span></div>`;
}

function testTag(m) { return m.isTest ? '<span class="testtag">PRUEBA</span>' : ''; }

function renderCameraH(m, d, score, events) {
  const n = d.recentEvents;
  const recent = events.filter((e) => !e.voided).slice(0, n);
  return `<div class="safe cam-h">
    <div class="sb">${teamBlock(m.home, 'home')}${scoreHtml(score)}${teamBlock(m.away, 'away')}${clockHtml()}</div>
    ${testTag(m)}
    <div class="recent">${recent.map((e) => rowHtml(e, m, true)).join('')}</div>
  </div>`;
}

function renderCameraV(m, d, score, events) {
  const n = d.recentEvents;
  const recent = events.filter((e) => !e.voided).slice(0, n);
  return `<div class="safe cam-v">
    <div class="cv-board">
      <div class="cv-top">${badge(m.home, 'b')}<span class="nm" style="--tc:${esc(m.home.color)}">${esc(m.home.short)}</span>${scoreHtml(score)}<span class="nm r" style="--tc:${esc(m.away.color)}">${esc(m.away.short)}</span>${badge(m.away, 'b')}</div>
      ${clockHtml()}
    </div>
    ${testTag(m)}
  </div>
  <div class="cv-recent">${recent.map((e) => rowHtml(e, m, false)).join('')}</div>`;
}

function renderStudio(m, d, score, events, layout) {
  const meta = [m.category, m.date].filter(Boolean).join(' · ');
  const rows = events.slice(0, 40).map((e) => rowHtml(e, m, false)).join('') || '<div class="empty">Todavía no hay eventos</div>';
  return `<div class="safe studio st-${layout}">
    <div class="st-meta"><span>${esc(m.name)}</span><span>${esc(meta)}</span>${testTag(m)}</div>
    <div class="st-board">
      <div class="st-team home" style="--tc:${esc(m.home.color)}">${badge(m.home, 'b')}<span class="nm">${esc(layout === 'h' ? m.home.name : m.home.short)}</span></div>
      ${scoreHtml(score)}
      <div class="st-team away" style="--tc:${esc(m.away.color)}">${badge(m.away, 'b')}<span class="nm">${esc(layout === 'h' ? m.away.name : m.away.short)}</span></div>
    </div>
    ${clockHtml()}
    <div class="st-line"><span>Línea del tiempo</span></div>
    <div class="timeline">${rows}</div>
  </div>`;
}

// ------------------------------------------------------------------ avisos
const seen = new Map();
let seenInit = false;
const queue = [];
let showing = false;

function processNotices(match, display) {
  const ids = new Set();
  for (const e of match.events) {
    ids.add(e.id);
    const prev = seen.get(e.id);
    if (!prev) {
      seen.set(e.id, { voided: e.voided });
      if (seenInit && !e.voided && display.noticeTypes?.[e.type]) queue.push({ e, match, voided: false });
    } else {
      if (seenInit && !prev.voided && e.voided && e.type === 'goal') queue.push({ e, match, voided: true });
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

  const key = JSON.stringify([mode, layout, margins, guides, m.home, m.away, m.score, m.name, m.category, m.date, m.isTest,
    events.map((e) => [e.id, e.type, e.team, e.minute, e.voided, e.player, e.number, e.playerIn, e.note]),
    display.recentEvents]);

  if (cur.mode !== mode || cur.layout !== layout) {
    cur = { mode, layout };
    document.body.className = `mode-${mode} layout-${layout}`;
    fit(layout);
  }

  if (key !== sig) {
    sig = key;
    stage.style.setProperty('--mt', `${margins.top}px`);
    stage.style.setProperty('--mr', `${margins.right}px`);
    stage.style.setProperty('--mb', `${margins.bottom}px`);
    stage.style.setProperty('--ml', `${margins.left}px`);
    let html;
    if (camera) html = layout === 'h' ? renderCameraH(m, display, m.score, events) : renderCameraV(m, display, m.score, events);
    else html = renderStudio(m, display, m.score, events, layout);
    if (guides) html += guideHtml(layout, camera);
    view.innerHTML = html;
    if (prevScore) {
      if (prevScore.home !== m.score.home) view.querySelectorAll('.sc-h').forEach((n) => n.classList.add('bump'));
      if (prevScore.away !== m.score.away) view.querySelectorAll('.sc-a').forEach((n) => n.classList.add('bump'));
    }
    prevScore = { ...m.score };
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

  if (camera) processNotices(m, display);
  else { seen.clear(); seenInit = false; }
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
