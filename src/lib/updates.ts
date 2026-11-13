/**
 * New versions arrive without users clearing data:
 *  - the browser checks for a new service worker on launch and whenever the app returns to the foreground;
 *  - once a new version has taken over, we reload at a SAFE moment only (never during prep, a game or results);
 *  - local progress lives in localStorage and is never touched by updates.
 */
let pending = false;
let busy = false;

function maybeReload() {
  if (pending && !busy && document.visibilityState === 'visible') {
    pending = false;
    window.location.reload();
  }
}

/** Called by the app shell on each navigation. */
export function setUpdateBusy(isBusy: boolean) {
  busy = isBusy;
  if (!isBusy) setTimeout(maybeReload, 300);
}

export function initUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
  // first install also fires controllerchange; only a REPLACED worker means a new version
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    pending = true;
    maybeReload();
  });
  document.addEventListener('visibilitychange', maybeReload);
  // a lazily-loaded screen from an older deploy is gone: refresh to the current version
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    pending = true;
    maybeReload();
  });
}
