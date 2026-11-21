// Lotus 1-2-3 formula bytecode (reverse Polish) -> 1-2-3 formula text.
import {
  FN_BY_OP, MAX_COL, MAX_ROW, OPCODE_BIN, OPCODE_UN, printExpr,
} from './formula-ast.js';
import type { Coord, Expr } from './formula-ast.js';

/** Deepest expression tree the decompiler accepts (keeps printing away from the call-stack limit). */
export const MAX_FORMULA_DEPTH = 1000;

/**
 * A reference coordinate word: bit 15 set = relative, the low 14 bits a signed offset (bit 13 is the
 * sign) from the formula's own cell, wrapping around the sheet edge as 1-2-3 does; bit 15 clear =
 * absolute. Null when an absolute coordinate is outside the sheet.
 */
export function resolveCoord(word: number, base: number, size: number): Coord | null {
  if (word & 0x8000) {
    let off = word & 0x3fff;
    if (off & 0x2000) off -= 0x4000;
    return { abs: false, v: (((base + off) % size) + size) % size };
  }
  return word < size ? { abs: true, v: word } : null;
}

interface Item { e: Expr; d: number }

/** Decompile to a tree; null for an unknown opcode, a truncated operand or a malformed stack. */
export function decompileToExpr(code: Uint8Array, col: number, row: number): Expr | null {
  const stack: Item[] = [];
  let i = 0;
  const u16 = (): number | null => {
    if (i + 2 > code.length) return null;
    const v = (code[i] ?? 0) | ((code[i + 1] ?? 0) << 8);
    i += 2;
    return v;
  };
  const push = (e: Expr, d: number): boolean => {
    if (d > MAX_FORMULA_DEPTH) return false;
    stack.push({ e, d });
    return true;
  };
  const pop = (n: number): Item[] | null => (stack.length >= n ? stack.splice(stack.length - n, n) : null);
  const coord = (w: number | null, base: number, size: number): Coord | null =>
    w === null ? null : resolveCoord(w, base, size);

  for (;;) {
    if (i >= code.length) return null; // no end-of-formula opcode
    const op = code[i++] ?? 0;
    if (op === 0x03) break;
    if (op === 0x00) {
      if (i + 8 > code.length) return null;
      const v = new DataView(code.buffer, code.byteOffset + i, 8).getFloat64(0, true);
      i += 8;
      if (!Number.isFinite(v) || !push({ t: 'num', v }, 1)) return null;
    } else if (op === 0x05) {
      const w = u16();
      if (w === null || !push({ t: 'num', v: w >= 0x8000 ? w - 0x10000 : w }, 1)) return null;
    } else if (op === 0x06) {
      let end = i;
      while (end < code.length && code[end] !== 0) end++;
      if (end >= code.length) return null;
      let s = '';
      for (let k = i; k < end; k++) s += String.fromCharCode(code[k] ?? 0);
      i = end + 1;
      if (!push({ t: 'str', v: s }, 1)) return null;
    } else if (op === 0x01) {
      const c = coord(u16(), col, MAX_COL + 1);
      const r = coord(u16(), row, MAX_ROW + 1);
      if (!c || !r || !push({ t: 'ref', col: c, row: r }, 1)) return null;
    } else if (op === 0x02) {
      const c1 = coord(u16(), col, MAX_COL + 1);
      const r1 = coord(u16(), row, MAX_ROW + 1);
      const c2 = coord(u16(), col, MAX_COL + 1);
      const r2 = coord(u16(), row, MAX_ROW + 1);
      if (!c1 || !r1 || !c2 || !r2 || !push({ t: 'range', c1, r1, c2, r2 }, 1)) return null;
    } else if (op === 0x04) {
      const a = pop(1);
      if (!a || !push({ t: 'paren', e: a[0]!.e }, a[0]!.d + 1)) return null;
    } else if (OPCODE_UN.has(op)) {
      const a = pop(1);
      if (!a || !push({ t: 'un', op: OPCODE_UN.get(op)!, e: a[0]!.e }, a[0]!.d + 1)) return null;
    } else if (OPCODE_BIN.has(op)) {
      const a = pop(2);
      if (!a) return null;
      const [l, r] = [a[0]!, a[1]!];
      if (!push({ t: 'bin', op: OPCODE_BIN.get(op)!, l: l.e, r: r.e }, Math.max(l.d, r.d) + 1)) return null;
    } else {
      const fn = FN_BY_OP.get(op);
      if (!fn) return null; // unknown opcode: never guess
      let n: number;
      if (fn.arity === 'var') {
        if (i >= code.length) return null;
        n = code[i++] ?? 0;
        if (n === 0) return null;
      } else {
        n = fn.arity;
      }
      const a = pop(n);
      if (!a) return null;
      const d = a.reduce((m, x) => Math.max(m, x.d), 0) + 1;
      if (!push({ t: 'fn', name: fn.name, args: a.map((x) => x.e) }, d)) return null;
    }
  }
  // Bytes after the end marker are ignored; the stack must hold exactly one expression.
  return stack.length === 1 ? stack[0]!.e : null;
}

/**
 * Bytecode of a formula in the cell (col,row) -> 1-2-3 text such as `@SUM(B2..B13)*1.1`, or null when
 * the formula cannot be decompiled (unknown opcode, truncated operand, bad stack, absolute reference
 * outside the sheet, non-finite constant). Relative references print as `B2`, absolute as `$B$2`.
 * Never throws.
 */
export function decompileFormula(bytecode: Uint8Array, col: number, row: number): string | null {
  const e = decompileToExpr(bytecode, col, row);
  return e ? printExpr(e) : null;
}
