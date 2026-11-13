import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

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
  plugins: [react(), preloadFonts()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) },
  },
  build: { target: 'es2020', sourcemap: false },
});
