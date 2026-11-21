# Review: task 25 (offline + accessibility), after publishing

Reviewed by Claude Code on 21 Nov, against the first deploy to GitHub Pages.

## A promise that was not kept: "works offline after the first load"

- MUST, fixed by the reviewer. The service worker Kiro wrote pre-cached only the page, the icon and the
  manifest. The scripts and the stylesheet of a first visit are requested before the worker controls
  the page, so they were never stored: on the live site the cache held three entries and no code.
  Offline, the page would have loaded as an empty shell. Yet the page already said "Offline ready",
  because that text only waited for the worker to become active.
- A second defect in the same file: responses were cloned inside a later promise callback, after the
  response had been handed to the page, so run-time caching could fail silently.
- Fix (`public/sw.js`, `src/ui/offline.ts`): once the worker is active the page sends it the addresses
  of the files it has loaded; the worker stores them and answers; only then does the page say
  "Offline ready". Clones are taken before the response is returned. Cache name bumped to `exhume-v2`.
- Why no test caught it: the type-check and unit tests cannot see a service worker, and the earlier
  browser checks ran against the dev server, where the worker is not registered at all.
- New check: `npm run offline` (`scripts/offline-check.mjs`) serves the built site under a sub-path,
  visits once, waits for "Offline ready", cuts the network and stops the server, reloads, and opens all
  six samples. It passes: 11 of 11 checks.

## Kept as Kiro wrote it

The manifest, the skip link and focus handling, arrow-key tabs, and the registration being limited to
production builds.
