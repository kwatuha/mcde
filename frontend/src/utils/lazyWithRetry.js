import { lazy } from 'react';

const RELOAD_SESSION_KEY = 'machakos:chunk-reload';

function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return (
    error?.name === 'ChunkLoadError'
    || message.includes('Failed to fetch dynamically imported module')
    || message.includes('Importing a module script failed')
    || message.includes('error loading dynamically imported module')
    || message.includes('Loading chunk')
  );
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

/** Lazy import with one automatic full reload when a hashed chunk is missing after deploy. */
export function lazyWithRetry(factory) {
  return lazy(() =>
    factory().catch((error) => {
      if (isChunkLoadError(error)) {
        try {
          if (!sessionStorage.getItem(RELOAD_SESSION_KEY)) {
            sessionStorage.setItem(RELOAD_SESSION_KEY, '1');
            window.location.reload();
            return new Promise(() => {});
          }
          sessionStorage.removeItem(RELOAD_SESSION_KEY);
        } catch {
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw error;
    })
  );
}

export default lazyWithRetry;
