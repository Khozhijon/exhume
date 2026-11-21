// Decompiler and compiler examples with hand-assembled bytecode.
import { describe, expect, it } from 'vitest';
import { ExhumeError } from '../../core/types.js';
import { FUNCTIONS } from './formula-ast.js';
import { decompileFormula } from './formula.js';
import { compileFormula } from './formula-parse.js';

// ---- tiny assembler --------------------------------------------------------------------------
const u16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff];
const f64 = (v: number): number[] => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return [...b];
};
/** Relative coordinate word for `target` seen from `base`. */
const rel = (target: number, base: number): number => 0x8000 | ((target - base) & 0x3fff);
const ref = (c: number, r: number, bc: number, br: number): number[] => [0x01, ...u16(rel(c, bc)), ...u16(rel(r, br))];
const aref = (c: number, r: number): number[] => [0x01, ...u16(c), ...u16(r)];
const int = (v: number): number[] => [0x05, ...u16(v & 0xffff)];
const num = (v: number): number[] => [0x00, ...f64(v)];
const str = (s: string): number[] => [0x06, ...[...s].map((c) => c.charCodeAt(0)), 0];
const END = [0x03];
const bytes = (...parts: number[][]): Uint8Array => Uint8Array.from(parts.flat());
const dec = (b: Uint8Array, col = 2, row = 2): string | null => decompileFormula(b, col, row);

describe('decompileFormula: operands', () => {
  it('number, integer and string constants', () => {
    expect(dec(bytes(num(1.1), END))).toBe('1.1');
    expect(dec(bytes(int(-3), END))).toBe('-3');
    expect(dec(bytes(int(32767), END))).toBe('32767');
    expect(dec(bytes(str('hi'), END))).toBe('"hi"');
    expect(dec(bytes(str("say \"x\""), END))).toBe("'say \"x\"'");
    expect(dec(bytes(str(''), END))).toBe('""');
    expect(dec(bytes(str('caf\xe9'), END))).toBe('"caf\xe9"');
    expect(dec(bytes(num(1e21), END))).toBe('1E+21');
  });

  it('a string holding both quote characters has no text form', () => {
    expect(dec(bytes(str('a"b\'c'), END))).toBeNull();
  });

  it('arithmetic like +B2*1.1 (B2 relative to C3)', () => {
    expect(dec(bytes(ref(1, 1, 2, 2), num(1.1), [0x0b], END))).toBe('B2*1.1');
  });

  it('a relative reference with a negative offset in both axes', () => {
    // formula in C3 (col 2,row 2) pointing at A1: offset -2,-2
    const b = bytes(ref(0, 0, 2, 2), END);
    expect(b.slice(1, 5)).toEqual(Uint8Array.from([0xfe, 0xbf, 0xfe, 0xbf]));
    expect(dec(b)).toBe('A1');
  });

  it('a relative reference with a positive offset', () => {
    expect(dec(bytes(ref(5, 9, 2, 2), END))).toBe('F10');
  });

  it('absolute references print with $', () => {
    expect(dec(bytes(aref(1, 1), END))).toBe('$B$2');
  });

  it('absolute and relative coordinates mix per axis', () => {
    expect(dec(bytes([0x01, ...u16(1), ...u16(rel(4, 2))], END))).toBe('$B5');
    expect(dec(bytes([0x01, ...u16(rel(1, 2)), ...u16(7)], END))).toBe('B$8');
  });

  it('column letters A, Z, AA, AZ, BA, IV and the last row', () => {
    const cases: Array<[number, string]> = [[0, 'A'], [25, 'Z'], [26, 'AA'], [51, 'AZ'], [52, 'BA'], [255, 'IV']];
    for (const [c, letters] of cases) expect(dec(bytes(aref(c, 0), END))).toBe(`$${letters}$1`);
    expect(dec(bytes(aref(255, 8191), END))).toBe('$IV$8192');
  });

  it('relative offsets wrap around the sheet edge', () => {
    // from IV1 (col 255,row 0): offset +1 col, +1 row wraps to A2; offset -1 row wraps to row 8192
    expect(dec(bytes([0x01, ...u16(0x8001), ...u16(0x8001)], END), 255, 0)).toBe('A2');
    expect(dec(bytes([0x01, ...u16(0x8000), ...u16(0xbfff)], END), 255, 0)).toBe('IV8192');
  });

  it('an absolute coordinate outside the sheet has no text form', () => {
    expect(dec(bytes(aref(256, 0), END))).toBeNull();
    expect(dec(bytes(aref(0, 8192), END))).toBeNull();
  });

  it('range references', () => {
    expect(dec(bytes([0x02, ...u16(1), ...u16(1), ...u16(1), ...u16(12)], END))).toBe('$B$2..$B$13');
    const r = [0x02, ...u16(rel(1, 4)), ...u16(rel(1, 20)), ...u16(rel(1, 4)), ...u16(rel(12, 20))];
    expect(dec(bytes(r, [0x50, 1], END), 4, 20)).toBe('@SUM(B2..B13)');
  });

  it('@SUM(B2..B13)*1.1', () => {
    const r = [0x02, ...u16(rel(1, 2)), ...u16(rel(1, 14)), ...u16(rel(1, 2)), ...u16(rel(12, 14))];
    expect(dec(bytes(r, [0x50, 1], num(1.1), [0x0b], END), 2, 14)).toBe('@SUM(B2..B13)*1.1');
  });
});

