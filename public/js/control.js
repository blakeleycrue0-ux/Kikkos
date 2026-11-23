// Mando de retransmisión (móvil). Muestra siempre el estado CONFIRMADO por el servidor;
// las acciones que aún no han llegado quedan visibles como pendientes o fallidas.
import { $, $$, esc, clockMs, fmtClock, PHASE_LABEL, TYPE_LABEL, addedInfo, badge, icon, eventDetail, Link, getClientId } from './common.js';

const EV_ORDER = ['goal', 'foul', 'yellow', 'red', 'sub'];
const PRESETS = [['Benjamín', 25], ['Alevín', 30], ['Infantil', 35], ['Cadete', 40], ['Juvenil', 45], ['Sénior', 45]];
const OUTBOX_KEY = 'ffsp_outbox_v1';

const S = { s: null, admin: null, tab: 'live', conn: 'connecting', role: null, outbox: [], filter: 'all', clipScope: 'match', openSecs: new Set(['sec-match']), lastAdded: null };
try { S.outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { S.outbox = []; }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const saveOutbox = () => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(S.outbox.slice(-60))); } catch { /* */ } };

// ------------------------------------------------------------- conexión
const link = new Link({
  role: 'control',
  onStatus: (st) => { S.conn = st; if (st === 'online') for (const a of S.outbox) if (a.status === 'sent') a.status = 'pending'; renderConn(); flush(); },
  onHello: (h) => {
    S.role = h.role;
    if (h.role === 'control') { $('#login').hidden = true; $('#app').hidden = false; flush(); } else { $('#app').hidden = true; $('#login').hidden = false; }
    renderConn();
  },
  onState: (st) => { S.s = st; onState(); },
  onAdmin: (a) => { S.admin = a; onAdmin(); },
  onAck: (m) => onAck(m),
});

async function api(path, opts) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts });
  return r;
}

function flush() {
  if (link.status !== 'online' || S.role !== 'control') return;
  for (const a of S.outbox) {
    if (a.status !== 'pending') continue;
    if (link.send({ t: 'cmd', id: a.id, name: a.name, args: a.args })) {
      a.status = 'sent';
      a.sentAt = Date.now();
    }
  }
  saveOutbox();
  renderPending();
}

setInterval(() => {
  // Sin acuse en 8 s: vuelve a pendiente (se reenvía con el mismo identificador: no duplica).
  let ch = false;
  for (const a of S.outbox) if (a.status === 'sent' && Date.now() - a.sentAt > 8000) { a.status = 'pending'; ch = true; }
  if (ch) flush();
  renderPending();
}, 1000);

function act(name, args = {}, label = '', opts = {}) {
  const a = { id: uuid(), name, args, label: label || name, status: 'pending', error: '', at: Date.now(), quiet: !!opts.quiet, after: opts.after };
  if (name === 'event.add') a.args = { ...args, at: Math.round(link.now()) };
  S.outbox.push(a);
  saveOutbox();
  flush();
  renderPending();
  return a;
}

function onAck(m) {
  const i = S.outbox.findIndex((a) => a.id === m.id);
  if (i < 0) return;
  const a = S.outbox[i];
  if (m.ok) {
    S.outbox.splice(i, 1);
    saveOutbox();
    if (navigator.vibrate) navigator.vibrate(18);
    if (!a.quiet) afterOk(a, m);
  } else {
    a.status = 'failed';
    a.error = m.error?.message || 'No se pudo completar';
    saveOutbox();
    toast(`${a.label}: ${a.error}`, { bad: true, ms: 6000 });
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  }
  renderPending();
}

function afterOk(a, m) {
  const r = m.result || {};
  if (a.name === 'event.add') {
    S.lastAdded = r.eventId;
    toast(`${a.label} registrado${r.deduped ? ' (ya estaba)' : ''}`, { action: { label: 'Añadir detalle', fn: () => openEventSheet(r.eventId) } });
  } else if (a.name === 'event.undo') toast(`Deshecho: ${TYPE_LABEL[r.type] || 'evento'}`);
  else if (a.name === 'key.regenerate') { toast('Nueva clave generada'); api('/api/login', { method: 'POST', body: JSON.stringify({ key: r.key }) }).then(() => link.wake()); }
  else if (a.name === 'obs.fixBuffer') toast('Búfer de OBS ajustado');
  else if (a.name === 'obs.checkBuffer') toast('Búfer comprobado');
  else if (a.name === 'clips.retry') toast('Reintentando clip…');
  else if (a.label && a.label !== a.name) toast(a.label);
  a.after?.(m);
}

