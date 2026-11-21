// 1-2-3 formula text -> tree -> bytecode. The inverse of formula.ts for text the decompiler prints.
//
// Compiler decisions: a number constant that is an integer 0..32767 is stored as an integer (0x05),
// every other one as an f64 (0x00); a leading `-` or `+` is always an operator (the tree keeps
// -5 as unary minus applied to 5); each typed parenthesis becomes a 0x04 token; ranges are normalised
// so the start is the top-left corner. Function names are case-insensitive, `@PI` and `@PI()` both work.
import { ExhumeError } from '../../core/types.js';
import {
  BIN_OPCODE, FN_BY_NAME, MAX_COL, MAX_ROW, UN_OPCODE,
} from './formula-ast.js';
import type { BinOp, Coord, Expr, UnOp } from './formula-ast.js';

const MAX_DEPTH = 200;
const MAX_TOKENS = 1000;
const MAX_TEXT = 8000;

type Tok =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ref'; col: Coord; row: Coord }
  | { k: 'fn'; name: string }
  | { k: 'op'; v: string }
  | { k: 'end' };

const fail = (msg: string): never => {
  throw new ExhumeError(`formula: ${msg}`, 'wk1');
};

function lettersToCol(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const NUMBER = /^(\d+(?:\.(?!\.)\d*)?|\.(?!\.)\d+)(?:[eE][+-]?\d+)?/;
const REF = /^(\$?)([A-Za-z]{1,2})(\$?)(\d+)(?![A-Za-z0-9])/;
const FNAME = /^@([A-Za-z][A-Za-z0-9]*)/;
const LOGIC = /^#(AND|OR|NOT)#/i;
const COMPARE = /^(<>|<=|>=|=|<|>)/;

function lex(text: string): Tok[] {
  if (text.length > MAX_TEXT) fail('formula text is too long');
  const toks: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const ch = rest[0] ?? '';
    if (toks.length > MAX_TOKENS) fail('formula is too long');
    let m: RegExpExecArray | null;
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if ((m = NUMBER.exec(rest))) {
      const v = Number(m[0]);
      if (!Number.isFinite(v)) fail(`number ${m[0]} is out of range`);
      toks.push({ k: 'num', v });
      i += m[0].length;
    } else if (ch === '"' || ch === "'") {
      const end = text.indexOf(ch, i + 1);
      if (end < 0) fail('unterminated string');
      const s = text.slice(i + 1, end);
      for (let k = 0; k < s.length; k++) {
        const c = s.charCodeAt(k);
        if (c === 0 || c > 0xff) fail('string holds a character that is not Latin-1 or is NUL');
      }
      toks.push({ k: 'str', v: s });
      i = end + 1;
    } else if ((m = REF.exec(rest))) {
      const col = lettersToCol(m[2] ?? '');
      const rowNo = Number(m[4]);
      if (col > MAX_COL || rowNo < 1 || rowNo > MAX_ROW + 1) fail(`reference ${m[0]} is outside the sheet`);
      toks.push({ k: 'ref', col: { abs: m[1] === '$', v: col }, row: { abs: m[3] === '$', v: rowNo - 1 } });
      i += m[0].length;
    } else if ((m = FNAME.exec(rest))) {
      toks.push({ k: 'fn', name: (m[1] ?? '').toUpperCase() });
      i += m[0].length;
    } else if ((m = LOGIC.exec(rest))) {
      toks.push({ k: 'op', v: `#${(m[1] ?? '').toUpperCase()}#` });
      i += m[0].length;
    } else if (rest.startsWith('..')) {
      toks.push({ k: 'op', v: '..' });
      i += 2;
    } else if ((m = COMPARE.exec(rest))) {
      toks.push({ k: 'op', v: m[1] ?? '' });
      i += (m[1] ?? '').length;
    } else if ('+-*/^(),;'.includes(ch)) {
      toks.push({ k: 'op', v: ch === ';' ? ',' : ch });
      i++;
    } else {
      fail(`unexpected character ${JSON.stringify(ch)}`);
    }
  }
  toks.push({ k: 'end' });
  return toks;
}

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok { return this.toks[this.pos] ?? { k: 'end' }; }
  private isOp(...vs: string[]): boolean {
    const t = this.peek();
    return t.k === 'op' && vs.includes(t.v);
  }
  private take(): Tok { const t = this.peek(); this.pos++; return t; }
  private expectOp(v: string): void {
    if (!this.isOp(v)) fail(`expected ${v}`);
    this.pos++;
  }

  parse(): Expr {
    const e = this.logic();
    if (this.peek().k !== 'end') fail('unexpected input after the expression');
    return e;
  }

  private nest<T>(f: () => T): T {
    if (++this.depth > MAX_DEPTH) fail('expression nested too deeply');
    try { return f(); } finally { this.depth--; }
  }

  private logic(): Expr {
    let l = this.not();
    while (this.isOp('#AND#', '#OR#')) {
      const op = (this.take() as { v: string }).v as BinOp;
      l = { t: 'bin', op, l, r: this.not() };
    }
    return l;
  }

  private not(): Expr {
    if (this.isOp('#NOT#')) {
      this.pos++;
      return this.nest<Expr>(() => ({ t: 'un', op: '#NOT#', e: this.not() }));
    }
    return this.compare();
  }

  private compare(): Expr {
    let l = this.add();
    while (this.isOp('=', '<>', '<=', '>=', '<', '>')) {
      const op = (this.take() as { v: string }).v as BinOp;
      l = { t: 'bin', op, l, r: this.add() };
    }
    return l;
  }

  private add(): Expr {
    let l = this.mul();
    while (this.isOp('+', '-')) {
      const op = (this.take() as { v: string }).v as BinOp;
      l = { t: 'bin', op, l, r: this.mul() };
    }
    return l;
  }

  private mul(): Expr {
    let l = this.unary();
    while (this.isOp('*', '/')) {
      const op = (this.take() as { v: string }).v as BinOp;
      l = { t: 'bin', op, l, r: this.unary() };
    }
    return l;
  }

  private unary(): Expr {
    if (this.isOp('-', '+')) {
      const op = (this.take() as { v: string }).v as UnOp;
      return this.nest<Expr>(() => ({ t: 'un', op, e: this.unary() }));
    }
    return this.power();
  }

  private power(): Expr {
    let l = this.primary();
    while (this.isOp('^')) {
      this.pos++;
      // 1-2-3 accepts A1^-B1; the signed operand is stored in a paren token, which is what the decompiler
      // prints for it (A1^(-B1)), so that text and bytecode stay each other's inverse.
      const r: Expr = this.isOp('-', '+') ? { t: 'paren', e: this.unary() } : this.primary();
      l = { t: 'bin', op: '^', l, r };
    }
    return l;
  }

  private primary(): Expr {
    const t = this.take();
    switch (t.k) {
      case 'num': return { t: 'num', v: t.v };
      case 'str': return { t: 'str', v: t.v };
      case 'ref': return this.refOrRange(t);
      case 'fn': return this.call(t.name);
      case 'op':
        if (t.v === '(') {
          const e = this.nest(() => this.logic());
          this.expectOp(')');
          return { t: 'paren', e };
        }
        return fail(`unexpected ${t.v}`);
      case 'end': return fail('formula ends too soon');
    }
  }

  private refOrRange(a: { col: Coord; row: Coord }): Expr {
    if (!this.isOp('..')) return { t: 'ref', col: a.col, row: a.row };
    this.pos++;
    const b = this.take();
    if (b.k !== 'ref') return fail('a range needs a cell after ..');
    const [c1, c2] = a.col.v <= b.col.v ? [a.col, b.col] : [b.col, a.col];
    const [r1, r2] = a.row.v <= b.row.v ? [a.row, b.row] : [b.row, a.row];
    return { t: 'range', c1, r1, c2, r2 };
  }

  private call(name: string): Expr {
    const def = FN_BY_NAME.get(name);
    if (!def) return fail(`unknown function @${name}`);
    const args: Expr[] = [];
    if (this.isOp('(')) {
      this.pos++;
      if (!this.isOp(')')) {
        args.push(this.nest(() => this.logic()));
        while (this.isOp(',')) {
          this.pos++;
          args.push(this.nest(() => this.logic()));
        }
      }
      this.expectOp(')');
    }
    if (def.arity === 'var') {
      if (args.length < 1 || args.length > 255) fail(`@${name} takes 1 to 255 arguments`);
    } else if (args.length !== def.arity) {
      fail(`@${name} takes ${def.arity} argument${def.arity === 1 ? '' : 's'}, not ${args.length}`);
    }
    return { t: 'fn', name, args };
  }
}