describe('decompileFormula: operators and precedence', () => {
  const A1 = aref(0, 0);
  const B1 = aref(1, 0);
  const C1 = aref(2, 0);

  it('every binary operator', () => {
    const ops: Array<[number, string]> = [
      [0x09, '+'], [0x0a, '-'], [0x0b, '*'], [0x0c, '/'], [0x0d, '^'], [0x0e, '='], [0x0f, '<>'],
      [0x10, '<='], [0x11, '>='], [0x12, '<'], [0x13, '>'], [0x14, '#AND#'], [0x15, '#OR#'],
    ];
    for (const [op, text] of ops) expect(dec(bytes(A1, B1, [op], END))).toBe(`$A$1${text}$B$1`);
  });

  it('unary minus, unary plus and #NOT#', () => {
    expect(dec(bytes(A1, [0x08], END))).toBe('-$A$1');
    expect(dec(bytes(A1, [0x17], END))).toBe('+$A$1');
    expect(dec(bytes(A1, B1, [0x0f], [0x16], END))).toBe('#NOT#$A$1<>$B$1');
  });

  it('typed parentheses are kept', () => {
    expect(dec(bytes(A1, B1, [0x09], [0x04], C1, [0x0b], END))).toBe('($A$1+$B$1)*$C$1');
    expect(dec(bytes(A1, [0x04], [0x04], END))).toBe('(($A$1))');
  });

  it('parentheses are added where the tree needs them', () => {
    expect(dec(bytes(A1, B1, [0x09], C1, [0x0b], END))).toBe('($A$1+$B$1)*$C$1');
    expect(dec(bytes(A1, B1, C1, [0x0a], [0x0a], END))).toBe('$A$1-($B$1-$C$1)');
    expect(dec(bytes(A1, B1, [0x0a], C1, [0x0a], END))).toBe('$A$1-$B$1-$C$1');
    expect(dec(bytes(A1, B1, C1, [0x0b], [0x09], END))).toBe('$A$1+$B$1*$C$1');
    expect(dec(bytes(A1, B1, C1, [0x0d], [0x0d], END))).toBe('$A$1^($B$1^$C$1)');
    expect(dec(bytes(A1, B1, [0x0d], C1, [0x0d], END))).toBe('$A$1^$B$1^$C$1');
    expect(dec(bytes(A1, B1, [0x14], C1, [0x0b], END))).toBe('($A$1#AND#$B$1)*$C$1');
    expect(dec(bytes(A1, B1, [0x0e], [0x16], C1, [0x14], END))).toBe('#NOT#$A$1=$B$1#AND#$C$1');
    expect(dec(bytes(A1, B1, [0x14], [0x16], END))).toBe('#NOT#($A$1#AND#$B$1)');
  });

  it('-(A1+B1)^2: unary minus applies to the power', () => {
    const b = bytes(A1, B1, [0x09], [0x04], int(2), [0x0d], [0x08], END);
    expect(dec(b)).toBe('-($A$1+$B$1)^2');
    expect(compileFormula('-($A$1+$B$1)^2', 2, 2)).toEqual(b);
  });

  it('(A1-B1)*-C1: a unary minus on the right of *', () => {
    const b = bytes(A1, B1, [0x0a], [0x04], C1, [0x08], [0x0b], END);
    expect(dec(b)).toBe('($A$1-$B$1)*-$C$1');
    expect(compileFormula('($A$1-$B$1)*-$C$1', 2, 2)).toEqual(b);
  });

  it('unary minus versus subtraction', () => {
    expect(dec(bytes(A1, [0x08], B1, [0x0a], END))).toBe('-$A$1-$B$1');
    expect(dec(bytes(A1, B1, [0x08], [0x0a], END))).toBe('$A$1--$B$1');
    expect(dec(bytes(A1, B1, [0x0a], [0x08], END))).toBe('-($A$1-$B$1)');
    expect(dec(bytes(A1, [0x08], int(2), [0x0d], END))).toBe('(-$A$1)^2');
    expect(dec(bytes(int(2), A1, [0x08], [0x0d], END))).toBe('2^(-$A$1)');
    expect(dec(bytes(int(-2), int(2), [0x0d], END))).toBe('(-2)^2');
  });
});

