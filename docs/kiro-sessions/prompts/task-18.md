Implement task 18 of the spec in .kiro/specs/exhume-core/tasks.md, including every sub-task.
Sub-tasks marked optional with `*` (the property tests) are REQUIRED in this project: write them and make them pass.

Work economically: the task text and the design sections you need are inlined below, so do NOT
read requirements.md, design.md or tasks.md in full. Use grep on them only for a specific detail.
Read existing source files you depend on once (several in one step). Write each file in one go,
several files per step. No exploratory listing, no long narration. Check with ONE command:
`npm run -s typecheck && npx vitest run <folders you touched> 2>&1 | tail -40`. At most 3 fix rounds;
if something still fails after that, stop and say exactly what fails.

## The task (from tasks.md)
- [ ] 18. Document Viewer
  - Create `src/ui/DocumentViewer.tsx` rendering `DocumentPayload.blocks` as paragraphs with inline `TextRun` spans; apply bold, italic, underline, strikethrough, superscript, and subscript via HTML/CSS
  - Render `pageBreak` blocks as visible horizontal separators
  - Wrap the document in a fan-fold dot-matrix-paper-style frame
  - _Requirements: 14.1, 14.2, 14.3_


## Notes from the reviewer
The app shell already exists. Fit into it exactly:
- Replace the placeholder file `src/ui/viewers/DocumentViewer.tsx` (NOT `src/ui/DocumentViewer.tsx`).
  Keep the export signature: `export interface DocumentViewerProps { payload: DocumentPayload; fileName: string }`
  and `export function DocumentViewer(props: DocumentViewerProps)`. Types are in `src/core/types.ts`.
- Styles go in a new file `src/ui/viewers/document.css`, imported from the component. Do not edit other
  CSS files. Use the CSS variables of `src/ui/theme.css` and the existing `.btn`, `.chip`, `.sr-only`.
- Look: continuous fan-fold printer paper lying on the dark page. Off-white paper (#f4f1e6) with faint
  green bars every other "inch" (a repeating-linear-gradient, very low contrast), tractor-feed strips
  down both edges: a column of punched holes made with a repeating radial-gradient on `::before` and
  `::after`, separated from the text area by a dashed perforation line. Text in a monospace
  "dot-matrix" look: `var(--mono)`, colour #1c1b22, 15px, line-height 1.55, max line about 72ch,
  `white-space: pre-wrap`. Paper has a soft drop shadow. Everything CSS only, no images.
- Content: each `paragraph` block is a `<p>`; runs map to semantic elements: bold `<strong>`, italic
  `<em>`, underline `<u>`, strike `<s>`, sup `<sup>`, sub `<sub>` (nest them when a run has several
  flags). An empty paragraph (`runs: []`) renders as a blank line (keep its height).
  `pageBreak` blocks render as a perforation across the full paper width (dashed line) with a small
  centred label "page N" for the page that starts after it, and `role="separator"`.
- `payload.header` / `payload.footer`: show the header at the top of every page and the footer at the
  bottom of every page (i.e. before each page break and at the end), dimmer and centred, with
  `aria-label="Running header"` / `"Running footer"`. WordStar uses `#` in headers and footers for
  the page number: replace `#` with the current page number.
- Above the paper, a small tool row (class `viewer-tools`, already styled): chips with the page count,
  paragraph count and word count, and a toggle button (`aria-pressed`) "Paper" / "Plain" that switches
  between the fan-fold look and a plain dark reading view (same content, no paper) for people who
  find the paper hard to read.
- The document container is an `<article aria-label={fileName}>`. Contrast on paper must be at least 4.5:1.
- No new dependencies. Only these two files plus the task checkbox. TypeScript strict,
  `noUncheckedIndexedAccess` is on (indexing an array gives `T | undefined`).
Check with ONE command: `npm run -s typecheck 2>&1 | grep -v "trust settings" | head -20`.
(There may be type errors in files other people are still writing: ignore errors outside your two files.)

## Finish
When the check command passes, mark task 18 and its sub-tasks [x] in tasks.md and give a report of at most 12 lines.
