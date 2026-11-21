// Lotus formula tree, function table and the canonical 1-2-3 text printer.
//
// Precedence (tightest first), as in the 1-2-3 manual:  ^  >  unary + -  >  * /  >  + -  >
// = <> < > <= >=  >  #NOT#  >  #AND# #OR#.  All binary operators are left associative.
// Parentheses typed by the user are kept as `paren` nodes (bytecode 0x04); the printer adds further
// parentheses only where the tree needs them, so text -> tree -> text is stable.

export interface Coord {
  /** true: printed with `$`, stored as a raw coordinate. false: stored as an offset from the formula cell. */
  abs: boolean;
  /** The target column or row (0-based) the reference resolves to. */
  v: number;
}

export type BinOp = '+' | '-' | '*' | '/' | '^' | '=' | '<>' | '<=' | '>=' | '<' | '>' | '#AND#' | '#OR#';
export type UnOp = '-' | '+' | '#NOT#';

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; col: Coord; row: Coord }
  | { t: 'range'; c1: Coord; r1: Coord; c2: Coord; r2: Coord }
  | { t: 'paren'; e: Expr }
  | { t: 'un'; op: UnOp; e: Expr }
  | { t: 'bin'; op: BinOp; l: Expr; r: Expr }
  | { t: 'fn'; name: string; args: Expr[] };

export const MAX_COL = 255;
export const MAX_ROW = 8191;

export const BIN_OPCODE: Record<BinOp, number> = {
  '+': 0x09, '-': 0x0a, '*': 0x0b, '/': 0x0c, '^': 0x0d,
  '=': 0x0e, '<>': 0x0f, '<=': 0x10, '>=': 0x11, '<': 0x12, '>': 0x13,
  '#AND#': 0x14, '#OR#': 0x15,
};
export const OPCODE_BIN: ReadonlyMap<number, BinOp> = new Map(
  (Object.entries(BIN_OPCODE) as Array<[BinOp, number]>).map(([op, code]) => [code, op]),
);
export const UN_OPCODE: Record<UnOp, number> = { '-': 0x08, '+': 0x17, '#NOT#': 0x16 };
export const OPCODE_UN: ReadonlyMap<number, UnOp> = new Map(
  (Object.entries(UN_OPCODE) as Array<[UnOp, number]>).map(([op, code]) => [code, op]),
);

export interface FnDef { op: number; name: string; arity: number | 'var' }

const FIXED: Array<[number, string, number]> = [
  [0x1f, 'NA', 0], [0x20, 'ERR', 0], [0x21, 'ABS', 1], [0x22, 'INT', 1], [0x23, 'SQRT', 1], [0x24, 'LOG', 1],
  [0x25, 'LN', 1], [0x26, 'PI', 0], [0x27, 'SIN', 1], [0x28, 'COS', 1], [0x29, 'TAN', 1], [0x2a, 'ATAN2', 2],
  [0x2b, 'ATAN', 1], [0x2c, 'ASIN', 1], [0x2d, 'ACOS', 1], [0x2e, 'EXP', 1], [0x2f, 'MOD', 2], [0x31, 'ISNA', 1],
  [0x32, 'ISERR', 1], [0x33, 'FALSE', 0], [0x34, 'TRUE', 0], [0x35, 'RAND', 0], [0x36, 'DATE', 3],
  [0x37, 'TODAY', 0], [0x38, 'PMT', 3], [0x39, 'PV', 3], [0x3a, 'FV', 3], [0x3b, 'IF', 3], [0x3c, 'DAY', 1],
  [0x3d, 'MONTH', 1], [0x3e, 'YEAR', 1], [0x3f, 'ROUND', 2], [0x40, 'TIME', 3], [0x41, 'HOUR', 1],
  [0x42, 'MINUTE', 1], [0x43, 'SECOND', 1], [0x44, 'ISNUMBER', 1], [0x45, 'ISSTRING', 1], [0x46, 'LENGTH', 1],
  [0x47, 'VALUE', 1], [0x48, 'STRING', 2], [0x49, 'MID', 3], [0x4a, 'CHAR', 1], [0x4b, 'CODE', 1],
  [0x4c, 'FIND', 3], [0x4d, 'DATEVALUE', 1], [0x4e, 'TIMEVALUE', 1], [0x4f, 'CELLPOINTER', 1],
  [0x55, 'VLOOKUP', 3], [0x56, 'NPV', 2], [0x59, 'IRR', 2], [0x5a, 'HLOOKUP', 3],
];
const VARIABLE: Array<[number, string]> = [
  [0x30, 'CHOOSE'], [0x50, 'SUM'], [0x51, 'AVG'], [0x52, 'COUNT'], [0x53, 'MIN'], [0x54, 'MAX'],
  [0x57, 'VAR'], [0x58, 'STD'],
];