describe('decompileFormula: functions', () => {
  it('names every function in the notes with the right arity', () => {
    expect(FUNCTIONS.length).toBe(60);
    for (const f of FUNCTIONS) {
      const n = f.arity === 'var' ? 2 : f.arity;
      const args = Array.from({ length: n }, (_, i) => int(i + 1));
      const b = bytes(...args, [f.op], f.arity === 'var' ? [n] : [], END);
      const expected = n === 0 ? `@${f.name}` : `@${f.name}(${Array.from({ length: n }, (_, i) => i + 1).join(',')})`;
      expect(dec(b), f.name).toBe(expected);
    }
  });

  it('spot-checks opcodes against the notes', () => {
    const names: Array<[number, string]> = [
      [0x1f, 'NA'], [0x2f, 'MOD'], [0x3b, 'IF'], [0x4c, 'FIND'], [0x4f, 'CELLPOINTER'], [0x55, 'VLOOKUP'],
      [0x56, 'NPV'], [0x59, 'IRR'], [0x5a, 'HLOOKUP'], [0x30, 'CHOOSE'], [0x50, 'SUM'], [0x51, 'AVG'],
      [0x52, 'COUNT'], [0x53, 'MIN'], [0x54, 'MAX'], [0x57, 'VAR'], [0x58, 'STD'],
    ];
    for (const [op, name] of names) expect(FUNCTIONS.find((f) => f.op === op)?.name).toBe(name);
  });

  it('nested @IF with comparisons', () => {
    // @IF(A1>0,@IF(A1>10,1,2),3) with A1 absolute
    const A1 = aref(0, 0);
    const inner = [...bytes(A1, int(10), [0x13], int(1), int(2), [0x3b])];
    const b = bytes(A1, int(0), [0x13], inner, int(3), [0x3b], END);
    const text = '@IF($A$1>0,@IF($A$1>10,1,2),3)';
    expect(dec(b)).toBe(text);
    expect(compileFormula(text, 2, 2)).toEqual(b);
  });

  it('comparisons and logic inside arguments need no parentheses', () => {
    const A1 = aref(0, 0);
    const b = bytes(A1, int(1), [0x13], A1, int(5), [0x12], [0x14], int(1), int(0), [0x3b], END);
    expect(dec(b)).toBe('@IF($A$1>1#AND#$A$1<5,1,0)');
  });

  it('a variable-arity function with several arguments, ranges and a reference', () => {
    const b = bytes([0x02, ...u16(0), ...u16(0), ...u16(1), ...u16(1)], aref(5, 5), int(7), [0x50, 3], END);
    expect(dec(b)).toBe('@SUM($A$1..$B$2,$F$6,7)');
  });
});

describe('decompileFormula: bad bytecode returns null', () => {
  it('unknown opcode', () => {
    expect(dec(Uint8Array.from([0xff, 0x03]))).toBeNull();
    expect(dec(Uint8Array.from([0x07, 0x03]))).toBeNull();
    expect(dec(bytes(int(1), [0x5b], END))).toBeNull();
  });

  it('truncated operands, missing end, stack underflow, leftover operands', () => {
    expect(dec(Uint8Array.from([0x00, 1, 2, 3]))).toBeNull();
    expect(dec(Uint8Array.from([0x01, 0, 0, 0]))).toBeNull();
    expect(dec(Uint8Array.from([0x06, 0x61, 0x62]))).toBeNull();
    expect(dec(bytes(int(1)))).toBeNull();
    expect(dec(bytes([0x09], END))).toBeNull();
    expect(dec(bytes(int(1), [0x50], END))).toBeNull();
    expect(dec(bytes(int(1), [0x50, 0], END))).toBeNull();
    expect(dec(bytes(int(1), int(2), END))).toBeNull();
    expect(dec(Uint8Array.from([0x03]))).toBeNull();
    expect(dec(new Uint8Array(0))).toBeNull();
  });

  it('non-finite constants and absurd nesting', () => {
    expect(dec(bytes(num(Infinity), END))).toBeNull();
    expect(dec(bytes(num(NaN), END))).toBeNull();
    const deep = bytes(int(1), ...Array.from({ length: 5000 }, () => [0x04]), END);
    expect(dec(deep)).toBeNull();
  });

  it('bytes after the end marker are ignored', () => {
    expect(dec(bytes(int(1), END, [0xff, 0xff]))).toBe('1');
  });
});

