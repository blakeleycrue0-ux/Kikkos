import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = Number(process.env.PORT) || 3000;
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const PUBLIC_DIR = path.join(ROOT, 'public');

import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const VERSION = pkg.version;
// Identifica la versión de los archivos en uso: si cambia, las pantallas abiertas se recargan solas.
export const BUILD = (() => {
  let t = 0;
  for (const f of ['public/js/screen.js', 'public/js/control.js', 'public/js/common.js', 'public/css/screen.css']) {
    try { t = Math.max(t, Math.floor(fs.statSync(path.join(ROOT, f)).mtimeMs / 1000)); } catch { /* */ }
  }
  return `${pkg.version}-${t.toString(36)}`;
})();
