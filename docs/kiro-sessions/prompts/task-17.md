Implement task 17 of the spec in .kiro/specs/exhume-core/tasks.md, including every sub-task.
Sub-tasks marked optional with `*` (the property tests) are REQUIRED in this project: write them and make them pass.

Work economically: the task text and the design sections you need are inlined below, so do NOT
read requirements.md, design.md or tasks.md in full. Use grep on them only for a specific detail.
Read existing source files you depend on once (several in one step). Write each file in one go,
several files per step. No exploratory listing, no long narration. Check with ONE command:
`npm run -s typecheck && npx vitest run <folders you touched> 2>&1 | tail -40`. At most 3 fix rounds;
if something still fails after that, stop and say exactly what fails.

## The task (from tasks.md)
- [ ] 17. Table Viewer
  - Create `src/ui/TableViewer.tsx` with column headers derived from field names and types in a dBASE dot-prompt-style browse frame
  - Render logically-deleted records with CSS `text-decoration: line-through`
  - Add a toggle button to show or hide deleted records; hidden records remain in `specimen.payload.records`
  - _Requirements: 13.1, 13.2, 13.3_


## Notes from the reviewer
The app shell already exists. Fit into it exactly:
- Replace the placeholder file `src/ui/viewers/TableViewer.tsx` (NOT `src/ui/TableViewer.tsx`). Keep the
  export signature: `export interface TableViewerProps { payload: TablePayload; fileName: string }` and
  `export function TableViewer(props: TableViewerProps)`. `TablePayload` is in `src/core/types.ts`.
- Put the styles in a new file `src/ui/viewers/table.css` and import it from the component. Do not edit
  other CSS files. Use the CSS variables from `src/ui/theme.css` (`--night`, `--bone`, `--ember`,
  `--phosphor`, `--mono`, `--blood`, ...) and the existing `.btn`, `.chip`, `.sr-only` classes.
- Look: a dBASE III PLUS screen. Dark navy screen (#000080-ish) in a bezel like `.crt` in
  `src/ui/frames.css`, monospace, a top line that reads like the dot prompt: `. USE RESIDENT` then
  `. BROWSE`, an inverse-video header row, and a status bar at the bottom in inverse video:
  `BROWSE  |<C:>|RESIDENT  |Rec: 3/12  |      |Del|` showing the selected record number, the total,
  and `Del` when the selected record is deleted.
- Behaviour: a real `<table>` with `<th scope="col">` per field showing the name and, smaller, the
  type and width (`C 24`, `N 8.2`, `D`, `L`). Right-align N and F columns. Values: null -> a dim
  middle dot, booleans -> `.T.` / `.F.`, dates as stored (`YYYY-MM-DD`), numbers with `decimals`
  fixed places. A first column with the record number (1-based position in the file) and a `*` for
  deleted records (dBASE's own deletion mark), so deletion is not shown by strikethrough alone.
  Deleted rows: `text-decoration: line-through` and dimmed.
- A toggle button (`aria-pressed`) "Show deleted records (n)" / "Hide deleted records", default ON
  (recovering deleted rows is a feature). Never mutate `payload`.
- Clicking a row selects it (highlight + status bar update); Arrow Up/Down moves the selection when
  the table has focus (`tabIndex={0}`).
- Render at most 1000 rows and say so under the table when there are more.
- Wrap the table in a scroll container (`overflow: auto; max-height: 66vh`) with a sticky header.
- No new dependencies. Only these two files plus the task checkbox. TypeScript strict,
  `noUncheckedIndexedAccess` is on (indexing an array gives `T | undefined`).
Check with ONE command: `npm run -s typecheck 2>&1 | grep -v "trust settings" | head -20`.
(There may be type errors in files other people are still writing: ignore errors outside your two files.)

## Finish
When the check command passes, mark task 17 and its sub-tasks [x] in tasks.md and give a report of at most 12 lines.
