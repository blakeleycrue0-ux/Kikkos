import { useEffect } from 'react';

/** Exact palette values (theme-color needs real colors, not CSS variables). */
export const CHROME = { cream: '#FFF8E9', blue: '#3777F6', ink: '#29232A', coral: '#FF8C60' } as const;

/**
 * Keeps what iOS/Safari paints around the page in step with the current screen:
 *  - `top` → <meta name="theme-color"> (status bar / top bar tint where the browser honours it)
 *  - `bottom` → the root background (shown below the content, e.g. when Safari hides its bars)
 * A web page cannot recolour another app's in-app browser bars; this only controls our page.
 */
export function useChrome(top: string, bottom: string = top) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--chrome', bottom);
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = top;
  }, [top, bottom]);
}
