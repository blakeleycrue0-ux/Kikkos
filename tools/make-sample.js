// Genera un vídeo de muestra (1080p, 30 s, con sonido) para probar sin la cámara.
//   npm run sample     ->  data/sample/muestra.mp4
// En OBS: Fuentes → + → «Origen multimedia» → este archivo → marcar «Bucle».
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DATA_DIR } from '../server/config.js';
import { ffmpegPath } from '../server/ffmpeg.js';

const dir = path.join(DATA_DIR, 'sample');
const out = path.join(dir, 'muestra.mp4');
fs.mkdirSync(dir, { recursive: true });
if (fs.existsSync(out) && !process.argv.includes('--force')) {
  console.log(`El vídeo de muestra ya existe: ${out}`);
  process.exit(0);
}
console.log('Generando vídeo de muestra (unos segundos)…');
const args = [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=30',
  '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=30',
  '-filter_complex', '[1:a]volume=0.05[a]',
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-pix_fmt', 'yuv420p', '-g', '30',
  '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out,
];
const p = spawn(ffmpegPath({}), args, { stdio: ['ignore', 'inherit', 'inherit'] });
p.on('error', (e) => { console.error('No se encontró FFmpeg:', e.message); process.exit(1); });
p.on('close', (c) => { if (c === 0) console.log(`Listo: ${out}`); process.exit(c); });
