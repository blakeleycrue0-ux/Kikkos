// Layout check at iPhone sizes (Chromium emulation; NOT a substitute for real Safari).
// Usage: BASE=http://localhost:4173/ node scripts/mobile-layout-check.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4173/';
const SIZES = [[375, 667], [375, 812], [390, 844], [393, 852], [430, 932]];
const INSETS = { top: 59, bottom: 34 }; // Dynamic Island + home indicator (worst case)
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗', m); } };

async function audit(page, name, expectBg, { last } = {}) {
  await page.waitForTimeout(450);
  const r = await page.evaluate(async ({ last }) => {
    const out = {};
    out.hOverflow = document.documentElement.scrollWidth - window.innerWidth;
    out.bg = getComputedStyle(document.documentElement).backgroundColor;
    out.theme = document.querySelector('meta[name="theme-color"]')?.content;
    // topmost interactive/visible element must be below the simulated status bar
    const tops = [...document.querySelectorAll('.screen-host:last-child button, .screen-host:last-child img, .screen-host:last-child h1')]
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    out.minTop = Math.min(...tops.map((b) => b.top + window.scrollY));
    if (last) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 80));
      const el = [...document.querySelectorAll(last)].pop();
      const b = el?.getBoundingClientRect();
      out.lastBottom = b ? b.bottom : null;
      const docH = document.documentElement.scrollHeight;
      // only meaningful when the page actually scrolls; short screens just fill the viewport
      out.gapBelow = docH > window.innerHeight + 1 ? docH - (b ? b.bottom + window.scrollY : 0) : 0;
      window.scrollTo(0, 0);
    }
    out.vh = window.innerHeight;
    return out;
  }, { last });
  ok(r.hOverflow <= 0, `${name}: horizontal overflow ${r.hOverflow}px`);
  ok(r.minTop >= INSETS.top - 1, `${name}: element at ${Math.round(r.minTop)}px under the status bar`);
  if (expectBg) ok(r.theme?.toUpperCase() === expectBg.toUpperCase(), `${name}: theme-color ${r.theme} ≠ ${expectBg}`);
  if (last) {
    ok(r.lastBottom !== null && r.lastBottom <= r.vh - INSETS.bottom + 1, `${name}: last element (${last}) bottom ${Math.round(r.lastBottom)} hidden behind home indicator (vh ${r.vh})`);
    ok(r.gapBelow < 140, `${name}: ${Math.round(r.gapBelow)}px of empty space after the content`);
  }
  if (/rgb\(41, 35, 42\)/.test(r.bg) && !/play|onboarding 2/i.test(name)) ok(false, `${name}: dark root background ${r.bg}`);
}

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of SIZES) {
    console.log(`— ${w}×${h}`);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await ctx.addInitScript(({ t, b }) => {
      const s = document.createElement('style');
      s.textContent = `:root{--sat:${t}px!important;--sab:${b}px!important}`;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }, { t: INSETS.top, b: INSETS.bottom });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE);
    await page.getByText('Let’s play').waitFor();
    await audit(page, 'welcome', '#3777F6', { last: '.welcome__slab .key' });
    await page.getByText('Let’s play').click();
    await audit(page, 'onboarding 1', '#3777F6', { last: '.ob-copy .key' });
    await page.getByRole('button', { name: /Next/ }).click();
    await audit(page, 'onboarding 2', '#29232A', { last: '.ob-copy .key' });
    await page.getByRole('button', { name: /Next/ }).click();
    await audit(page, 'onboarding 3', '#FFF8E9', { last: '.ob-copy .key' });
    await page.getByRole('button', { name: /Start playing/ }).click();
    await audit(page, 'auth', '#FFF8E9', { last: '.auth__skip' });
    await page.locator('#uname').fill('tester');
    await page.getByRole('button', { name: /Create player/ }).click();
    await audit(page, 'today', '#FFF8E9', { last: '.arcade-strip' });
    // Safari bars collapsing/expanding: viewport height changes mid-session
    await page.setViewportSize({ width: w, height: h - 90 });
    await audit(page, 'today (shorter viewport)', '#FFF8E9', { last: '.arcade-strip' });
    await page.setViewportSize({ width: w, height: h });
    await page.locator('.duo--world').click();
    await audit(page, 'world', '#3777F6', { last: '.board__rules' });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('.duo--friends').click();
    await audit(page, 'friends', '#FFF8E9', { last: '.friends__actions .pill' });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('.arcade-strip').click();
    await audit(page, 'arcade', '#FFF8E9', { last: '.arcade__lab-note' });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Your profile' }).click();
    await audit(page, 'profile', '#FFF8E9', { last: '.profile__foot' });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /Play/ }).first().click();
    await audit(page, 'prep', '#3777F6', { last: '.prep__foot .key' });
    await page.getByRole('button', { name: /ready/ }).click();
    await page.waitForTimeout(3400);
    const grid = await page.evaluate(() => {
      const g = document.querySelector('.play__grid').getBoundingClientRect();
      return { bottom: g.bottom, top: g.top, vh: innerHeight, docH: document.documentElement.scrollHeight };
    });
    ok(grid.bottom <= grid.vh - INSETS.bottom, `play: grid bottom ${Math.round(grid.bottom)} beyond safe area (vh ${grid.vh})`);
    ok(grid.docH <= grid.vh + 1, `play: page scrolls during gameplay (doc ${grid.docH} > vh ${grid.vh})`);
    await audit(page, 'play', '#29232A');
    // finish quickly: wait for the timer
    await page.getByRole('button', { name: /Leaderboard/ }).waitFor({ timeout: 40000 });
    await audit(page, 'results', '#3777F6', { last: '.results__next' });
    ok(errors.length === 0, `console errors: ${errors.join(' | ')}`);
    ok(!(await page.locator('.tabbar').count()), 'old bottom tab bar is back');
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} problem(s)` : '\nAll layout checks passed');
  process.exit(fails ? 1 : 0);
})();