// -------------------------------------------------------------- avisos
function toast(msg, { bad = false, action, ms = 3500 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${bad ? 'bad' : ''}`;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { el.remove(); action.fn(); };
    el.appendChild(b);
  }
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), action ? Math.max(ms, 6000) : ms);
}

function openSheet(html, mount) {
  $('#sheet').innerHTML = html;
  $('#sheetWrap').hidden = false;
  mount?.($('#sheet'));
}
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; }
$('#sheetWrap').addEventListener('click', (e) => { if (e.target.id === 'sheetWrap') closeSheet(); });

function confirmSheet(title, msg, okLabel, fn, danger = false) {
  openSheet(`<h1>${esc(title)}</h1><p class="muted">${esc(msg)}</p><div class="actions"><button class="btn ${danger ? 'danger' : 'primary'} block" id="cfOk">${esc(okLabel)}</button><button class="btn ghost block" id="cfNo">Cancelar</button></div>`, (sh) => {
    $('#cfNo', sh).onclick = closeSheet;
    $('#cfOk', sh).onclick = () => { closeSheet(); fn(); };
  });
}

// ----------------------------------------------------------- cabecera
const m = () => S.s?.match;
const team = (side) => m()?.[side];

function renderConn() {
  const el = $('#connChip');
  const off = $('#offline');
  if (link.status === 'online' && S.role === 'control') {
    el.className = 'chip conn ok';
    el.textContent = link.rtt != null ? `Conectado · ${Math.round(link.rtt)} ms` : 'Conectado';
    off.hidden = true;
  } else if (link.status === 'connecting') {
    el.className = 'chip conn warn';
    el.textContent = 'Conectando…';
    off.hidden = true;
  } else {
    el.className = 'chip conn bad';
    el.textContent = 'Sin conexión';
    off.hidden = false;
    off.textContent = 'Sin conexión con el portátil. Lo que pulses quedará PENDIENTE y se enviará al reconectar. Comprueba que el móvil y el portátil están en la misma red.';
  }
}
setInterval(renderConn, 2000);

function renderObsChip() {
  const o = S.admin?.obs;
  const el = $('#obsChip');
  let cls = 'chip obs'; let txt = 'OBS';
  if (!o || o.state === 'disabled') { txt = 'OBS apagado'; }
  else if (o.state === 'connected') { cls += o.replayActive ? ' ok' : ' warn'; txt = o.replayActive ? 'OBS' : 'OBS sin búfer'; }
  else if (o.state === 'connecting') { cls += ' warn'; txt = 'OBS…'; }
  else { cls += ' bad'; txt = 'OBS sin conexión'; }
  el.className = cls;
  el.textContent = txt;
}

// ---------------------------------------------------------- pendientes
function renderPending() {
  const box = $('#pend');
  const now = Date.now();
  const items = S.outbox.filter((a) => a.status === 'failed' || link.status !== 'online' || now - a.at > 1500);
  if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = items.map((a) => `<div class="pi ${a.status}" data-id="${esc(a.id)}">
    ${a.status === 'failed' ? '' : '<span class="spin"></span>'}
    <div class="pl"><b>${esc(a.label)}</b><small>${a.status === 'failed' ? `No se pudo: ${esc(a.error)}` : (link.status === 'online' ? 'Enviando, esperando confirmación…' : 'Pendiente: sin conexión')}</small></div>
    ${a.status === 'failed' ? '<button class="btn sm" data-retry>Reintentar</button>' : ''}
    <button class="btn sm ghost" data-discard>Descartar</button></div>`).join('');
}
$('#pend').addEventListener('click', (e) => {
  const row = e.target.closest('.pi');
  if (!row) return;
  const i = S.outbox.findIndex((a) => a.id === row.dataset.id);
  if (i < 0) return;
  if (e.target.closest('[data-discard]')) { S.outbox.splice(i, 1); saveOutbox(); renderPending(); }
  if (e.target.closest('[data-retry]')) { S.outbox[i].status = 'pending'; S.outbox[i].error = ''; S.outbox[i].at = Date.now(); flush(); }
});

// ---------------------------------------------------------------- tabs
function setTab(t) {
  S.tab = t;
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('.tab').forEach((s) => { s.hidden = s.id !== `tab-${t}`; });
  window.scrollTo(0, 0);
  renderTab(true);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) setTab(g.dataset.goto); });

function onState() {
  $('#matchTitle').textContent = m()?.name || '';
  renderTab(false);
  if (!$('#sheetWrap').hidden) return;
}
function onAdmin() {
  renderObsChip();
  const badgeEl = $('#clipBadge');
  const active = (S.admin?.clips || []).filter((c) => c.state === 'pending' || c.state === 'processing' || c.state === 'error').length;
  badgeEl.hidden = !active;
  badgeEl.textContent = active;
  renderTab(false);
}

function renderTab(force) {
  if (!S.s) return;
  const focusIn = document.activeElement && $(`#tab-${S.tab}`)?.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!force && focusIn && (S.tab === 'air' || S.tab === 'more')) return;
  ({ live: renderLive, events: renderEvents, clips: renderClips, air: renderAir, more: renderMore })[S.tab]();
}

// ------------------------------------------------------------- Directo
const partSig = {};
function setPart(id, html, sig) {
  const el = $(`#${id}`);
  if (!el) return;
  if (partSig[id] === sig) return;
  partSig[id] = sig;
  el.innerHTML = html;
}

function renderLive() {
  const root = $('#tab-live');
  if (!root.dataset.built) {
    root.dataset.built = '1';
    root.innerHTML = `<div id="liveScore"></div><div id="livePhase"></div><div id="liveClockTools"></div>
      <h2>Registrar</h2><div id="liveGrid"></div><div id="liveBtns"></div>
      <h2>Últimos eventos</h2><div id="liveRecent" class="recent-list"></div>
      <h2>Pantalla de emisión</h2><div id="liveAir"></div>`;
  }
  const mt = m();
  const sc = mt.score;
  const scoreSig = JSON.stringify([mt.home, mt.away, sc, mt.isTest, mt.clock.phase]);
  setPart('liveScore', `<div class="card score-card">
    ${mt.isTest ? '<span class="testbadge">PARTIDO DE PRUEBA</span>' : ''}
    <div class="sc-row">
      <div class="sc-team" style="--tc:${esc(mt.home.color)}"><span class="sc-short">${esc(mt.home.short)}</span><span class="sc-name">${esc(mt.home.name)}</span></div>
      <div class="sc-num"><b>${sc.home}</b><i></i><b>${sc.away}</b></div>
      <div class="sc-team r" style="--tc:${esc(mt.away.color)}"><span class="sc-short">${esc(mt.away.short)}</span><span class="sc-name">${esc(mt.away.name)}</span></div>
    </div>
    <div class="sc-clock"><span class="phase">${esc(PHASE_LABEL[mt.clock.phase])}</span><b class="clock tnum" id="liveClock">00:00</b><span class="added" id="liveAdded"></span></div>
  </div>`, scoreSig);

  const ph = mt.clock.phase;
  const btn = (a, label, cls = '', extra = '') => `<button class="btn ${cls}" data-act="${a}" ${extra}>${label}</button>`;
  let phase = '';
  if (ph === 'pre') phase = btn('clock.start1', 'Iniciar primera parte', 'primary');
  else if (ph === 'first') phase = btn('confirm.halftime', 'Descanso', 'primary') + btn('confirm.finish', 'Finalizar partido', 'ghost');
  else if (ph === 'halftime') phase = btn('clock.start2', `Iniciar segunda parte (min ${mt.durations[0]})`, 'primary') + btn('confirm.finish', 'Finalizar partido', 'ghost');
  else if (ph === 'second') phase = btn('confirm.finish', 'Finalizar partido', 'primary');
  else phase = '<div class="card muted" style="text-align:center">Partido finalizado. Los eventos se pueden seguir corrigiendo.</div>';
  setPart('livePhase', `<div class="phase-actions">${phase}</div>`, ph + mt.durations.join());

  const running = mt.clock.running;
  const per = ph === 'second' || ph === 'finished' ? 2 : 1;
  const tools = ph === 'pre' ? '' : `<div class="card" style="display:grid;gap:10px">
      <div class="clock-tools">
        <button class="btn" data-act="adj" data-d="-60000">−1 min</button><button class="btn" data-act="adj" data-d="-10000">−10 s</button>
        <button class="btn" data-act="adj" data-d="10000">+10 s</button><button class="btn" data-act="adj" data-d="60000">+1 min</button></div>
      <div class="row-btns">
        ${ph === 'first' || ph === 'second' ? `<button class="btn" data-act="${running ? 'clock.pause' : 'clock.resume'}">${running ? 'Detener reloj' : 'Reanudar reloj'}</button>` : ''}
        <button class="btn" data-act="setclock">Fijar tiempo…</button></div>
      <div class="extra-row"><span class="lbl">Tiempo añadido ${per}ª parte</span>
        <div class="stepper"><button class="btn sm" data-act="extra" data-d="-1">−</button><b>+${mt.clock.extra[per] || 0}</b><button class="btn sm" data-act="extra" data-d="1">+</button></div></div>
    </div>`;
  setPart('liveClockTools', tools, [ph, running, mt.clock.extra[per]].join());

  const col = (side) => {
    const t = mt[side];
    return `<div class="col" style="--tc:${esc(t.color)}"><h3>${esc(t.short)}</h3>
      <button class="ev goal" data-ev="goal" data-team="${side}">${icon('goal')}Gol</button>
      ${['foul', 'yellow', 'red', 'sub'].map((k) => `<button class="ev" data-ev="${k}" data-team="${side}">${icon(k)}${esc(TYPE_LABEL[k])}</button>`).join('')}</div>`;
  };
  setPart('liveGrid', `<div class="grid2">${col('home')}${col('away')}</div>`, JSON.stringify([mt.home.short, mt.home.color, mt.away.short, mt.away.color]));
  setPart('liveBtns', `<div style="display:grid;gap:8px;margin-top:10px">
      <button class="ev wide play" data-ev="play">${icon('play')}Guardar jugada</button>
      <button class="btn ghost block" data-act="undo" style="min-height:56px">Deshacer último evento</button></div>`, 'btns');

  const recent = [...mt.events].sort((a, b) => b.seq - a.seq).slice(0, 5);
  setPart('liveRecent', recent.length ? recent.map((e) => evRow(e, mt)).join('') : '<div class="card muted small">Todavía no hay eventos. Lo que registres aparecerá aquí.</div>',
    JSON.stringify([recent, clipSig()]));

  const d = S.admin?.settings.display;
  setPart('liveAir', d ? `<div class="card" style="display:grid;gap:10px">
      <div class="seg" data-seg="display.mode"><button data-v="camera" class="${d.mode === 'camera' ? 'on' : ''}">Con cámara</button><button data-v="studio" class="${d.mode === 'studio' ? 'on' : ''}">Sin cámara</button></div>
      <div class="seg" data-seg="display.layout"><button data-v="h" class="${d.layout === 'h' ? 'on' : ''}">Horizontal 16:9</button><button data-v="v" class="${d.layout === 'v' ? 'on' : ''}">Vertical 9:16</button></div>
      <div class="muted small">Afecta a la pantalla «/live». Las fuentes fijas de OBS (overlay/studio) no cambian. El resultado, el reloj y los eventos son los mismos.</div></div>` : '', JSON.stringify(d && [d.mode, d.layout]));
  updateClock();
}

function updateClock() {
  const mt = m();
  if (!mt) return;
  const el = $('#liveClock');
  if (!el) return;
  const ms = clockMs(mt.clock, link.now());
  const t = fmtClock(ms);
  if (el.textContent !== t) el.textContent = t;
  const { over, announced } = addedInfo(mt, ms);
  const ad = $('#liveAdded');
  if (ad) ad.textContent = mt.clock.phase === 'first' || mt.clock.phase === 'second' ? (over ? `+${over}` : announced ? `+${announced}` : '') : '';
}
setInterval(() => { if (S.tab === 'live') updateClock(); }, 200);

function clipFor(eventId) { return (S.admin?.clips || []).find((c) => c.eventId === eventId); }
const clipSig = () => JSON.stringify((S.admin?.clips || []).map((c) => [c.eventId, c.state]));

function evRow(e, mt) {
  const { team: tm, text } = eventDetail(e, mt);
  const c = clipFor(e.id);
  return `<button class="ev-row ${e.voided ? 'voided' : ''}" data-edit="${esc(e.id)}" style="--tc:${esc(tm?.color || '#c9b8f6')}">
    <span class="m">${esc(e.minute)}</span><span style="display:flex;font-size:20px">${icon(e.type)}</span>
    <span class="t"><b>${esc(TYPE_LABEL[e.type])}${e.voided ? ' · anulado' : ''}</b><span>${esc(text || (tm ? tm.name : 'Sin detalles'))}</span></span>
    ${c ? `<span class="cb ${c.state}">${stateLabel(c.state)}</span>` : ''}
    <span class="tm">${esc(tm ? tm.short : '')}</span></button>`;
}
const stateLabel = (s) => ({ pending: 'Pendiente', processing: 'Procesando', saved: 'Guardado', error: 'Error' }[s] || s);

// Pulsaciones del panel Directo y del resto (delegación)
document.addEventListener('click', (e) => {
  const ev = e.target.closest('[data-ev]');
  if (ev) {
    if (ev.classList.contains('busy')) return;
    ev.classList.add('busy');
    setTimeout(() => ev.classList.remove('busy'), 800); // protección frente a dobles pulsaciones
    const type = ev.dataset.ev;
    const side = ev.dataset.team || null;
    const tm = side ? m()[side].short : '';
    act('event.add', { type, team: side }, `${TYPE_LABEL[type]}${tm ? ' · ' + tm : ''}`);
    return;
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) { openEventSheet(edit.dataset.edit); return; }
  const a = e.target.closest('[data-act]');
  if (!a || a.closest('#sheet')) return;
  const k = a.dataset.act;
  if (a.classList.contains('busy')) return;
  const lock = () => { a.classList.add('busy'); setTimeout(() => a.classList.remove('busy'), 700); };
  switch (k) {
    case 'clock.start1': lock(); act(k, {}, 'Primera parte iniciada'); break;
    case 'clock.start2': lock(); act(k, {}, 'Segunda parte iniciada'); break;
    case 'clock.pause': lock(); act(k, {}, 'Reloj detenido'); break;
    case 'clock.resume': lock(); act(k, {}, 'Reloj reanudado'); break;
    case 'confirm.halftime': confirmSheet('¿Iniciar el descanso?', 'El reloj se detiene hasta que inicies la segunda parte.', 'Sí, descanso', () => act('clock.halftime', {}, 'Descanso')); break;
    case 'confirm.finish': confirmSheet('¿Finalizar el partido?', 'El reloj se detiene. Podrás seguir corrigiendo eventos después.', 'Sí, finalizar', () => act('clock.finish', {}, 'Partido finalizado'), true); break;
    case 'adj': lock(); act('clock.adjust', { deltaMs: Number(a.dataset.d) }, `Reloj ${Number(a.dataset.d) > 0 ? '+' : ''}${Number(a.dataset.d) / 1000} s`); break;
    case 'extra': {
      const mt = m();
      const per = mt.clock.phase === 'second' || mt.clock.phase === 'finished' ? 2 : 1;
      lock();
      act('clock.extra', { period: per, minutes: Math.max(0, (mt.clock.extra[per] || 0) + Number(a.dataset.d)) }, 'Tiempo añadido actualizado', { quiet: true });
      break;
    }
    case 'setclock': openClockSheet(); break;
    case 'undo': lock(); act('event.undo', {}, 'Deshacer último evento'); break;
    default:
  }
});

function openClockSheet() {
  const mt = m();
  const s = Math.floor(clockMs(mt.clock, link.now()) / 1000);
  openSheet(`<h1>Fijar el tiempo del partido</h1>
    <div class="fields two"><div><label class="f">Minutos</label><input id="ckM" type="number" inputmode="numeric" min="0" max="200" value="${Math.floor(s / 60)}"></div>
    <div><label class="f">Segundos</label><input id="ckS" type="number" inputmode="numeric" min="0" max="59" value="${s % 60}"></div></div>
    <div class="row-btns" style="margin-bottom:12px"><button class="btn sm" data-p="0">Inicio 1ª (0:00)</button><button class="btn sm" data-p="${mt.durations[0]}">Inicio 2ª (${mt.durations[0]}:00)</button></div>
    <div class="actions"><button class="btn primary block" id="ckOk">Aplicar</button><button class="btn ghost block" id="ckNo">Cancelar</button></div>`, (sh) => {
    $$('[data-p]', sh).forEach((b) => { b.onclick = () => { $('#ckM', sh).value = b.dataset.p; $('#ckS', sh).value = 0; }; });
    $('#ckNo', sh).onclick = closeSheet;
    $('#ckOk', sh).onclick = () => {
      const ms = (Number($('#ckM', sh).value) * 60 + Number($('#ckS', sh).value)) * 1000;
      closeSheet();
      act('clock.set', { ms }, `Reloj fijado a ${fmtClock(ms)}`);
    };
  });
}

// ----------------------------------------------------------- Eventos
function renderEvents() {
  const root = $('#tab-events');
  const mt = m();
  const f = S.filter;
  const filters = [['all', 'Todos'], ['goal', 'Goles'], ['card', 'Tarjetas'], ['foul', 'Faltas'], ['sub', 'Cambios'], ['play', 'Jugadas']];
  const list = [...mt.events].sort((a, b) => b.seq - a.seq).filter((e) => f === 'all' || e.type === f || (f === 'card' && (e.type === 'yellow' || e.type === 'red')));
  const sig = JSON.stringify([f, list, clipSig(), mt.home.short, mt.away.short]);
  if (root.dataset.sig === sig) return;
  root.dataset.sig = sig;
  root.innerHTML = `<div class="filters">${filters.map(([k, l]) => `<button data-filter="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="muted small">${mt.events.length} evento(s) en este partido. Toca uno para editarlo, anularlo o eliminarlo.</div>
    <div class="recent-list">${list.length ? list.map((e) => evRow(e, mt)).join('') : '<div class="card muted">No hay eventos con este filtro.</div>'}</div>`;
}
$('#tab-events').addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) { S.filter = b.dataset.filter; $('#tab-events').dataset.sig = ''; renderEvents(); } });

function openEventSheet(id) {
  const mt = m();
  const ev = mt.events.find((x) => x.id === id);
  if (!ev) { toast('Ese evento ya no existe', { bad: true }); return; }
  const c = clipFor(id);
  const side = (k) => `<button data-t="${k}" class="${ev.team === k ? 'on' : ''}">${esc(mt[k].short)}</button>`;
  const typeOpts = Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${ev.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const minuteNum = Math.floor(ev.matchMs / 60000) + 1;
  openSheet(`<h1>${esc(TYPE_LABEL[ev.type])} · ${esc(ev.minute)}</h1>
    <div class="fields">
      <div class="fields two"><div><label class="f">Tipo</label><select id="eType">${typeOpts}</select></div>
        <div><label class="f">Minuto</label><input id="eMin" type="number" inputmode="numeric" min="1" max="200" value="${minuteNum}"></div></div>
      <div><label class="f">Equipo</label><div class="seg" id="eTeam">${side('home')}${side('away')}</div></div>
      <div class="fields two"><div><label class="f">Dorsal</label><input id="eNum" type="text" inputmode="numeric" maxlength="3" value="${esc(ev.number)}"></div>
        <div><label class="f">${ev.type === 'sub' ? 'Sale' : 'Jugadora'}</label><input id="ePlayer" type="text" maxlength="60" value="${esc(ev.player)}"></div></div>
      <div id="eInWrap" ${ev.type === 'sub' ? '' : 'hidden'}><label class="f">Entra</label><input id="eIn" type="text" maxlength="60" value="${esc(ev.playerIn)}"></div>
      <div><label class="f">Nota</label><input id="eNote" type="text" maxlength="200" value="${esc(ev.note)}" placeholder="Opcional"></div>
    </div>
    ${c ? `<div class="clip" style="margin-bottom:12px"><div class="hd"><b>Clip</b><span class="st ${c.state}">${stateLabel(c.state)}</span></div>
      ${c.note ? `<div class="meta">${esc(c.note)}</div>` : ''}${c.error ? `<div class="errtxt">${esc(c.error)}</div>` : ''}
      <div class="row-btns">${c.state === 'saved' ? `<a class="btn sm" target="_blank" href="/api/clips/${esc(c.id)}/file">Abrir</a>` : ''}${c.canRetry ? `<button class="btn sm" id="eRetry">Reintentar clip</button>` : ''}</div></div>` : ''}
    <div class="actions">
      <button class="btn primary block" id="eSave">Guardar cambios</button>
      ${ev.type === 'goal' ? `<button class="btn block" id="eVoid">${ev.voided ? 'Restaurar gol (cuenta en el marcador)' : 'Anular gol (no cuenta, queda en la línea)'}</button>` : ''}
      <button class="btn danger block" id="eDel">Eliminar evento</button>
      <button class="btn ghost block" id="eClose">Cerrar</button>
    </div>`, (sh) => {
    let tsel = ev.team;
    $$('#eTeam button', sh).forEach((b) => { b.onclick = () => { tsel = b.dataset.t; $$('#eTeam button', sh).forEach((x) => x.classList.toggle('on', x === b)); }; });
    $('#eType', sh).onchange = (e2) => { $('#eInWrap', sh).hidden = e2.target.value !== 'sub'; };
    $('#eClose', sh).onclick = closeSheet;
    $('#eRetry', sh)?.addEventListener('click', () => { closeSheet(); act('clips.retry', { id: c.id }, 'Reintentar clip'); });
    $('#eSave', sh).onclick = () => {
      const patch = { type: $('#eType', sh).value, team: tsel, player: $('#ePlayer', sh).value, number: $('#eNum', sh).value, playerIn: $('#eIn', sh).value, note: $('#eNote', sh).value };
      const mi = Number($('#eMin', sh).value);
      if (mi !== minuteNum) patch.minute = mi;
      closeSheet();
      act('event.update', { id, patch }, 'Evento actualizado');
    };
    $('#eVoid', sh)?.addEventListener('click', () => { closeSheet(); act('event.update', { id, patch: { voided: !ev.voided } }, ev.voided ? 'Gol restaurado' : 'Gol anulado'); });
    $('#eDel', sh).onclick = (e2) => {
      if (!e2.target.dataset.sure) { e2.target.dataset.sure = '1'; e2.target.textContent = 'Toca otra vez para confirmar la eliminación'; return; }
      closeSheet();
      act('event.delete', { id }, 'Evento eliminado');
    };
  });
}

// --------------------------------------------------------------- Clips
const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);
const fmtTime = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function renderClips() {
  const root = $('#tab-clips');
  const a = S.admin;
  if (!a) { root.innerHTML = '<div class="card muted">Cargando…</div>'; return; }
  const o = a.obs;
  const b = o.buffer;
  const stateTxt = { disabled: 'Desactivado', connecting: 'Conectando…', connected: 'Conectado', auth_failed: 'Contraseña incorrecta', error: 'Sin conexión', disconnected: 'Desconectado, reintentando…' }[o.state] || o.state;
  const clips = a.clips.filter((c) => S.clipScope === 'all' || c.matchId === m().id);
  const sig = JSON.stringify([o, a.ffmpeg, clips, S.clipScope, a.clipsDir]);
  if (root.dataset.sig === sig) return;
  root.dataset.sig = sig;
  root.innerHTML = `<div class="card">
      <h3>OBS</h3>
      <dl class="kv">
        <dt>Conexión</dt><dd>${esc(stateTxt)}${o.error && o.state !== 'connected' ? ` — ${esc(o.error)}` : ''}</dd>
        ${o.version ? `<dt>Versión</dt><dd>OBS ${esc(o.version.obs)} · WebSocket ${esc(o.version.ws)}</dd>` : ''}
        ${o.state === 'connected' ? `<dt>Emisión</dt><dd>${o.streaming ? 'En directo' : 'No está emitiendo'}</dd>` : ''}
        ${b ? `<dt>Búfer de repetición</dt><dd>${b.enabled ? (b.active ? 'Activo' : 'Parado') : 'Desactivado en OBS'} · ${b.seconds} s (necesarios: ${b.neededSec} s)</dd>` : ''}
        <dt>FFmpeg</dt><dd>${a.ffmpeg.ok ? `Listo (${esc(a.ffmpeg.version)})` : `<span style="color:var(--bad)">No disponible</span> ${esc(a.ffmpeg.error || '')}`}</dd>
        <dt>Carpeta de clips</dt><dd>${esc(a.clipsDir)}</dd>
      </dl>
      ${b && b.problems?.length ? `<div class="problems">${b.problems.map(esc).join('<br>')}</div>` : (b ? '<div class="problems ok">El búfer de repetición es suficiente.</div>' : '')}
      <div class="row-btns" style="margin-top:12px">
        <button class="btn sm" data-clip="check" ${o.state === 'connected' ? '' : 'disabled'}>Comprobar búfer</button>
        ${b && !b.ok && o.state === 'connected' ? `<button class="btn sm primary" data-clip="fix">Ajustar búfer a ${a.settings.clips.bufferTargetSec} s</button>` : ''}
        <button class="btn sm" data-clip="reconnect">Reconectar OBS</button>
      </div>
    </div>
    <h2>Clips</h2>
    <div class="seg"><button data-scope="match" class="${S.clipScope === 'match' ? 'on' : ''}">Este partido</button><button data-scope="all" class="${S.clipScope === 'all' ? 'on' : ''}">Todos</button></div>
    ${clips.length ? clips.map(clipHtml).join('') : '<div class="card muted">Aún no hay clips. Se generan al registrar los eventos configurados (Ajustes → Clips) con OBS conectado.</div>'}`;
}

function clipHtml(c) {
  return `<div class="clip" data-id="${esc(c.id)}">
    <div class="hd"><b>${esc(c.typeName)} · ${esc(c.minute)}${c.teamShort ? ' · ' + esc(c.teamShort) : ''}</b>${c.state === 'processing' || c.state === 'pending' ? '<span class="spin"></span>' : ''}<span class="st ${c.state}">${stateLabel(c.state)}</span></div>
    <div class="meta">${fmtTime(c.realAt)}${c.state === 'saved' ? ` · ${(c.durationMs / 1000).toFixed(0)} s · ${fmtSize(c.size)} · ${esc(c.file)}` : ''}${c.orphan ? ' · evento eliminado' : ''}</div>
    ${c.note ? `<div class="${c.partial ? 'warntxt' : 'meta'}">${esc(c.note)}</div>` : ''}
    ${c.error ? `<div class="errtxt">${esc(c.error)}</div>` : ''}
    <div class="row-btns">
      ${c.state === 'saved' ? `<a class="btn sm primary" target="_blank" href="/api/clips/${esc(c.id)}/file">Abrir</a><a class="btn sm" href="/api/clips/${esc(c.id)}/file?download=1">Descargar</a>` : ''}
      ${c.canRetry ? '<button class="btn sm" data-clip="retry">Reintentar</button>' : ''}
      ${c.state !== 'processing' ? '<button class="btn sm ghost" data-clip="remove">Quitar de la lista</button>' : ''}
    </div></div>`;
}

$('#tab-clips').addEventListener('click', (e) => {
  const sc = e.target.closest('[data-scope]');
  if (sc) { S.clipScope = sc.dataset.scope; $('#tab-clips').dataset.sig = ''; renderClips(); return; }
  const b = e.target.closest('[data-clip]');
  if (!b) return;
  const id = b.closest('.clip')?.dataset.id;
  switch (b.dataset.clip) {
    case 'retry': act('clips.retry', { id }, 'Reintentar clip'); break;
    case 'remove': act('clips.remove', { id }, 'Clip quitado de la lista', { quiet: true }); break;
    case 'check': act('obs.checkBuffer', {}, 'Comprobar búfer de OBS'); break;
    case 'fix': confirmSheet('Ajustar el búfer de OBS', `Se cambiará la duración del búfer de repetición a ${S.admin.settings.clips.bufferTargetSec} s y se reiniciará el búfer. No lo hagas durante una jugada que quieras guardar.`, 'Ajustar ahora', () => act('obs.fixBuffer', { seconds: S.admin.settings.clips.bufferTargetSec }, 'Ajustar búfer de OBS')); break;
    case 'reconnect': act('obs.reconnect', {}, 'Reconectar con OBS'); break;
    default:
  }
});

// -------------------------------------------------------------- Emisión
const GUIDE_VERT = `Lienzo de OBS 1080×1920 (Ajustes → Vídeo → Resolución base y de salida).
1) Fuente «Navegador» con la dirección overlay/v, ancho 1080 y alto 1920, en la capa superior.
2) Tu cámara (fuente de captura de vídeo) debajo: clic derecho → Transformar → Editar transformación.
   Alineación posicional: Centro · Posición X 540, Y 960 · Tipo de límite: «Escalar al límite interior» · Tamaño del límite 1080 × 607.
   Así el vídeo horizontal se ve completo, a ancho completo, con el marcador por encima y los eventos por debajo.`;

function renderAir() {
  const root = $('#tab-air');
  const a = S.admin;
  if (!a) { root.innerHTML = '<div class="card muted">Cargando…</div>'; return; }
  const d = a.settings.display;
  const c = a.settings.clips;
  const lay = d.layout;
  const mg = d.margins[lay];
  const base = `http://localhost:${a.port}`;
  const urls = [
    ['Con cámara · horizontal', `${base}/overlay/h`, '1920 × 1080'],
    ['Con cámara · vertical', `${base}/overlay/v`, '1080 × 1920'],
    ['Sin cámara · horizontal', `${base}/studio/h`, '1920 × 1080'],
    ['Sin cámara · vertical', `${base}/studio/v`, '1080 × 1920'],
    ['Automática (sigue el modo y formato del mando)', `${base}/live`, 'según formato'],
  ];
  const sec = (v) => (v / 1000).toString();
  const sig = JSON.stringify([d, c.cameraDelayMs, a.port]);
  if (root.dataset.sig === sig && root.dataset.built) return;
  root.dataset.sig = sig;
  root.dataset.built = '1';
  root.innerHTML = `
    <h2 style="margin-top:4px">Formato de la vista previa</h2>
    <div class="seg" data-seg="display.mode"><button data-v="camera" class="${d.mode === 'camera' ? 'on' : ''}">Con cámara</button><button data-v="studio" class="${d.mode === 'studio' ? 'on' : ''}">Sin cámara</button></div>
    <div class="seg" data-seg="display.layout"><button data-v="h" class="${lay === 'h' ? 'on' : ''}">Horizontal 16:9</button><button data-v="v" class="${lay === 'v' ? 'on' : ''}">Vertical 9:16</button></div>
    <div class="preview-box" id="pv" data-lay="${lay}"><iframe id="pvf" src="/live?guides=1" title="Vista previa"></iframe></div>
    <div class="muted small" style="text-align:center">Vista previa de «/live» con guías: línea discontinua = márgenes seguros${lay === 'v' ? '; recuadro central = vídeo 16:9' : ''}.</div>

    <h2>Retrasos (en segundos)</h2>
    <div class="card fields">
      <div><label class="f">Marcador y avisos (pantalla con cámara)</label><input type="number" step="0.1" min="0" max="60" inputmode="decimal" data-set="display.delays.scoreMs" data-type="sec" value="${sec(d.delays.scoreMs)}"></div>
      <div><label class="f">Reloj emitido (pantalla con cámara)</label><input type="number" step="0.1" min="0" max="60" inputmode="decimal" data-set="display.delays.clockMs" data-type="sec" value="${sec(d.delays.clockMs)}"></div>
      <div><label class="f">Retraso de la cámara (para localizar el clip)</label><input type="number" step="0.1" min="0" max="60" inputmode="decimal" data-set="clips.cameraDelayMs" data-type="sec" value="${sec(c.cameraDelayMs)}"></div>
      <button class="btn" data-air="equal">Igualar marcador y reloj al retraso de la cámara</button>
      <div class="muted small">Tu mando siempre confirma al instante. Estos retrasos solo afectan a lo que ve el público, para que el gol aparezca cuando la jugada llega en el vídeo. Para medirlo: abre <b>/calibrate</b> (ver guía de calibración).</div>
    </div>

    <h2>Márgenes · ${lay === 'h' ? 'horizontal' : 'vertical'} (píxeles)</h2>
    <div class="card fields">
      ${['top', 'bottom', 'left', 'right'].map((k) => `<div><label class="f">${{ top: 'Superior', bottom: 'Inferior', left: 'Izquierdo', right: 'Derecho' }[k]}: <b id="mv-${k}">${mg[k]}</b> px</label>
        <input type="range" min="0" max="${lay === 'h' ? 300 : 600}" step="5" value="${mg[k]}" data-set="display.margins.${lay}.${k}" data-type="num" data-live="mv-${k}"></div>`).join('')}
      <div class="muted small">Instagram superpone su interfaz arriba y abajo en vertical. Los valores por defecto dejan libre esa zona; ajústalos mirando la vista previa y una prueba real.</div>
    </div>

    <h2>Avisos de eventos</h2>
    <div class="card fields">
      <div><label class="f">Duración del aviso (s)</label><input type="number" min="2" max="20" inputmode="numeric" data-set="display.noticeSeconds" data-type="num" value="${d.noticeSeconds}"></div>
      <div><label class="f">Eventos recientes visibles (0–6)</label><input type="number" min="1" max="6" inputmode="numeric" data-set="display.recentEvents" data-type="num" value="${d.recentEvents}"></div>
      ${Object.keys(d.noticeTypes).map((k) => `<label class="switch"><span>Aviso de ${esc(TYPE_LABEL[k].toLowerCase())}</span><input type="checkbox" data-set="display.noticeTypes.${k}" data-type="bool" ${d.noticeTypes[k] ? 'checked' : ''}></label>`).join('')}
    </div>

    <h2>Fuentes para OBS (Navegador)</h2>
    <div class="card fields">
      ${urls.map(([n, u, sz]) => `<div class="url-row"><div class="u"><b>${esc(n)} <span class="muted">· ${esc(sz)}</span></b><code>${esc(u)}</code></div><button class="btn sm" data-copy="${esc(u)}">Copiar</button></div>`).join('')}
      <div class="muted small">En OBS: Fuentes → + → Navegador → pega la dirección, pon el ancho y alto indicados y deja vacío el CSS personalizado. El fondo es transparente en «con cámara».</div>
    </div>
    <details class="sec" ${S.openSecs.has('sec-vert') ? 'open' : ''} id="sec-vert"><summary>Vertical con cámara: cómo colocar el vídeo en OBS</summary><div class="body"><pre style="white-space:pre-wrap;margin:0;font:13px/1.5 var(--font-ui);color:var(--text)">${esc(GUIDE_VERT)}</pre></div></details>`;
  fitPreview();
}