/** Parse 1-2-3 formula text into a tree. Throws ExhumeError for syntax the compiler does not accept. */
export function parseFormula(text: string): Expr {
  return new Parser(lex(text)).parse();
}

// ---- emitting --------------------------------------------------------------------------------

function word(c: Coord, base: number): number {
  return c.abs ? c.v : 0x8000 | ((c.v - base) & 0x3fff);
}

function emit(e: Expr, out: number[], col: number, row: number): void {
  const u16 = (v: number): void => { out.push(v & 0xff, (v >> 8) & 0xff); };
  switch (e.t) {
    case 'num':
      if (Number.isInteger(e.v) && e.v >= 0 && e.v <= 32767 && !Object.is(e.v, -0)) {
        out.push(0x05);
        u16(e.v);
      } else {
        const b = new Uint8Array(8);
        new DataView(b.buffer).setFloat64(0, e.v, true);
        out.push(0x00, ...b);
      }
      return;
    case 'str':
      out.push(0x06);
      for (let k = 0; k < e.v.length; k++) out.push(e.v.charCodeAt(k));
      out.push(0);
      return;
    case 'ref':
      out.push(0x01);
      u16(word(e.col, col));
      u16(word(e.row, row));
      return;
    case 'range':
      out.push(0x02);
      u16(word(e.c1, col)); u16(word(e.r1, row)); u16(word(e.c2, col)); u16(word(e.r2, row));
      return;
    case 'paren': emit(e.e, out, col, row); out.push(0x04); return;
    case 'un': emit(e.e, out, col, row); out.push(UN_OPCODE[e.op]); return;
    case 'bin': emit(e.l, out, col, row); emit(e.r, out, col, row); out.push(BIN_OPCODE[e.op]); return;
    case 'fn': {
      const def = FN_BY_NAME.get(e.name);
      if (!def) return fail(`unknown function @${e.name}`);
      for (const a of e.args) emit(a, out, col, row);
      out.push(def.op);
      if (def.arity === 'var') out.push(e.args.length);
      return;
    }
  }
}

/** Tree -> bytecode (ending in 0x03) for a formula in the cell (col,row). */
export function emitBytecode(e: Expr, col: number, row: number): Uint8Array {
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col > MAX_COL || row < 0 || row > MAX_ROW) {
    fail(`cell (${col},${row}) is outside the sheet`);
  }
  const out: number[] = [];
  emit(e, out, col, row);
  out.push(0x03);
  if (out.length > 0xfff0) fail('formula is too long');
  return Uint8Array.from(out);
}

/** 1-2-3 formula text -> bytecode for a formula in the cell (col,row). Throws ExhumeError on bad text. */
export function compileFormula(text: string, col: number, row: number): Uint8Array {
  return emitBytecode(parseFormula(text), col, row);
}
