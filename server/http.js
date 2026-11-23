// Servidor HTTP: páginas estáticas, API mínima y descargas (clips, exportaciones, logos).
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { PUBLIC_DIR } from './config.js';
import { exportCsv } from './engine.js';
import { uid } from './util.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const PAGES = [
  [/^\/control\/?$/, 'control.html'],
  [/^\/(overlay|studio)(\/(h|v))?\/?$/, 'screen.html'],
  [/^\/live\/?$/, 'screen.html'],
  [/^\/calibrate\/?$/, 'calibrate.html'],
  [/^\/preview(\/.*)?$/, 'preview.html'],
];

export function parseCookies(h) {
  const out = {};
  for (const p of String(h || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) { return req.socket.remoteAddress || ''; }

function send(res, status, body, headers = {}) {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(buf);
}

export function serveFile(req, res, file, { download, extra = {} } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return send(res, 404, 'No encontrado'); }
  if (!st.isFile()) return send(res, 404, 'No encontrado');
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(file).replace(/"/g, '')}"`;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
    else { start = Math.max(0, st.size - Number(range[2])); }
    if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > max) { reject(Object.assign(new Error('Archivo demasiado grande'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sniffImage(b) {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  const head = b.subarray(0, 400).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
}

export function createRequestHandler(app) {
  const authed = (req, url) => {
    const c = parseCookies(req.headers.cookie);
    if (app.validSession(c.ffsp_s)) return true;
    const k = req.headers['x-key'] || url.searchParams.get('k');
    return !!k && app.checkKey(k);
  };

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return send(res, 405, 'Método no permitido');

      // ----------------------------------------------------------------- API
      if (p === '/api/ping') return send(res, 200, { t: Date.now() });

      if (p === '/api/login' && req.method === 'POST') {
        const ip = clientIp(req);
        const wait = app.throttle(ip);
        if (wait) return send(res, 429, { ok: false, error: `Demasiados intentos. Espera ${wait} s.` });
        let body = {};
        try { body = JSON.parse((await readBody(req, 2048)).toString() || '{}'); } catch { /* */ }
        if (!app.checkKey(body.key)) { app.noteFailure(ip); return send(res, 401, { ok: false, error: 'Clave incorrecta' }); }
        app.clearFailures(ip);
        const token = app.newSession(req.headers['user-agent']);
        return send(res, 200, { ok: true }, { 'Set-Cookie': `ffsp_s=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000` });
      }

      if (p === '/api/state') return send(res, 200, app.publicState());

      if (p.startsWith('/api/')) {
        if (!authed(req, url)) return send(res, 401, { ok: false, error: 'No autorizado' });

        if (p === '/api/admin') return send(res, 200, app.adminState());

        if (p === '/api/qr') {
          const text = String(url.searchParams.get('text') || '').slice(0, 400);
          const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B0B0F', light: '#FFFFFF' } });
          return send(res, 200, svg, { 'Content-Type': 'image/svg+xml' });
        }

        if (p === '/api/upload/logo' && req.method === 'POST') {
          const buf = await readBody(req, 3 * 1024 * 1024);
          const kind = sniffImage(buf);
          if (!kind) return send(res, 415, { ok: false, error: 'Formato no admitido (usa PNG, JPG, WEBP o SVG)' });
          const name = `${uid(12)}.${kind}`;
          fs.writeFileSync(path.join(app.store.logosDir, name), buf);
          return send(res, 200, { ok: true, url: `/assets/logos/${name}` });
        }

        let m;
        if ((m = /^\/api\/matches\/([a-z0-9]+)\/export$/i.exec(p))) {
          const match = app.store.loadMatch(m[1]);
          if (!match) return send(res, 404, { ok: false, error: 'Partido no encontrado' });
          const fmt = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
          const base = `partido-${match.date}-${match.home.short}-${match.away.short}`.replace(/[^\w.-]+/g, '_');
          const body = fmt === 'csv' ? exportCsv(match) : JSON.stringify({ ...match, exportedAt: Date.now() }, null, 2);
          return send(res, 200, body, {
            'Content-Type': fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${base}.${fmt}"`,
          });
        }
        if ((m = /^\/api\/clips\/([a-z0-9]+)\/file$/i.exec(p))) {
          const f = app.clips.filePath(m[1]);
          if (!f) return send(res, 404, { ok: false, error: 'El archivo del clip no existe' });
          return serveFile(req, res, f, { download: url.searchParams.get('download') === '1' });
        }
        return send(res, 404, { ok: false, error: 'No encontrado' });
      }

      // ------------------------------------------------------------- estáticos
      if (p.startsWith('/assets/logos/')) {
        const name = path.basename(p);
        return serveFile(req, res, path.join(app.store.logosDir, name), {
          extra: { 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
        });
      }
      if (p === '/sample.mp4') return serveFile(req, res, path.join(app.store.sampleDir, 'muestra.mp4'), { extra: { 'Cache-Control': 'no-store' } });

      if (p === '/') { res.writeHead(302, { Location: '/control' }); return res.end(); }
      for (const [re, file] of PAGES) {
        if (re.test(p)) return serveFile(req, res, path.join(PUBLIC_DIR, file), { extra: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
      }
      const rel = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
      const abs = path.join(PUBLIC_DIR, rel);
      if (!abs.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Prohibido');
      const isFont = abs.includes(`${path.sep}fonts${path.sep}`);
      return serveFile(req, res, abs, { extra: { 'Cache-Control': isFont ? 'public, max-age=604800' : 'no-store' } });
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.status ? e.message : 'Error interno' });
      else res.destroy();
      if (!e.status) console.error('[http]', e);
    }
  };
}
