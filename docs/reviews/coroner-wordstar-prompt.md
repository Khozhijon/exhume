Review the format module `wordstar` (spec task 11, requirement 7 in `.kiro/specs/exhume-core/requirements.md`,
byte layout in `docs/formats/wordstar.md`). Follow your instructions: evidence with file and line, no edits
under `src/`, findings ordered by severity, verdict at the end, written to `docs/reviews/coroner-wordstar.md`.

Work economically: read `docs/formats/wordstar.md`, grep requirement 7 (do not read the whole
requirements file), then `src/formats/wordstar/decode.ts`, `detect.ts`, `encode.ts`, `model.ts` and the
two test files. Use the exhume MCP tools on `public/samples/LETTER.WS` (`identify`, `autopsy` with
maxDepth 2, `hexdump` of the first 256 bytes) and check by hand that at least three things the notes
promise are really visible in the bytes: a word-final high bit, a soft carriage return (8D 0A) and the
^Z padding to a 128-byte boundary. Run `npx vitest run src/formats/wordstar 2>&1 | tail -15` once.
Focus on: can `decode` throw anything but ExhumeError; is the heuristic `detect` safe against plain
text, Latin-1 text and binary; do the property tests really exercise P1-P4 (look at the model
arbitrary); does any acceptance criterion of requirement 7 lack a test.
Keep the report under 60 lines.