function fitPreview() {
  const box = $('#pv');
  if (!box) return;
  const lay = box.dataset.lay;
  const [W, H] = lay === 'h' ? [1920, 1080] : [1080, 1920];
  const avail = Math.min(box.parentElement.clientWidth, 640);
  const w = lay === 'h' ? avail : Math.min(avail, 230);
  const s = w / W;
  box.style.width = `${w}px`;
  box.style.height = `${H * s}px`;
  const f = $('#pvf');
  f.style.width = `${W}px`;
  f.style.height = `${H}px`;
  f.style.transform = `scale(${s})`;
}
addEventListener('resize', fitPreview);

// Controles genéricos de ajustes: segmentados, campos con data-set y botones de copiar
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  ks.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; });
  o[ks.at(-1)] = val;
  return obj;
}
function sendSetting(path, val, label = 'Ajuste guardado') {
  act('settings.update', { patch: setPath({}, path, val) }, label, { quiet: true });
}
document.addEventListener('click', (e) => {
  const sg = e.target.closest('[data-seg] button[data-v]');
  if (sg) { sendSetting(sg.parentElement.dataset.seg, sg.dataset.v); $$('button', sg.parentElement).forEach((b) => b.classList.toggle('on', b === sg)); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { copyText(cp.dataset.copy).then((ok) => toast(ok ? 'Copiado' : 'No se pudo copiar: mantén pulsada la dirección', { bad: !ok })); return; }
  if (e.target.closest('[data-air="equal"]')) {
    const ms = S.admin.settings.clips.cameraDelayMs;
    act('settings.update', { patch: { display: { delays: { scoreMs: ms, clockMs: ms } } } }, 'Retrasos igualados');
    $('#tab-air').dataset.sig = '';
  }
});
document.addEventListener('input', (e) => {
  const r = e.target.closest('input[type=range][data-live]');
  if (r) $(`#${r.dataset.live}`).textContent = r.value;
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-set]');
  if (!el) return;
  let v;
  switch (el.dataset.type) {
    case 'bool': v = el.checked; break;
    case 'num': v = Number(el.value); break;
    case 'sec': v = Math.round(Number(el.value) * 1000); break;
    default: v = el.value;
  }
  if ((el.dataset.type === 'num' || el.dataset.type === 'sec') && !Number.isFinite(v)) return;
  sendSetting(el.dataset.set, v);
});
document.addEventListener('toggle', (e) => { if (e.target.matches?.('details.sec')) { if (e.target.open) S.openSecs.add(e.target.id); else S.openSecs.delete(e.target.id); } }, true);

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* sin contexto seguro */ }
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* */ }
  ta.remove();
  return ok;
}

