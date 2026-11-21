// Properties P1-P4 (shared harness) plus Property 8 (formula decompile/re-encode round trip).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ExhumeError } from '../../core/types.js';
import type { SheetCell, SheetPayload } from '../../core/types.js';
import { formatProperties } from '../../core/testing.js';
import { decode } from './decode.js';
import { wk1 } from './index.js';
import { translateToExcel } from './excel.js';
import { FUNCTIONS, BIN_OPCODE, MAX_COL, MAX_ROW } from './formula-ast.js';
import type { BinOp, Coord, Expr, UnOp } from './formula-ast.js';
import { decompileFormula, decompileToExpr } from './formula.js';
import { compileFormula, emitBytecode, parseFormula } from './formula-parse.js';

// ---- formula tree generator ------------------------------------------------------------------

const edgeBiased = (max: number): fc.Arbitrary<number> =>
  fc.oneof(fc.constantFrom(0, 1, 2, max - 1, max), fc.integer({ min: 0, max }));
const coord = (max: number): fc.Arbitrary<Coord> => fc.record({ abs: fc.boolean(), v: edgeBiased(max) });
const col = coord(MAX_COL);
const row = coord(MAX_ROW);

const latin1String = (maxLength: number): fc.Arbitrary<string> =>
  fc.array(fc.integer({ min: 1, max: 255 }), { maxLength }).map((cs) => String.fromCharCode(...cs));

const numberArb: fc.Arbitrary<Expr> = fc
  .oneof(
    fc.integer({ min: 0, max: 40000 }),
    fc.constantFrom(0, 1, 32767, 32768, 0.5, 1.1, 1e21, 1e-7, 5e-324, Number.MAX_VALUE),
    fc.double({ min: 0, max: 1e300, noNaN: true, noDefaultInfinity: true }),
  )
  .map((v) => ({ t: 'num', v }));

const stringArb: fc.Arbitrary<Expr> = latin1String(8)
  .filter((s) => !(s.includes('"') && s.includes("'")))
  .map((v) => ({ t: 'str', v }));

const rangeArb: fc.Arbitrary<Expr> = fc
  .tuple(col, col, row, row)
  .map(([a, b, c, d]) => {
    const [c1, c2] = a.v <= b.v ? [a, b] : [b, a];
    const [r1, r2] = c.v <= d.v ? [c, d] : [d, c];
    return { t: 'range', c1, r1, c2, r2 } as Expr;
  });

const BIN_OPS = Object.keys(BIN_OPCODE) as BinOp[];
const UN_OPS: UnOp[] = ['-', '+', '#NOT#'];

export const exprArb: fc.Arbitrary<Expr> = fc.letrec<{ expr: Expr }>((tie) => ({
  expr: fc.oneof(
    { depthSize: 'small', maxDepth: 4 },
    numberArb,
    stringArb,
    fc.record({ t: fc.constant('ref' as const), col, row }),
    rangeArb,
    fc.record({ t: fc.constant('paren' as const), e: tie('expr') }),
    fc.record({ t: fc.constant('un' as const), op: fc.constantFrom(...UN_OPS), e: tie('expr') }),
    fc.record({ t: fc.constant('bin' as const), op: fc.constantFrom(...BIN_OPS), l: tie('expr'), r: tie('expr') }),
    fc.constantFrom(...FUNCTIONS).chain((f) =>
      (f.arity === 'var' ? fc.array(tie('expr'), { minLength: 1, maxLength: 4 }) : fc.tuple(...Array.from({ length: f.arity }, () => tie('expr'))).map((a) => a as Expr[])).map(
        (args): Expr => ({ t: 'fn', name: f.name, args }),
      ),
    ),
  ),
})).expr;

function strip(e: Expr): Expr {
  switch (e.t) {
    case 'paren': return strip(e.e);
    case 'un': return { ...e, e: strip(e.e) };
    case 'bin': return { ...e, l: strip(e.l), r: strip(e.r) };
    case 'fn': return { ...e, args: e.args.map(strip) };
    default: return e;
  }
}

