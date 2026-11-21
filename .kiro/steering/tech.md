---
inclusion: always
---
# Tech

- **Language:** TypeScript, `strict: true`. No `any` in `src/core` or `src/formats`.
- **App:** Vite + React 18, static build, deployed to GitHub Pages (base path from `VITE_BASE`).
  No backend. No runtime network requests except loading the app's own static assets.
- **Tests:** Vitest + fast-check (property-based tests). Test files live next to the code as
  `*.test.ts` (example tests) and `*.prop.test.ts` (property tests).
- **MCP server:** `mcp/server.mjs`, Node stdio server that exposes the same decoders as tools so an
  agent can inspect binary fixtures. It imports the compiled core, never re-implements a format.
- **Dependencies:** keep them few. Allowed runtime deps: `react`, `react-dom`, `fflate` (zip for XLSX).
  Dev deps: `vite`, `typescript`, `vitest`, `fast-check`, `@vitejs/plugin-react`,
  `@modelcontextprotocol/sdk`, `zod`. Ask before adding anything else.
- **No format libraries.** Every legacy format is decoded by code in this repo, written from the
  published format descriptions. That is the point of the project.
- **Browser support:** current Chrome, Firefox, Safari. Use `Uint8Array`/`DataView`, never Node `Buffer`
  in `src/`.

## Commands
- `npm run dev` - local dev server
- `npm run build` - type-check and build to `dist/`
- `npm test` - run all tests once (`vitest run`)
- `npm run typecheck` - `tsc --noEmit`
- `npm run samples` - regenerate built-in sample specimens into `public/samples/`

## Rules for agents
- Run `npm run typecheck` and the tests for the files you touched before saying a task is done.
- Never weaken or delete a failing test to make it pass. Fix the code, or report the conflict.
- Do not run `git commit`, `git push`, installers, or anything outside this repository.
- Keep files under ~300 lines; split by responsibility.

## Module conventions
- Relative imports in `src/` are written with a `.js` extension (`import { x } from './types.js'`), so
  the same sources work in Vite and when compiled for Node.
- `npm run build:core` compiles `src/core`, `src/formats` and `src/export` to `mcp/dist/` for the MCP
  server and the samples script. Node code imports from `mcp/dist/...`, never from `src/`.
- Shell access in headless runs is limited by `.kiro/hooks/shell-guard.json`: no git writes, no
  deletes outside the repo, no downloads, no sudo.
