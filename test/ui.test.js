// Pruebas de interfaz con un navegador real (Playwright). Se omiten si Playwright no está disponible.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { boot, TestClient, sleep } from './helpers.js';
import { startServer } from '../server/index.js';

const require = createRequire(import.meta.url);
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
  try { ({ chromium } = require(p)); break; } catch { /* siguiente */ }
}
const opts = { skip: chromium ? false : 'Playwright no está instalado' };

const txt = (page, sel) => page.locator(sel).first().innerText();

test('UI: un gol desde el mando actualiza la pantalla de OBS y deshacerlo lo corrige', opts, async () => {
  const s = await boot();
  const browser = await chromium.launch();
  try {
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
    const obs = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await obs.goto(`${s.base}/overlay/h`);
    await phone.goto(`${s.base}/control?k=${s.key}`);
    await phone.waitForSelector('#liveScore .score-card');
    assert.ok(!phone.url().includes('k='), 'la clave se quita de la barra de direcciones');
    await phone.click('[data-act="clock.start1"]');
    await phone.waitForSelector('[data-act="confirm.halftime"]');
    await phone.click('#liveGrid [data-ev="goal"][data-team="home"]');
    await obs.waitForFunction(() => document.querySelector('.sc-h')?.textContent === '1');
    assert.match(await txt(obs, '.notice .nt'), /GOL/, 'aparece el aviso del gol');
    assert.equal(await obs.locator('.cam-h .recent .row').count(), 1);
    await sleep(900); // pasa la protección de doble pulsación
    await phone.click('[data-act="undo"]');
    await obs.waitForFunction(() => document.querySelector('.sc-h')?.textContent === '0');
    assert.equal(await obs.locator('.cam-h .recent .row').count(), 0);
    // la pantalla de emisión no tiene controles
    assert.equal(await obs.locator('button, input, select, a').count(), 0);
  } finally { await browser.close(); await s.close(); }
});

test('UI: sin conexión las acciones quedan pendientes y al reconectar no se duplican', opts, async () => {
  const s = await boot();
  const { dataDir, port, key } = s;
  const browser = await chromium.launch();
  let s2;
  try {
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await phone.goto(`${s.base}/control?k=${key}`);
    await phone.waitForSelector('#liveScore .score-card');
    await phone.waitForFunction(() => document.querySelector('#connChip')?.textContent.startsWith('Conectado'));
    await s.close();
    await phone.waitForFunction(() => document.querySelector('#connChip')?.textContent === 'Sin conexión', null, { timeout: 15000 });
    await phone.click('#liveGrid [data-ev="goal"][data-team="away"]');
    await phone.waitForSelector('#pend .pi');
    assert.match(await txt(phone, '#pend'), /Pendiente/);
    s2 = await startServer({ port, dataDir, quiet: true });
    await phone.waitForFunction(() => document.querySelector('#connChip')?.textContent.startsWith('Conectado'), null, { timeout: 20000 });
    await phone.waitForSelector('#pend .pi', { state: 'detached', timeout: 10000 });
    const v = await new TestClient(`http://127.0.0.1:${port}`).connect();
    assert.equal(v.state.match.score.away, 1);
    assert.equal(v.state.match.events.length, 1, 'un único gol tras el reenvío');
    v.close();
  } finally { await browser.close(); await s2?.close(); }
});

test('UI: retraso de emisión, y recargar la pantalla no reinicia el reloj', opts, async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  const browser = await chromium.launch();
  try {
    await ctl.cmd('settings.update', { patch: { display: { delays: { scoreMs: 2500, clockMs: 2500 } } } });
    await ctl.cmd('clock.start1');
    await ctl.cmd('clock.set', { ms: 120_000 });
    const obs = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await obs.goto(`${s.base}/overlay/h`);
    await obs.waitForSelector('.sc-h');
    await ctl.cmd('event.add', { type: 'goal', team: 'home' });
    await sleep(1200);
    assert.equal(await txt(obs, '.sc-h'), '0', 'el marcador emitido aún no cambia (retraso 2,5 s)');
    await sleep(2000);
    assert.equal(await txt(obs, '.sc-h'), '1', 'el marcador aparece cuando la jugada llega en el vídeo');
    // reloj emitido va 2,5 s por detrás del real
    const mmss = (t) => { const [m, sec] = t.split(':').map(Number); return m * 60 + sec; };
    const shown = mmss(await txt(obs, '.cam-h .cl'));
    const real = (Date.now() - s.app.match.clock.startedAt + s.app.match.clock.baseMs) / 1000;
    assert.ok(Math.abs(real - 2.5 - shown) <= 1.6, `reloj emitido ${shown}, real ${real}`);
    await obs.reload();
    await obs.waitForSelector('.sc-h');
    await sleep(500);
    const after = mmss(await txt(obs, '.cam-h .cl'));
    assert.ok(after >= shown && after - shown <= 4, `tras recargar: ${shown} -> ${after}`);
    assert.equal(await txt(obs, '.sc-h'), '1', 'tras recargar se conserva el marcador');
    assert.equal(await obs.locator('.notice').count(), 0, 'recargar no repite avisos antiguos');
  } finally { ctl.close(); await browser.close(); await s.close(); }
});