/** The whole of Property 8 for one tree placed in the cell (c, r). */
function checkFormula(tree: Expr, c: number, r: number): void {
  const bytes0 = emitBytecode(tree, c, r);
  // the bytes decompile to the same tree (up to parentheses)
  const back = decompileToExpr(bytes0, c, r);
  expect(back).not.toBeNull();
  expect(strip(back as Expr)).toEqual(strip(tree));
  // encode -> decompile -> re-encode -> decompile gives the same string
  const text1 = decompileFormula(bytes0, c, r);
  expect(text1).not.toBeNull();
  const bytes1 = compileFormula(text1 as string, c, r);
  expect(decompileFormula(bytes1, c, r)).toBe(text1);
  // the compiler's own bytes are a fixed point
  expect(compileFormula(decompileFormula(bytes1, c, r) as string, c, r)).toEqual(bytes1);
  // the text means the same tree (precedence and parentheses are right)
  expect(strip(parseFormula(text1 as string))).toEqual(strip(tree));
  // the same tree without any parenthesis tokens: the decompiler must put the needed ones back
  const bare = strip(tree);
  const bareText = decompileFormula(emitBytecode(bare, c, r), c, r);
  expect(bareText).not.toBeNull();
  expect(strip(parseFormula(bareText as string))).toEqual(bare);
  const bareBytes = compileFormula(bareText as string, c, r);
  expect(decompileFormula(bareBytes, c, r)).toBe(bareText);
  // the Excel translator never throws on printed text (null is allowed)
  const excel = translateToExcel(text1 as string);
  expect(excel === null || typeof excel === 'string').toBe(true);
}

describe('wk1 Property 8: formula decompile/re-encode round trip', () => {
  it('holds for generated trees at generated cells (all operators, all functions, edge references)', () => {
    fc.assert(
      fc.property(exprArb, edgeBiased(MAX_COL), edgeBiased(MAX_ROW), (tree, c, r) => checkFormula(tree, c, r)),
      { numRuns: 1500 },
    );
  });

  it('holds for every operator and every function, in the four corners of the sheet', () => {
    const a: Expr = { t: 'ref', col: { abs: false, v: 3 }, row: { abs: false, v: 4 } };
    const b: Expr = { t: 'range', c1: { abs: true, v: 0 }, r1: { abs: false, v: 0 }, c2: { abs: false, v: 255 }, r2: { abs: true, v: 8191 } };
    const one: Expr = { t: 'num', v: 1 };
    const trees: Expr[] = [];
    for (const op of BIN_OPS) trees.push({ t: 'bin', op, l: a, r: one }, { t: 'bin', op, l: { t: 'un', op: '-', e: one }, r: { t: 'bin', op: '+', l: a, r: b } });
    for (const op of UN_OPS) trees.push({ t: 'un', op, e: a }, { t: 'un', op, e: { t: 'bin', op: '*', l: a, r: one } });
    for (const f of FUNCTIONS) {
      const n = f.arity === 'var' ? 3 : f.arity;
      trees.push({ t: 'fn', name: f.name, args: [a, b, one].slice(0, n).concat(Array.from({ length: Math.max(0, n - 3) }, () => one)) });
    }
    for (const t of trees) for (const [c, r] of [[0, 0], [255, 0], [0, 8191], [255, 8191]]) checkFormula(t, c as number, r as number);
  });

  it('decompiling arbitrary bytes never throws, and its text compiles back to the same text', () => {
    const opcode = fc.oneof(fc.integer({ min: 0, max: 0x5c }), fc.constantFrom(0x80, 0xff));
    const code = fc.array(fc.oneof(opcode, fc.integer({ min: 0, max: 255 })), { maxLength: 40 }).map((a) => Uint8Array.from([...a, 0x03]));
    fc.assert(
      fc.property(code, fc.integer({ min: 0, max: MAX_COL }), fc.integer({ min: 0, max: MAX_ROW }), (bytes, c, r) => {
        const text = decompileFormula(bytes, c, r);
        if (text === null) return;
        const again = decompileFormula(compileFormula(text, c, r), c, r);
        expect(again).toBe(text);
      }),
      { numRuns: 3000 },
    );
  });
});

// ---- valid models for P1-P4 ------------------------------------------------------------------

const formatArb = fc.record({
  type: fc.integer({ min: 0, max: 7 }),
  decimals: fc.integer({ min: 0, max: 15 }),
  protected: fc.boolean(),
});

const finiteDouble = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(0, -0, 1, -1, 0.1, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, 1e15),
);

type Spec =
  | { k: 'blank' }
  | { k: 'integer'; v: number }
  | { k: 'number'; v: number }
  | { k: 'label'; v: string; align: NonNullable<SheetCell['align']> }
  | { k: 'formula'; tree: Expr; v: number | string };

const specArb: fc.Arbitrary<Spec> = fc.oneof(
  fc.constant({ k: 'blank' as const }),
  fc.integer({ min: -32768, max: 32767 }).map((v) => ({ k: 'integer' as const, v })),
  finiteDouble.map((v) => ({ k: 'number' as const, v })),
  fc.record({
    k: fc.constant('label' as const),
    v: latin1String(24),
    align: fc.constantFrom<NonNullable<SheetCell['align']>>('left', 'right', 'center', 'repeat'),
  }),
  fc.record({ k: fc.constant('formula' as const), tree: exprArb, v: fc.oneof(finiteDouble, latin1String(12)) }),
);