export const FUNCTIONS: readonly FnDef[] = [
  ...FIXED.map(([op, name, arity]): FnDef => ({ op, name, arity })),
  ...VARIABLE.map(([op, name]): FnDef => ({ op, name, arity: 'var' })),
];
export const FN_BY_OP: ReadonlyMap<number, FnDef> = new Map(FUNCTIONS.map((f) => [f.op, f]));
export const FN_BY_NAME: ReadonlyMap<string, FnDef> = new Map(FUNCTIONS.map((f) => [f.name, f]));

/** Column letters: 0 -> A, 25 -> Z, 26 -> AA, 255 -> IV. */
export function colLetters(c: number): string {
  let s = '';
  let n = c;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function printRef(col: Coord, row: Coord): string {
  return `${col.abs ? '$' : ''}${colLetters(col.v)}${row.abs ? '$' : ''}${row.v + 1}`;
}

// ---- printing --------------------------------------------------------------------------------

export const PREC = { ATOM: 9, POW: 7, UNARY: 6, MUL: 5, ADD: 4, CMP: 3, NOT: 2, LOGIC: 1 } as const;

const BIN_PREC: Record<BinOp, number> = {
  '^': PREC.POW, '*': PREC.MUL, '/': PREC.MUL, '+': PREC.ADD, '-': PREC.ADD,
  '=': PREC.CMP, '<>': PREC.CMP, '<=': PREC.CMP, '>=': PREC.CMP, '<': PREC.CMP, '>': PREC.CMP,
  '#AND#': PREC.LOGIC, '#OR#': PREC.LOGIC,
};

class Unprintable extends Error {}

/** Text of a number constant (non-negative; the caller handles the sign). */
function numberText(a: number): string {
  if (!Number.isFinite(a)) throw new Unprintable('non-finite constant');
  return String(a).replace('e', 'E');
}

function stringText(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  throw new Unprintable('string holds both quote characters');
}

interface Printed { s: string; p: number }

function child(e: Expr, need: number): string {
  const c = print(e);
  return c.p >= need ? c.s : `(${c.s})`;
}

function print(e: Expr): Printed {
  switch (e.t) {
    case 'num': {
      const neg = e.v < 0 || Object.is(e.v, -0);
      return neg ? { s: `-${numberText(-e.v)}`, p: PREC.UNARY } : { s: numberText(e.v), p: PREC.ATOM };
    }
    case 'str': return { s: stringText(e.v), p: PREC.ATOM };
    case 'ref': return { s: printRef(e.col, e.row), p: PREC.ATOM };
    case 'range':
      return { s: `${printRef(e.c1, e.r1)}..${printRef(e.c2, e.r2)}`, p: PREC.ATOM };
    case 'paren': return { s: `(${print(e.e).s})`, p: PREC.ATOM };
    case 'un':
      if (e.op === '#NOT#') return { s: `#NOT#${child(e.e, PREC.NOT)}`, p: PREC.NOT };
      return { s: `${e.op}${child(e.e, PREC.UNARY)}`, p: PREC.UNARY };
    case 'bin': {
      const p = BIN_PREC[e.op];
      return { s: `${child(e.l, p)}${e.op}${child(e.r, p + 1)}`, p };
    }
    case 'fn': {
      if (e.args.length === 0) return { s: `@${e.name}`, p: PREC.ATOM };
      return { s: `@${e.name}(${e.args.map((a) => print(a).s).join(',')})`, p: PREC.ATOM };
    }
  }
}

/** Canonical 1-2-3 text of a tree, or null when it has no text form (non-finite number, odd string). */
export function printExpr(e: Expr): string | null {
  try {
    return print(e).s;
  } catch (err) {
    if (err instanceof Unprintable) return null;
    throw err;
  }
}