test('UI: las dos distribuciones caben en su lienzo y respetan los márgenes', opts, async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  const browser = await chromium.launch();
  try {
    await ctl.cmd('clock.start1');
    for (let i = 0; i < 9; i++) { await ctl.cmd('event.add', { type: i % 2 ? 'goal' : 'foul', team: i % 3 ? 'home' : 'away', player: 'Jugadora con un nombre bastante largo' }); await sleep(1300); }
    for (const [url, w, h] of [['/overlay/h', 1920, 1080], ['/overlay/v', 1080, 1920], ['/studio/h', 1920, 1080], ['/studio/v', 1080, 1920]]) {
      const pg = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      await pg.goto(s.base + url);
      await pg.waitForSelector('.safe');
      await sleep(500);
      const r = await pg.evaluate(() => {
        const st = document.querySelector('#stage').getBoundingClientRect();
        const bad = [];
        for (const el of document.querySelectorAll('#view .safe *:not(.timeline *)')) {
          const b = el.getBoundingClientRect();
          if (b.width && (b.right > st.right + 1 || b.bottom > st.bottom + 1 || b.left < -1 || b.top < -1)) bad.push(el.className);
        }
        const doc = document.documentElement;
        return { bad, scroll: doc.scrollWidth > innerWidth || doc.scrollHeight > innerHeight };
      });
      assert.deepEqual(r.bad, [], `${url}: elementos fuera del lienzo`);
      assert.equal(r.scroll, false, `${url}: desbordamiento`);
      // en las pantallas con cámara el contenido queda dentro de los márgenes seguros
      if (url.startsWith('/overlay')) {
        const m = ctl.admin?.settings?.display.margins ?? { h: { top: 40, left: 60 }, v: { top: 260, left: 60 } };
        const top = await pg.evaluate(() => document.querySelector('.sb, .cv-board').getBoundingClientRect().top);
        assert.ok(top >= (url.endsWith('v') ? m.v.top : m.h.top) - 1, `${url}: contenido por encima del margen (${top})`);
      }
      await pg.close();
    }
  } finally { ctl.close(); await browser.close(); await s.close(); }
});

test('UI: pantallas automáticas, alineación, y gol del club con jugadora elegida desde el móvil', opts, async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  const browser = await chromium.launch();
  try {
    await ctl.cmd('settings.update', { patch: { display: { style: 'classic' } } });
    await ctl.cmd('roster.import', { text: 'Titulares\n9 FERRER COLL, MARTA\n10 GARCIA SOLER, LUCIA\nSuplentes\n4 NOGUERA, ZENYA\nEntrenador: VIDAL COSTA, PAU' });
    await ctl.cmd('match.create', { rival: { name: 'CE Prueba' } });
    const obs = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
    await obs.goto(`${s.base}/studio/v`);
    await obs.waitForSelector('.sp-prematch', { timeout: 5000 });
    await ctl.cmd('clock.countdown', { minutes: 10 });
    await obs.waitForSelector('.sp-cd .cdv');
    assert.match(await txt(obs, '.cdv'), /^(09|10):\d\d$/, 'cuenta atrás de 10 minutos');
    await ctl.cmd('settings.update', { patch: { display: { screen: 'lineup' } } });
    await obs.waitForSelector('.lu-row');
    const names = await obs.locator('.lu-name').allInnerTexts();
    assert.deepEqual(names, ['Marta Ferrer', 'Lucia Garcia'], 'solo las titulares, con su nombre');
    assert.match(await txt(obs, '.lu-coach b'), /Pau Vidal/);
    await ctl.cmd('settings.update', { patch: { display: { screen: 'auto' } } });
    await ctl.cmd('clock.start1');
    await obs.waitForSelector('.timeline');

    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
    await phone.goto(`${s.base}/control?k=${s.key}`);
    await phone.waitForSelector('#liveGrid [data-ev="goal"]');
    const homeBtn = '#liveGrid [data-ev="goal"][data-team="home"]'; // el club juega de local por defecto
    await phone.click(homeBtn);
    await phone.waitForSelector('.pick .pk');
    assert.equal(await obs.locator('.goalfx').count(), 0, 'la animación espera al nombre');
    await phone.click('.pk[data-pk] >> text=Marta Ferrer');
    await obs.waitForSelector('.goalfx .fx-name', { timeout: 4000 });
    assert.equal(await txt(obs, '.fx-name'), 'Marta Ferrer');
    assert.equal(await txt(obs, '.fx-num'), '9');
    assert.equal(await txt(obs, '.fx-word'), 'GOL');
    assert.equal(await txt(obs, '.sc-h'), '1');
    // gol del rival: aviso discreto, sin animación grande
    await sleep(900);
    await phone.click('#liveGrid [data-ev="goal"][data-team="away"]');
    await obs.waitForSelector('.notice', { timeout: 6000 });
    assert.equal(await obs.locator('.goalfx').count() <= 1, true);
    // descanso y final cambian solos de pantalla
    await ctl.cmd('clock.halftime');
    await obs.waitForSelector('.sp-halftime');
    await ctl.cmd('clock.start2');
    await ctl.cmd('clock.finish');
    await obs.waitForSelector('.sp-final');
    assert.ok((await obs.locator('.sm-row').count()) >= 1);
  } finally { ctl.close(); await browser.close(); await s.close(); }
});


