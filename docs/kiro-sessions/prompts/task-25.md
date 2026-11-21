Implement task 25 of the spec in .kiro/specs/exhume-core/tasks.md, including every sub-task.
Sub-tasks marked optional with `*` (the property tests) are REQUIRED in this project: write them and make them pass.

Work economically: the task text and the design sections you need are inlined below, so do NOT
read requirements.md, design.md or tasks.md in full. Use grep on them only for a specific detail.
Read existing source files you depend on once (several in one step). Write each file in one go,
several files per step. No exploratory listing, no long narration. Check with ONE command:
`npm run -s typecheck && npx vitest run <folders you touched> 2>&1 | tail -40`. At most 3 fix rounds;
if something still fails after that, stop and say exactly what fails.

## The task (from tasks.md)
- [ ] 25. Offline / PWA, accessibility pass, and deploy workflow
  - Add a service worker (Vite PWA plugin or hand-written `public/sw.js`) that pre-caches all static assets on first load; no user file data ever touches the cache
  - Add a persistent, visible privacy notice to the UI: "All files decoded locally. Nothing leaves your browser."
  - Audit all interactive elements: visible `--ember` focus ring on every focusable element; `aria-live` regions announce "Exhuming…", "Done", and error messages; minimum 4.5:1 contrast ratio for all text; Autopsy colour spans carry text labels (no information by colour alone); keyboard tab order through tombstones, drop zone, zoom controls, export buttons, and autopsy tree
  - Create `.github/workflows/deploy.yml` with steps: checkout → install → `npm run typecheck` → `npm test` → `npm run build` → deploy `dist/` to GitHub Pages; `VITE_BASE` read from env
  - _Requirements: 21.1, 21.2, 21.3, 22.1, 22.2, 22.3, 22.4, 22.5_


## Notes from the reviewer
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

## Finish
When the check command passes, mark task 25 and its sub-tasks [x] in tasks.md and give a report of at most 12 lines.