// ------------------------------------------------------------- Ajustes
let lanIdx = 0;
let showKey = false;

function teamFields(prefix, t, side) {
  return `<div class="card fields"><h3>${esc(side === 'home' ? 'Equipo local' : 'Equipo visitante')}</h3>
    <div><label class="f">Nombre</label><input type="text" id="${prefix}Name" maxlength="60" value="${esc(t.name)}"></div>
    <div class="fields two"><div><label class="f">Abreviatura</label><input type="text" id="${prefix}Short" maxlength="5" value="${esc(t.short)}"></div>
      <div><label class="f">Color</label><input type="color" id="${prefix}Color" value="${esc(t.color)}"></div></div>
    <div class="logo-pick">${badge(t)}<label class="btn sm" style="cursor:pointer">Subir escudo<input type="file" accept="image/*" hidden data-logo="${side}"></label>
      ${t.logo ? `<button class="btn sm ghost" data-nologo="${side}">Quitar</button>` : '<span class="muted small">Sin escudo: se usan las iniciales</span>'}</div></div>`;
}

function renderMore() {
  const root = $('#tab-more');
  const a = S.admin;
  const mt = m();
  if (!a) { root.innerHTML = '<div class="card muted">Cargando…</div>'; return; }
  const st = a.settings;
  const sec = (id, title, body) => `<details class="sec" id="${id}" ${S.openSecs.has(id) ? 'open' : ''}><summary>${title}</summary><div class="body">${body}</div></details>`;
  const lan = a.lan[Math.min(lanIdx, Math.max(0, a.lan.length - 1))];
  const ctlUrl = lan ? `${lan.url}/control?k=${a.key}` : '';
  const sigNow = JSON.stringify([a.settings, mt.id, mt.name, mt.home, mt.away, mt.durations, mt.date, mt.category, a.matches, a.lan, a.key, lanIdx, showKey, a.obs.state]);
  if (root.dataset.sig === sigNow) return;
  root.dataset.sig = sigNow;
  const presetOpts = PRESETS.map(([n, mnt]) => `<option value="${mnt}">${n} (${mnt}′ por parte)</option>`).join('');

  root.innerHTML = `<h2 style="margin-top:4px">Partido</h2>
    ${sec('sec-match', `Partido actual${mt.isTest ? ' · PRUEBA' : ''}`, `
      <div><label class="f">Nombre del partido</label><input type="text" id="mName" maxlength="80" value="${esc(mt.name)}"></div>
      <div class="fields two"><div><label class="f">Fecha</label><input type="date" id="mDate" value="${esc(mt.date)}"></div><div><label class="f">Categoría</label><input type="text" id="mCat" maxlength="40" value="${esc(mt.category)}"></div></div>
      <div class="fields two"><div><label class="f">Minutos 1ª parte</label><input type="number" id="mD1" min="1" max="60" inputmode="numeric" value="${mt.durations[0]}"></div><div><label class="f">Minutos 2ª parte</label><input type="number" id="mD2" min="1" max="60" inputmode="numeric" value="${mt.durations[1]}"></div></div>
      ${teamFields('mH', mt.home, 'home')}${teamFields('mA', mt.away, 'away')}
      <button class="btn primary block" data-more="saveMatch">Guardar datos del partido</button>
      <div class="muted small">La 2ª parte empezará en el minuto ${mt.durations[0]} (duración de la 1ª parte).</div>`)}
    ${sec('sec-new', 'Nuevo partido', `
      <div><label class="f">Rival</label><input type="text" id="nRival" maxlength="60" placeholder="Nombre del equipo rival"></div>
      <div class="fields two"><div><label class="f">Abreviatura</label><input type="text" id="nShort" maxlength="5" placeholder="Automática"></div><div><label class="f">Color</label><input type="color" id="nColor" value="#ffffff"></div></div>
      <div class="fields two"><div><label class="f">Fecha</label><input type="date" id="nDate" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label class="f">${esc(st.club.short)} juega de</label><select id="nSide"><option value="home">Local</option><option value="away">Visitante</option></select></div></div>
      <div><label class="f">Categoría (sugerencia de duración, ajustable)</label><select id="nPreset"><option value="">Personalizada</option>${presetOpts}</select></div>
      <div class="fields two"><div><label class="f">Minutos 1ª parte</label><input type="number" id="nD1" min="1" max="60" inputmode="numeric" value="45"></div><div><label class="f">Minutos 2ª parte</label><input type="number" id="nD2" min="1" max="60" inputmode="numeric" value="45"></div></div>
      <button class="btn primary block" data-more="newMatch">Crear partido y abrirlo</button>
      <button class="btn block" data-more="newTest">Crear partido de prueba (para ensayar)</button>`)}
    ${sec('sec-hist', `Partidos anteriores (${a.matches.length})`, a.matches.map((x) => `<div class="match-row ${x.id === mt.id ? 'active' : ''}"><div class="mi"><b>${esc(x.homeShort)} ${x.score.home} - ${x.score.away} ${esc(x.awayShort)}${x.isTest ? ' · PRUEBA' : ''}</b><span class="muted small">${esc(x.date)} · ${esc(x.name)} · ${x.events} evento(s)</span></div>
        <div class="row-btns" style="flex:none;flex-wrap:nowrap">${x.id === mt.id ? '<span class="chip ok">Abierto</span>' : `<button class="btn sm" data-more="open" data-id="${esc(x.id)}">Abrir</button>`}
        <a class="btn sm" href="/api/matches/${esc(x.id)}/export?format=csv">CSV</a><a class="btn sm" href="/api/matches/${esc(x.id)}/export?format=json">JSON</a>
        ${x.id === mt.id ? '' : `<button class="btn sm danger" data-more="delete" data-id="${esc(x.id)}">×</button>`}</div></div>`).join('') || '<div class="muted">Sin partidos.</div>')}

    <h2>Conexión</h2>
    ${sec('sec-conn', 'Abrir el mando en otro móvil', `
      ${a.lan.length ? `${a.lan.length > 1 ? `<div><label class="f">Red del portátil</label><select id="lanSel">${a.lan.map((l, i) => `<option value="${i}" ${i === lanIdx ? 'selected' : ''}>${esc(l.ip)} (${esc(l.name)})${l.likely ? '' : ' · poco probable'}</option>`).join('')}</select></div>` : ''}
        <div class="qr"><img alt="Código QR del mando" src="/api/qr?text=${encodeURIComponent(ctlUrl)}"></div>
        <div class="url-row"><div class="u"><b>Dirección del mando</b><code>${esc(ctlUrl.replace(a.key, showKey ? a.key : '••••-••••'))}</code></div><button class="btn sm" data-copy="${esc(ctlUrl)}">Copiar</button></div>`
        : '<div class="problems">El portátil no tiene red. Conéctalo al Wi-Fi o a la conexión compartida del móvil.</div>'}
      <div class="url-row"><div class="u"><b>Clave de control</b><code>${showKey ? esc(a.key) : '••••-••••'}</code></div><button class="btn sm" data-more="togglekey">${showKey ? 'Ocultar' : 'Mostrar'}</button></div>
      <button class="btn danger block" data-more="newkey">Generar nueva clave (cierra los demás mandos)</button>
      <div class="muted small">Si el móvil no abre la dirección, revisa el cortafuegos de Windows (guía de red y cortafuegos).</div>`)}

    <h2>OBS y clips</h2>
    ${sec('sec-obs', 'Conexión con OBS (WebSocket)', `
      <label class="switch"><span>Usar OBS para guardar clips</span><input type="checkbox" data-set="obs.enabled" data-type="bool" ${st.obs.enabled ? 'checked' : ''}></label>
      <div class="fields two"><div><label class="f">Dirección</label><input type="text" id="oHost" value="${esc(st.obs.host)}"></div><div><label class="f">Puerto</label><input type="number" id="oPort" inputmode="numeric" value="${st.obs.port}"></div></div>
      <div><label class="f">Contraseña de OBS ${st.obs.passwordSet ? '(guardada; escribe otra para cambiarla)' : ''}</label><input type="password" id="oPass" autocomplete="off" placeholder="${st.obs.passwordSet ? '••••••••' : 'Sin contraseña'}"></div>
      <button class="btn primary block" data-more="saveObs">Guardar y conectar</button>
      <div class="muted small">La contraseña se guarda solo en el portátil. Estado actual: <b>${esc(a.obs.state)}</b>${a.obs.error ? ' — ' + esc(a.obs.error) : ''}.</div>`)}
    ${sec('sec-clips', 'Clips: qué se guarda y dónde', `
      <label class="switch"><span>Generar clips automáticamente</span><input type="checkbox" data-set="clips.enabled" data-type="bool" ${st.clips.enabled ? 'checked' : ''}></label>
      <div class="fields">${Object.keys(st.clips.triggers).map((k) => `<label class="switch"><span>Clip al registrar: ${esc(TYPE_LABEL[k].toLowerCase())}</span><input type="checkbox" data-set="clips.triggers.${k}" data-type="bool" ${st.clips.triggers[k] ? 'checked' : ''}></label>`).join('')}</div>
      <div class="fields two"><div><label class="f">Segundos anteriores</label><input type="number" min="0" max="120" inputmode="numeric" data-set="clips.preSec" data-type="num" value="${st.clips.preSec}"></div><div><label class="f">Segundos posteriores</label><input type="number" min="1" max="120" inputmode="numeric" data-set="clips.postSec" data-type="num" value="${st.clips.postSec}"></div></div>
      <div><label class="f">Calidad de recorte</label><select data-set="clips.mode" data-type="text"><option value="accurate" ${st.clips.mode === 'accurate' ? 'selected' : ''}>Exacto (recodifica, algo más lento)</option><option value="fast" ${st.clips.mode === 'fast' ? 'selected' : ''}>Rápido (copia, corta en fotograma clave)</option></select></div>
      <div class="fields two"><div><label class="f">Margen de seguridad (s)</label><input type="number" step="0.5" min="0.5" max="15" inputmode="decimal" data-set="clips.marginMs" data-type="sec" value="${st.clips.marginMs / 1000}"></div><div><label class="f">Búfer objetivo (s)</label><input type="number" min="30" max="600" inputmode="numeric" data-set="clips.bufferTargetSec" data-type="num" value="${st.clips.bufferTargetSec}"></div></div>
      <label class="switch"><span>Iniciar el búfer de OBS automáticamente</span><input type="checkbox" data-set="clips.autoStartBuffer" data-type="bool" ${st.clips.autoStartBuffer ? 'checked' : ''}></label>
      <div><label class="f">Carpeta de clips en el portátil</label><div class="inline"><input type="text" id="cDir" value="${esc(st.clips.dir)}" placeholder="${esc(a.clipsDir)}"><button class="btn sm" data-more="saveDir">Guardar</button></div></div>
      <div class="muted small">Vacío = carpeta por defecto: ${esc(a.clipsDir)}. El retraso de la cámara se ajusta en la pestaña Emisión.</div>`)}

    <h2>Club</h2>
    ${sec('sec-club', 'Datos del club (para partidos nuevos)', `
      <div><label class="f">Nombre</label><input type="text" id="kName" maxlength="60" value="${esc(st.club.name)}"></div>
      <div class="fields two"><div><label class="f">Abreviatura</label><input type="text" id="kShort" maxlength="5" value="${esc(st.club.short)}"></div><div><label class="f">Color</label><input type="color" id="kColor" value="${esc(st.club.color)}"></div></div>
      <div class="logo-pick">${badge(st.club)}<label class="btn sm" style="cursor:pointer">Subir escudo del club<input type="file" accept="image/*" hidden data-logo="club"></label></div>
      <button class="btn primary block" data-more="saveClub">Guardar club</button>`)}
    <div class="muted small" style="text-align:center;margin-top:18px">FFSP · Control de retransmisiones</div>`;
}

