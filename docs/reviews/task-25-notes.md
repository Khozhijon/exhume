The deploy workflow (`.github/workflows/deploy.yml`), `public/favicon.svg` and the `<link rel="manifest"
href="./manifest.webmanifest">` tag in `index.html` already exist: do not redo them. The site is served
from a sub-path on GitHub Pages and Vite is configured with `base: './'`, so every URL you write must be
RELATIVE (`./sw.js`, `./`, `./favicon.svg`), never root-absolute.

Do exactly these things:
1. `public/manifest.webmanifest`: name "Exhume", short_name "Exhume", description (one sentence),
   `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `background_color` and `theme_color`
   `#0b0d12`, one icon entry for `./favicon.svg` (`"sizes": "any"`, `"type": "image/svg+xml"`,
   `"purpose": "any"`).
2. `public/sw.js`: a small service worker, no libraries. Cache name with a version constant.
   `install`: precache `./` and `./favicon.svg` and `./manifest.webmanifest`, then `skipWaiting()`.
   `activate`: delete old caches, `clients.claim()`. `fetch`: only handle same-origin GET requests;
   for navigations use network-first falling back to the cached `./`; for everything else use
   cache-first and put successful network responses into the cache (this is how the hashed JS/CSS
   bundles get cached on first load). Never touch cross-origin requests. The app's file data never
   goes through the network, so the worker never sees it: say that in a comment.
3. `src/ui/offline.ts`: `export function registerOffline(onReady: (state: 'ready' | 'unsupported') => void): void`
   that registers `./sw.js` only when `import.meta.env.PROD` and `'serviceWorker' in navigator`, and
   calls `onReady('ready')` once a worker is active (`navigator.serviceWorker.ready`). No network
   calls of its own. Add `/// <reference types="vite/client" />` at the top if TypeScript needs it for
   `import.meta.env`.
4. `src/ui/Graveyard.tsx`: call `registerOffline` in a `useEffect` and, inside the existing
   `<footer className="colophon">`, add a line with `role="status"`: "Offline ready: this page now works
   without a connection." when ready (nothing when not). Also add, in the same footer, a short
   privacy paragraph: files are decoded in this tab, nothing is uploaded, there is no server, no
   analytics, no cookies; and a link "Source code" to `https://github.com/Khozhijon/exhume`.
5. Accessibility pass (requirement 22), small and concrete:
   - `src/App.tsx`: add a "Skip to content" link as the first focusable element (class `skip-link`,
     `href="#main"`), give the `<main>` elements `id="main"` and `tabIndex={-1}` (in
     `src/ui/Graveyard.tsx` and `src/ui/SpecimenView.tsx`), and when the phase changes to `specimen`
     or back to `graveyard`, move focus to `#main` (in the existing effect that scrolls to top).
   - `src/ui/theme.css`: styles for `.skip-link` (visually hidden until focused, then a visible
     ember-outlined chip at the top left) and `main:focus { outline: none; }`.
   - `src/ui/SpecimenView.tsx`: the tab list must support Left/Right arrow keys moving between tabs
     (roving `tabIndex`: selected tab 0, others -1) as the ARIA tabs pattern says.
Touch only the files named above and the task checkbox. TypeScript strict; `noUncheckedIndexedAccess` is on.
Check with ONE command: `npm run -s typecheck 2>&1 | grep -v "trust settings" | head -20 && npx vitest run src/samples 2>&1 | tail -5`.
