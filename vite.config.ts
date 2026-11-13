import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + '-' + Math.random().toString(36).slice(2, 6);

/** Stamps the service worker with a unique build id so each deploy is detected as an update. */
function stampServiceWorker(): Plugin {
  return {
    name: 'kikko-stamp-sw',
    apply: 'build',
    closeBundle() {
      const f = fileURLToPath(new URL('./dist/sw.js', import.meta.url));
      writeFileSync(f, readFileSync(f, 'utf8').replace('__KIKKO_BUILD__', BUILD_ID));
    },
  };
}

/** Preload the two Latin variable fonts so text paints in the right face immediately. */
function preloadFonts(): Plugin {
  return {
    name: 'kikko-preload-fonts',
    apply: 'build',
    transformIndexHtml(_html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) =>
        /(outfit-latin-wght-normal|plus-jakarta-sans-latin-wght-normal)-.*\.woff2$/.test(f));
      return files.map((f) => ({
        tag: 'link', injectTo: 'head' as const,
        attrs: { rel: 'preload', href: `/${f}`, as: 'font', type: 'font/woff2', crossorigin: '' },
      }));
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadFonts(), stampServiceWorker()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) },
  },
  build: { target: 'es2020', sourcemap: false },
});
