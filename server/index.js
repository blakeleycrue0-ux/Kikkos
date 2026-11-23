import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PORT, DATA_DIR } from './config.js';
import { App } from './app.js';
import { createRequestHandler } from './http.js';
import { attachWebSocket } from './ws.js';

export async function startServer({ port = PORT, dataDir = DATA_DIR, quiet = false } = {}) {
  const app = new App({ dataDir, port });
  const server = http.createServer(createRequestHandler(app));
  const sockets = attachWebSocket(server, app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  const actual = server.address().port;
  app.port = actual;
  await app.start();
  const close = async () => {
    sockets.close();
    app.stop();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  };
  if (!quiet) banner(app, actual);
  return { app, server, port: actual, close };
}

function banner(app, port) {
  const key = app.settings.key;
  const lan = app.lanAddresses();
  const line = '─'.repeat(64);
  console.log(`\n${line}\n  FFSP · Control de retransmisiones\n${line}`);
  console.log(`  Panel en este portátil : http://localhost:${port}/control?k=${key}`);
  for (const l of lan) console.log(`  Panel en el móvil      : ${l.url}/control?k=${key}${l.likely ? '' : '   (red poco probable)'}`);
  console.log(`  Clave de control       : ${key}`);
  console.log(`  Fuentes de OBS         : http://localhost:${port}/overlay/h  (y /overlay/v, /studio/h, /studio/v)`);
  console.log(`  Datos                  : ${DATA_DIR}\n${line}\n  Deja esta ventana abierta durante el partido. Ctrl+C para cerrar.\n`);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch { /* */ }
}

const isMain = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  startServer().then(({ app, port, close }) => {
    if (process.argv.includes('--open')) openBrowser(`http://localhost:${port}/control?k=${app.settings.key}`);
    const bye = () => close().finally(() => process.exit(0));
    process.on('SIGINT', bye);
    process.on('SIGTERM', bye);
  }).catch((e) => {
    if (e.code === 'EADDRINUSE') console.error(`\nEl puerto ${PORT} ya está en uso. ¿Ya hay otra ventana de la aplicación abierta?\nPuedes usar otro puerto con:  set PORT=3001 && npm start\n`);
    else console.error(e);
    process.exit(1);
  });
}
