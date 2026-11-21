// Lotus 1-2-3 formula text -> Excel formula text (without the leading `=`), or null when there is no
// faithful Excel form. Works on the parsed tree, so precedence differences are handled by the printer:
//  - Excel binds unary minus tighter than ^ (Lotus the other way): -A1^2 becomes -(A1^2).
//  - #AND# -> `*` and #OR# -> `+` (numeric truth, per the design's Decisions); operands are
//    parenthesised by precedence, so A1>1#AND#B1<2 becomes (A1>1)*(B1<2). #NOT#x -> NOT(x).
// Function notes (Lotus -> Excel):
//  @AVG AVERAGE, @COUNT COUNTA, @STD STDEVP, @VAR VARP, @LENGTH LEN, @ISSTRING ISTEXT, @ISERR ISERR,
//  @INT TRUNC (Lotus truncates toward zero), @LOG LOG10, @PI PI(), @TODAY TODAY(), @NA NA(),
//  @TRUE TRUE(), @FALSE FALSE(), @YEAR YEAR(x)-1900 (Lotus counts years from 1900).
//  @STRING(x,n) FIXED(x,n,TRUE) (no thousands separators).
//  Lotus counts from 0 where Excel counts from 1: @FIND(a,b,c) FIND(a,b,c+1)-1, @MID(s,start,n)
//  MID(s,start+1,n), @CHOOSE(i,...) CHOOSE(i+1,...), @VLOOKUP/@HLOOKUP(x,range,off) VLOOKUP(x,range,off+1).
//  The lookups use Excel's default sorted (approximate) match, as Lotus does for numbers; Lotus needs an
//  exact match only for text keys, and Excel would then want a fourth argument FALSE.
//  @PMT(principal,rate,term) -PMT(rate,term,principal), @PV(pmt,rate,term) -PV(rate,term,pmt),
//  @FV(pmt,rate,term) -FV(rate,term,pmt) (Lotus results are positive), @IRR(guess,range) IRR(range,guess).
//  @MOD maps to MOD: for negative operands Lotus takes the sign of the dividend and Excel of the divisor.
// No faithful form (null): @ERR (no formula equivalent: the cell value is the error), @CELLPOINTER.
import { printRef } from './formula-ast.js';
import type { BinOp, Expr } from './formula-ast.js';
import { parseFormula } from './formula-parse.js';

/** Functions that keep their arguments and only change name. */
const RENAME: Record<string, string> = {
  SUM: 'SUM', AVG: 'AVERAGE', COUNT: 'COUNTA', MIN: 'MIN', MAX: 'MAX', STD: 'STDEVP', VAR: 'VARP',
  NPV: 'NPV', IF: 'IF', ABS: 'ABS', SQRT: 'SQRT', LN: 'LN', EXP: 'EXP', SIN: 'SIN', COS: 'COS', TAN: 'TAN',
  ATAN: 'ATAN', ATAN2: 'ATAN2', ASIN: 'ASIN', ACOS: 'ACOS', MOD: 'MOD', ROUND: 'ROUND', ISNA: 'ISNA',
  ISERR: 'ISERR', ISNUMBER: 'ISNUMBER', ISSTRING: 'ISTEXT', LENGTH: 'LEN', VALUE: 'VALUE', CHAR: 'CHAR',
  CODE: 'CODE', DATE: 'DATE', DAY: 'DAY', MONTH: 'MONTH', TIME: 'TIME', HOUR: 'HOUR', MINUTE: 'MINUTE',
  SECOND: 'SECOND', DATEVALUE: 'DATEVALUE', TIMEVALUE: 'TIMEVALUE', INT: 'TRUNC', LOG: 'LOG10',
  PI: 'PI', RAND: 'RAND', TODAY: 'TODAY', NA: 'NA', TRUE: 'TRUE', FALSE: 'FALSE',
};

const num = (v: number): Expr => ({ t: 'num', v });
const bin = (op: BinOp, l: Expr, r: Expr): Expr => ({ t: 'bin', op, l, r });
const fn = (name: string, args: Expr[]): Expr => ({ t: 'fn', name, args });
const plus1 = (e: Expr): Expr => (e.t === 'num' && Number.isInteger(e.v) && e.v >= 0 ? num(e.v + 1) : bin('+', e, num(1)));

class NoExcelForm extends Error {}