describe('compileFormula', () => {
  it('stores 0..32767 integers as 0x05 and everything else as f64', () => {
    expect(compileFormula('7', 0, 0)).toEqual(bytes(int(7), END));
    expect(compileFormula('7.0', 0, 0)).toEqual(bytes(int(7), END));
    expect(compileFormula('32768', 0, 0)).toEqual(bytes(num(32768), END));
    expect(compileFormula('0.5', 0, 0)).toEqual(bytes(num(0.5), END));
    expect(compileFormula('.5', 0, 0)).toEqual(bytes(num(0.5), END));
    expect(compileFormula('1E3', 0, 0)).toEqual(bytes(int(1000), END));
    expect(compileFormula('-5', 0, 0)).toEqual(bytes(int(5), [0x08], END));
  });

  it('relative and absolute references, ranges, and the formula cell position', () => {
    expect(compileFormula('B2*1.1', 2, 2)).toEqual(bytes(ref(1, 1, 2, 2), num(1.1), [0x0b], END));
    expect(compileFormula('$B$2', 9, 9)).toEqual(bytes(aref(1, 1), END));
    expect(compileFormula('$B2', 3, 3)).toEqual(bytes([0x01, ...u16(1), ...u16(rel(1, 3))], END));
    expect(compileFormula('@sum(b2..c3)', 0, 0)).toEqual(
      bytes([0x02, ...u16(rel(1, 0)), ...u16(rel(1, 0)), ...u16(rel(2, 0)), ...u16(rel(2, 0))], [0x50, 1], END),
    );
  });

  it('normalises a backwards range', () => {
    expect(compileFormula('C3..B2', 0, 0)).toEqual(compileFormula('B2..C3', 0, 0));
  });

  it('accepts @PI and @PI(), spaces and ; as an argument separator', () => {
    expect(compileFormula('@PI*2', 0, 0)).toEqual(compileFormula(' @PI() * 2 ', 0, 0));
    expect(compileFormula('@MAX(1;2)', 0, 0)).toEqual(compileFormula('@MAX(1,2)', 0, 0));
  });

  it('IV8192 and the sheet corners compile', () => {
    expect(decompileFormula(compileFormula('IV8192+A1', 0, 0), 0, 0)).toBe('IV8192+A1');
    expect(decompileFormula(compileFormula('A1', 255, 8191), 255, 8191)).toBe('A1');
    expect(decompileFormula(compileFormula('IV8192', 255, 8191), 255, 8191)).toBe('IV8192');
  });

  it('rejects what 1-2-3 would reject, with an ExhumeError', () => {
    const bad = [
      '', '1+', '(1', '1)', '@FOO(1)', '@SUM()', '@IF(1,2)', '@PI(1)', '@ABS', 'IW1', 'A8193', 'A0', 'ABC1',
      '"abc', '1 2', '#XOR#', '1 $ 2', '€', '"€"', '@SUM(1,,2)',
    ];
    for (const t of bad) expect(() => compileFormula(t, 0, 0), JSON.stringify(t)).toThrow(ExhumeError);
    expect(() => compileFormula('A1', 256, 0)).toThrow(ExhumeError);
    expect(() => compileFormula('A1', 0, 8192)).toThrow(ExhumeError);
    expect(() => compileFormula('('.repeat(300) + '1' + ')'.repeat(300), 0, 0)).toThrow(ExhumeError);
    expect(() => compileFormula('1+'.repeat(2000) + '1', 0, 0)).toThrow(ExhumeError);
  });

  it('text -> bytes -> text is stable for typed formulas', () => {
    const texts = ['@SUM(B2..B13)*1.1', '-($A$1+B1)^2', '($A$1-B1)*-C1', '#NOT#A1=B1#AND#C1<2', 'A1^-B1', '--A1', '@IF(A1>1,"y","n")'];
    for (const t of texts) {
      const b = compileFormula(t, 3, 4);
      const back = decompileFormula(b, 3, 4);
      expect(back, t).not.toBeNull();
      expect(compileFormula(back as string, 3, 4)).toEqual(b);
    }
  });
});
