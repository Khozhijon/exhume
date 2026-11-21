/// <reference types="vite/client" />

export function registerOffline(onReady: (state: 'ready' | 'unsupported') => void): void {
  // Only register in production and when supported
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    onReady('unsupported');
    return;
  }

  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then(() => {
      // Wait until a service worker is active
      return navigator.serviceWorker.ready;
    })
    .then(() => {
      onReady('ready');
    })
    .catch(() => {
      onReady('unsupported');
    });
}