test('UI Estilo Pro: fichas de alineación con foto, GOL gigante con jugadora y estilo conmutable', opts, async () => {
  const s = await boot();
  const ctl = await new TestClient(s.base, { role: 'control', key: s.key }).connect();
  const browser = await chromium.launch();
  try {
    assert.equal(ctl.state.display.style, 'pro', 'el estilo Pro es el predeterminado');
    await ctl.cmd('roster.import', { text: 'Titulares\n9 FERRER COLL, MARTA\n10 GARCIA SOLER, LUCIA\nSuplentes\n4 NOGUERA, ZENYA' });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const { url } = await (await fetch(`${s.base}/api/upload/logo?k=${s.key}`, { method: 'POST', body: png })).json();
    const roster = ctl.state.squad.roster.map((p) => ({ ...p, photo: p.number === '9' ? url : '' }));
    assert.equal((await ctl.cmd('roster.save', { roster })).ok, true);
    assert.equal(ctl.state.squad.roster.find((p) => p.number === '9').photo, url, 'la foto se guarda');
    assert.equal((await ctl.cmd('roster.save', { roster: roster.map((p) => ({ ...p, photo: 'https://x.es/a.jpg' })) })).ok, true);
    assert.equal(ctl.state.squad.roster.find((p) => p.number === '9').photo, '', 'solo se admiten fotos subidas');
    await ctl.cmd('roster.save', { roster });
    await ctl.cmd('match.create', { rival: { name: 'CE Prueba' } });
    await ctl.cmd('clock.start1');
    const obs = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
    await obs.goto(`${s.base}/studio/v?screen=lineup`);
    await obs.waitForSelector('.pc');
    assert.equal(await obs.locator('body.style-pro').count(), 1);
    assert.equal(await obs.locator('.pc').count(), 2, 'una ficha por titular');
    assert.equal(await obs.locator('.pc img').count(), 1, 'foto donde la hay; silueta donde no');
    assert.equal(await obs.locator('.pc .sil').count(), 1);
    assert.deepEqual(await obs.locator('.pc-name').allInnerTexts(), ['FERRER', 'GARCIA']);
    await obs.goto(`${s.base}/studio/v`);
    await obs.waitForSelector('.timeline');
    const g = await ctl.cmd('event.add', { type: 'goal', team: ctl.state.match.ffspSide, awaiting: true });
    const p9 = ctl.state.squad.roster.find((p) => p.number === '9');
    await ctl.cmd('event.update', { id: g.result.eventId, patch: { player: p9.name, number: '9', rosterId: p9.id } });
    await obs.waitForSelector('.goalfx.pro .gx-name', { timeout: 4000 });
    assert.equal(await txt(obs, '.gx-word'), 'GOL');
    assert.match(await txt(obs, '.gx-name'), /Marta Ferrer/i);
    assert.equal(await obs.locator('.gx-photo img').count(), 1, 'la foto de la goleadora sale en la animación');
    // volver al estilo clásico desde los ajustes
    await ctl.cmd('settings.update', { patch: { display: { style: 'classic' } } });
    await obs.waitForFunction(() => !document.body.classList.contains('style-pro'));
    // foto del equipo
    assert.equal((await fetch(`${s.base}/assets/teamphoto`)).status, 404);
    assert.equal((await fetch(`${s.base}/api/upload/teamphoto?k=${s.key}`, { method: 'POST', body: png })).status, 200);
    assert.equal((await fetch(`${s.base}/assets/teamphoto`)).status, 200);
    assert.equal(ctl.state.teamPhoto ?? (await (await fetch(`${s.base}/api/state`)).json()).teamPhoto, true);
  } finally { ctl.close(); await browser.close(); await s.close(); }
});