async function prepareImage(file) {
  if (file.type === 'image/svg+xml') return file;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

$('#tab-more').addEventListener('change', async (e) => {
  if (e.target.id === 'lanSel') { lanIdx = Number(e.target.value); $('#tab-more').dataset.sig = ''; renderMore(); return; }
  if (e.target.id === 'nPreset' && e.target.value) { $('#nD1').value = e.target.value; $('#nD2').value = e.target.value; return; }
  const input = e.target.closest('input[data-logo]');
  if (!input || !input.files[0]) return;
  const side = input.dataset.logo;
  try {
    const blob = await prepareImage(input.files[0]);
    const r = await api('/api/upload/logo', { method: 'POST', body: blob });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'No se pudo subir');
    if (side === 'club') act('settings.update', { patch: { club: { logo: j.url } } }, 'Escudo del club actualizado');
    else {
      act('match.update', { patch: { [side]: { logo: j.url } } }, 'Escudo actualizado');
      if (m().ffspSide === side) act('settings.update', { patch: { club: { logo: j.url } } }, 'Escudo del club actualizado', { quiet: true });
    }
  } catch (err) { toast(err.message, { bad: true }); }
});

$('#tab-more').addEventListener('click', (e) => {
  const nl = e.target.closest('[data-nologo]');
  if (nl) { act('match.update', { patch: { [nl.dataset.nologo]: { logo: '' } } }, 'Escudo quitado'); return; }
  const b = e.target.closest('[data-more]');
  if (!b) return;
  const v = (id) => $(`#${id}`)?.value ?? '';
  switch (b.dataset.more) {
    case 'saveMatch':
      act('match.update', { patch: {
        name: v('mName'), date: v('mDate'), category: v('mCat'), durations: [Number(v('mD1')), Number(v('mD2'))],
        home: { name: v('mHName'), short: v('mHShort'), color: v('mHColor') }, away: { name: v('mAName'), short: v('mAShort'), color: v('mAColor') },
      } }, 'Datos del partido guardados');
      break;
    case 'newMatch':
      if (!v('nRival').trim()) { toast('Escribe el nombre del rival', { bad: true }); $('#nRival').focus(); break; }
      act('match.create', { rival: { name: v('nRival'), short: v('nShort'), color: v('nColor') }, date: v('nDate'), ffspSide: v('nSide'), durations: [Number(v('nD1')), Number(v('nD2'))], category: ($('#nPreset').selectedOptions[0]?.text || '').split(' (')[0].replace('Personalizada', '') }, 'Partido creado', { after: () => setTab('live') });
      break;
    case 'newTest': act('match.createTest', {}, 'Partido de prueba creado', { after: () => setTab('live') }); break;
    case 'open': act('match.select', { id: b.dataset.id }, 'Partido abierto', { after: () => setTab('live') }); break;
    case 'delete': confirmSheet('¿Eliminar el partido?', 'Se borra el partido y todos sus eventos de este portátil. No se puede deshacer. Los clips ya guardados no se borran.', 'Eliminar partido', () => act('match.delete', { id: b.dataset.id }, 'Partido eliminado'), true); break;
    case 'togglekey': showKey = !showKey; $('#tab-more').dataset.sig = ''; renderMore(); break;
    case 'newkey': confirmSheet('¿Generar una clave nueva?', 'Los demás móviles con el mando abierto tendrán que volver a entrar con la clave nueva. Este móvil seguirá conectado.', 'Generar clave', () => act('key.regenerate', {}, 'Generar clave nueva'), true); break;
    case 'saveObs': {
      const patch = { obs: { enabled: true, host: v('oHost'), port: Number(v('oPort')) } };
      if (v('oPass')) patch.obs.password = v('oPass');
      act('settings.update', { patch }, 'Conectando con OBS…');
      break;
    }
    case 'saveDir': act('settings.update', { patch: { clips: { dir: v('cDir') } } }, 'Carpeta de clips guardada'); break;
    case 'saveClub': act('settings.update', { patch: { club: { name: v('kName'), short: v('kShort'), color: v('kColor') } } }, 'Club guardado'); break;
    default:
  }
});

// -------------------------------------------------------------- Acceso
async function login(key) {
  const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ key }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, error: j.error };
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  const res = await login($('#loginKey').value);
  if (!res.ok) { $('#loginErr').textContent = res.error || 'No se pudo entrar'; return; }
  link.wake();
  if (link.ws) try { link.ws.close(); } catch { /* */ }
});

(async function boot() {
  const q = new URLSearchParams(location.search);
  const k = q.get('k');
  if (k) {
    await login(k);
    history.replaceState(null, '', '/control'); // la clave no se queda en la barra de direcciones
  }
  getClientId();
  link.start();
  setTab('live');
})();