function tr(e: Expr): Expr {
  switch (e.t) {
    case 'num': case 'str': case 'ref': case 'range': return e;
    case 'paren': return { t: 'paren', e: tr(e.e) };
    case 'un': return { t: 'un', op: e.op, e: tr(e.e) };
    case 'bin': return bin(e.op, tr(e.l), tr(e.r));
    case 'fn': return translateCall(e.name, e.args.map(tr));
  }
}

function translateCall(name: string, a: Expr[]): Expr {
  const at = (i: number): Expr => a[i] ?? num(0);
  switch (name) {
    case 'ERR': case 'CELLPOINTER': throw new NoExcelForm(name);
    case 'YEAR': return bin('-', fn('YEAR', a), num(1900));
    case 'STRING': return fn('FIXED', [at(0), at(1), fn('TRUE', [])]);
    case 'FIND': return bin('-', fn('FIND', [at(0), at(1), plus1(at(2))]), num(1));
    case 'MID': return fn('MID', [at(0), plus1(at(1)), at(2)]);
    case 'CHOOSE': return fn('CHOOSE', [plus1(at(0)), ...a.slice(1)]);
    case 'VLOOKUP': case 'HLOOKUP': return fn(name, [at(0), at(1), plus1(at(2))]);
    case 'PMT': return { t: 'un', op: '-', e: fn('PMT', [at(1), at(2), at(0)]) };
    case 'PV': return { t: 'un', op: '-', e: fn('PV', [at(1), at(2), at(0)]) };
    case 'FV': return { t: 'un', op: '-', e: fn('FV', [at(1), at(2), at(0)]) };
    case 'IRR': return fn('IRR', [at(1), at(0)]);
    default: {
      const excel = RENAME[name];
      if (excel === undefined) throw new NoExcelForm(name);
      return fn(excel, a);
    }
  }
}

// ---- Excel printer ---------------------------------------------------------------------------

// Excel precedence, tightest first: unary minus, ^, * /, + -, comparison.
const P = { ATOM: 9, UNARY: 7, POW: 6, MUL: 5, ADD: 4, CMP: 3 } as const;

function binPrec(op: BinOp): number {
  switch (op) {
    case '^': return P.POW;
    case '*': case '/': case '#AND#': return P.MUL;
    case '+': case '-': case '#OR#': return P.ADD;
    default: return P.CMP;
  }
}

const EXCEL_OP: Partial<Record<BinOp, string>> = { '#AND#': '*', '#OR#': '+' };

function wrap(e: Expr, need: number): string {
  const c = out(e);
  return c.p >= need ? c.s : `(${c.s})`;
}

function out(e: Expr): { s: string; p: number } {
  switch (e.t) {
    case 'num': {
      const neg = e.v < 0 || Object.is(e.v, -0);
      const s = String(Math.abs(e.v)).replace('e', 'E');
      return neg ? { s: `-${s}`, p: P.UNARY } : { s, p: P.ATOM };
    }
    case 'str': return { s: `"${e.v.replace(/"/g, '""')}"`, p: P.ATOM };
    case 'ref': return { s: printRef(e.col, e.row), p: P.ATOM };
    case 'range': return { s: `${printRef(e.c1, e.r1)}:${printRef(e.c2, e.r2)}`, p: P.ATOM };
    case 'paren': return { s: `(${out(e.e).s})`, p: P.ATOM };
    case 'un':
      if (e.op === '#NOT#') return { s: `NOT(${out(e.e).s})`, p: P.ATOM };
      return { s: `${e.op}${wrap(e.e, P.UNARY)}`, p: P.UNARY };
    case 'bin': {
      const p = binPrec(e.op);
      const rightNeed = e.op === '^' ? P.UNARY + 1 : p + 1;
      return { s: `${wrap(e.l, p)}${EXCEL_OP[e.op] ?? e.op}${wrap(e.r, rightNeed)}`, p };
    }
    case 'fn': return { s: `${e.name}(${e.args.map((x) => out(x).s).join(',')})`, p: P.ATOM };
  }
}

/** Translate 1-2-3 formula text (as the decompiler prints it) to Excel, or null if it has no faithful form. */
export function translateToExcel(lotusFormula: string): string | null {
  let tree: Expr;
  try {
    tree = parseFormula(lotusFormula);
  } catch {
    return null;
  }
  try {
    return out(tr(tree)).s;
  } catch (err) {
    if (err instanceof NoExcelForm) return null;
    throw err;
  }
}
