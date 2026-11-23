// Utilidades de FFmpeg: localizar el binario, medir duración y recortar.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

export function ffmpegPath(settings) {
  if (settings?.ffmpegPath) return settings.ffmpegPath;
  try {
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch { /* opcional */ }
  return 'ffmpeg';
}

function run(bin, args, { timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (e) {
      return reject(e);
    }
    let err = '';
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('FFmpeg tardó demasiado')); }, timeoutMs);
    // Prioridad baja: que no compita con la codificación de OBS.
    try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* */ }
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: out, stderr: err }); });
  });
}

export async function ffmpegVersion(settings) {
  try {
    const r = await run(ffmpegPath(settings), ['-version'], { timeoutMs: 8000 });
    const m = /ffmpeg version (\S+)/.exec(r.stdout);
    return r.code === 0 && m ? { ok: true, version: m[1], path: ffmpegPath(settings) } : { ok: false, path: ffmpegPath(settings) };
  } catch (e) {
    return { ok: false, path: ffmpegPath(settings), error: e.code === 'ENOENT' ? 'FFmpeg no está instalado' : e.message };
  }
}

/** Duración en milisegundos, o null si el archivo aún no es legible (se está escribiendo). */
export async function probeDurationMs(settings, file) {
  let r;
  try {
    r = await run(ffmpegPath(settings), ['-hide_banner', '-i', file], { timeoutMs: 30000 });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('FFmpeg no está instalado o no se encuentra');
    return null;
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
  if (!m) return null;
  if (/moov atom not found|Invalid data found|could not find codec/i.test(r.stderr)) return null;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}

export async function cutClip(settings, { input, output, startMs, durationMs, mode }) {
  const ss = (Math.max(0, startMs) / 1000).toFixed(3);
  const t = (Math.max(0.5, durationMs / 1000)).toFixed(3);
  const common = ['-hide_banner', '-y', '-ss', ss, '-i', input, '-t', t];
  const enc = mode === 'fast'
    ? ['-c', 'copy', '-avoid_negative_ts', 'make_zero']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-threads', '3'];
  const args = [...common, ...enc, '-movflags', '+faststart', output];
  const r = await run(ffmpegPath(settings), args);
  if (r.code !== 0) {
    const tail = r.stderr.trim().split('\n').slice(-3).join(' | ');
    throw new Error(`FFmpeg falló: ${tail}`);
  }
  const st = fs.statSync(output);
  if (!st.size) throw new Error('FFmpeg generó un archivo vacío');
  return { size: st.size };
}
