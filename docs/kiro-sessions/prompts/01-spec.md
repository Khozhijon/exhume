Create a feature spec named `exhume-core` in `.kiro/specs/exhume-core/` for the whole version 1 of
this product. Requirements-first. Write all three files in this one session without stopping for
approval: `requirements.md`, `design.md`, `tasks.md`. Do not write any application code yet.

Inputs you must read first: `docs/brief.md`, every file in `docs/formats/`, and the steering documents
(`.kiro/steering/*.md`, including `formats.md` and `ui.md`).

requirements.md
- An introduction and a glossary (Specimen, Annotation, FormatModule, Autopsy, Reincarnate, Warning).
- Numbered requirements, each with a user story and numbered acceptance criteria in EARS form
  ("WHEN ... THE SYSTEM SHALL ...", "IF ... THEN THE SYSTEM SHALL ...", "WHILE ...", "WHERE ...").
- Cover: format identification; one requirement per format (six) with the byte-level behaviour that
  matters from docs/formats; damaged input and limits; annotations/autopsy; warnings (coroner's report);
  each viewer kind; export (PNG, CSV, XLSX with formula translation, JSON, Markdown, HTML, text);
  built-in samples; privacy/offline; accessibility; the exhume-mcp server.

design.md
- Architecture with a mermaid diagram, the core TypeScript types (Specimen, payload unions, Annotation,
  Warning, ExhumeError, FormatModule, ByteReader, ByteWriter), limits, registry/sniffing order,
  per-format decoding and encoding notes, the Lotus formula decompiler and the Lotus-to-Excel formula
  translator, export design (minimal XLSX writer on top of fflate), UI component tree and state,
  the MCP server tools with their input schemas, error handling, testing strategy.
- A section "Correctness Properties". Each property is numbered, stated as "For any ...", names the
  fast-check arbitrary it needs, and ends with "Validates: Requirements x.y, ...". Include P1-P4 from
  steering for every format plus codec, formula, CSV and XLSX properties from the brief.

tasks.md
- A numbered checkbox list (`- [ ] 1. ...`, sub-tasks `- [ ] 1.1 ...`), ordered so that each task
  builds on the previous ones and the app runs after every top-level task. Every task ends with
  `_Requirements: x.y, x.z_`. Property tests are their own sub-tasks, name the property number
  ("Property 3") and come right after the code they test. Each top-level task must be small enough
  for one agent session (a format module with its tests is one top-level task).
- Order: project scaffold and tooling; core (reader, writer, types, registry, limits, code pages,
  packbits); exhume-mcp with `hexdump` and `identify` (so later tasks can use it); the six formats
  (macpaint, pcx, ilbm, dbf, wordstar, wk1 values, wk1 formulas); samples generator; UI shell and
  Graveyard; viewers; Autopsy; exports; XLSX and formula translation; MCP `autopsy` and `decode`;
  offline/PWA, accessibility pass, deploy workflow.

Keep each file precise rather than long. When the format notes leave something open, decide and
record the decision in design.md under "Decisions". Finish by printing the list of top-level tasks.
