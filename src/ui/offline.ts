/// <reference types="vite/client" />

/** Same-origin files this page has loaded: the page itself plus its scripts, styles and icons. */
function loadedFiles(): string[] {
  const origin = window.location.origin;
  const page = window.location.href.split('#')[0] ?? window.location.href;
  const resources = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(origin));
  return [page, ...resources];
}

/**
 * Registers the service worker and reports 'ready' only once the worker has confirmed that the files
 * of this visit are stored, so "Offline ready" on the page is a fact and not a hope.
 * The files of the first visit are requested before the worker controls the page, which is why the
 * page hands their addresses over instead of relying on the worker having seen them.
 */
export function registerOffline(onReady: (state: 'ready' | 'unsupported') => void): void {
  // Only register in production and when supported
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    onReady('unsupported');
    return;
  }

  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      const worker = registration.active;
      if (!worker) {
        onReady('unsupported');
        return;
      }
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent<{ type?: string; failed?: number }>) => {
        onReady(event.data?.type === 'precached' && event.data.failed === 0 ? 'ready' : 'unsupported');
      };
      worker.postMessage({ type: 'precache', urls: loadedFiles() }, [channel.port2]);
    })
    .catch(() => {
      onReady('unsupported');
    });
}