function buildCell(c: number, r: number, spec: Spec, format: SheetCell['format']): SheetCell {
  const base = { col: c, row: r, format };
  switch (spec.k) {
    case 'blank': return { ...base, type: 'blank', value: null };
    case 'integer': return { ...base, type: 'integer', value: spec.v };
    case 'number': return { ...base, type: 'number', value: spec.v };
    case 'label': return { ...base, type: 'label', value: spec.v, align: spec.align };
    case 'formula': {
      // canonical text: what the decompiler prints for what the compiler makes of the tree's text
      const first = decompileFormula(emitBytecode(spec.tree, c, r), c, r) ?? '1';
      const formula = decompileFormula(compileFormula(first, c, r), c, r) ?? '1';
      return { ...base, type: 'formula', value: spec.v, formula };
    }
  }
}

const cellPos = fc.tuple(edgeBiased(MAX_COL), edgeBiased(MAX_ROW));

export const sheetArb: fc.Arbitrary<SheetPayload> = fc
  .record({
    cells: fc.uniqueArray(fc.tuple(cellPos, specArb, formatArb), { maxLength: 10, selector: ([[c, r]]) => r * 256 + c }),
    widths: fc.array(fc.tuple(fc.integer({ min: 0, max: MAX_COL }), fc.integer({ min: 0, max: 255 })), { maxLength: 5 }),
    names: fc.array(
      fc.record({
        name: latin1String(15),
        range: fc.record({
          startCol: edgeBiased(MAX_COL), startRow: edgeBiased(MAX_ROW), endCol: edgeBiased(MAX_COL), endRow: edgeBiased(MAX_ROW),
        }),
      }),
      { maxLength: 3 },
    ),
  })
  .map(({ cells, widths, names }): SheetPayload => {
    const built = cells
      .map(([[c, r], spec, format]) => buildCell(c, r, spec, format))
      .sort((a, b) => a.row - b.row || a.col - b.col);
    const payload: SheetPayload = { kind: 'sheet', version: '2', columnWidths: Object.fromEntries(widths), names, cells: built };
    if (built.length > 0) {
      payload.range = {
        startCol: Math.min(...built.map((c) => c.col)),
        startRow: Math.min(...built.map((c) => c.row)),
        endCol: Math.max(...built.map((c) => c.col)),
        endRow: Math.max(...built.map((c) => c.row)),
      };
    }
    return payload;
  });

const rec = (type: number, body: number[]): number[] => [type & 0xff, type >> 8, body.length & 0xff, body.length >> 8, ...body];
const BOF = rec(0, [6, 4]);
const bytesArb = (max: number): fc.Arbitrary<number[]> => fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: max });

const hostile: fc.Arbitrary<Uint8Array>[] = [
  // a valid BOF followed by noise
  fc.uint8Array({ maxLength: 300 }).map((n) => Uint8Array.from([...BOF, ...n])),
  // BOF + well-framed records of every known and some unknown types with random bodies
  fc
    .array(fc.tuple(fc.constantFrom(0, 1, 6, 8, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x33, 0x1f, 0xffff), bytesArb(40)), { maxLength: 12 })
    .map((rs) => Uint8Array.from([...BOF, ...rs.flatMap(([t, b]) => rec(t, b))])),
  // formula records with random bytecode
  fc
    .tuple(
      fc.array(fc.oneof(fc.integer({ min: 0, max: 0x5c }), fc.integer({ min: 0, max: 255 })), { maxLength: 30 }),
      fc.integer({ min: 0, max: 40 }),
    )
    .map(([code, declared]) =>
      Uint8Array.from([...BOF, ...rec(0x10, [0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, declared, 0, ...code]), ...rec(1, [])]),
    ),
];

describe('wk1 model arbitrary', () => {
  it('only generates models decode(encode(m)) reproduces, with formula text in canonical form', () => {
    fc.assert(
      fc.property(sheetArb, (m) => {
        for (const c of m.cells) {
          if (c.type === 'formula') {
            expect(typeof c.formula).toBe('string');
            expect(decompileFormula(compileFormula(c.formula as string, c.col, c.row), c.col, c.row)).toBe(c.formula);
          }
        }
        expect(decode(wk1.encode!(m)).payload).toEqual(m);
      }),
      { numRuns: 100 },
    );
  });

  it('decode of arbitrary hostile input only ever throws ExhumeError', () => {
    fc.assert(
      fc.property(fc.oneof(...hostile), (bytes) => {
        try {
          decode(bytes);
        } catch (e) {
          expect(e).toBeInstanceOf(ExhumeError);
        }
      }),
      { numRuns: 1500 },
    );
  });
});

formatProperties(wk1, { model: sheetArb, runs: 60, fuzzRuns: 400, hostile });
