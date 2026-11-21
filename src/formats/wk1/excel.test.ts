import { describe, expect, it } from 'vitest';
import { translateToExcel as x } from './excel.js';
import { FUNCTIONS } from './formula-ast.js';

describe('translateToExcel', () => {
  it('ranges and plain arithmetic', () => {
    expect(x('@SUM(A1..B2)')).toBe('SUM(A1:B2)');
    expect(x('@SUM($B$2..$B$13)*1.1')).toBe('SUM($B$2:$B$13)*1.1');
    expect(x('B2*1.1')).toBe('B2*1.1');
    expect(x('(A1+B1)*C1')).toBe('(A1+B1)*C1');
  });

  it('function renames', () => {
    expect(x('@AVG(A1..A9)')).toBe('AVERAGE(A1:A9)');
    expect(x('@COUNT(A1..A9)')).toBe('COUNTA(A1:A9)');
    expect(x('@STD(A1..A9)')).toBe('STDEVP(A1:A9)');
    expect(x('@VAR(A1..A9)')).toBe('VARP(A1:A9)');
    expect(x('@LENGTH(A1)')).toBe('LEN(A1)');
    expect(x('@CHAR(65)')).toBe('CHAR(65)');
    expect(x('@CODE("A")')).toBe('CODE("A")');
    expect(x('@MOD(A1,3)')).toBe('MOD(A1,3)');
    expect(x('@IF(A1>0,1,2)')).toBe('IF(A1>0,1,2)');
    expect(x('@ISSTRING(A1)')).toBe('ISTEXT(A1)');
    expect(x('@MIN(1,2)+@MAX(3,4)')).toBe('MIN(1,2)+MAX(3,4)');
  });

  it('functions with no arguments get parentheses', () => {
    expect(x('@TODAY')).toBe('TODAY()');
    expect(x('@PI*2')).toBe('PI()*2');
    expect(x('@NA')).toBe('NA()');
    expect(x('@RAND')).toBe('RAND()');
    expect(x('@TRUE')).toBe('TRUE()');
  });

  it('@STRING becomes FIXED without thousands separators', () => {
    expect(x('@STRING(A1,2)')).toBe('FIXED(A1,2,TRUE())');
  });

  it('0-based Lotus arguments become 1-based', () => {
    expect(x('@FIND("a",A1,0)')).toBe('FIND("a",A1,1)-1');
    expect(x('@FIND("a",A1,B1)')).toBe('FIND("a",A1,B1+1)-1');
    expect(x('@FIND("a",A1,0)+1')).toBe('FIND("a",A1,1)-1+1');
    expect(x('@MID(A1,0,3)')).toBe('MID(A1,1,3)');
    expect(x('@CHOOSE(A1,"a","b")')).toBe('CHOOSE(A1+1,"a","b")');
    expect(x('@VLOOKUP(A1,$C$1..$D$9,1)')).toBe('VLOOKUP(A1,$C$1:$D$9,2)');
    expect(x('@HLOOKUP(A1,$C$1..$D$9,B1)')).toBe('HLOOKUP(A1,$C$1:$D$9,B1+1)');
    expect(x('@VLOOKUP(A1,C1..D9,B1-1)')).toBe('VLOOKUP(A1,C1:D9,B1-1+1)');
  });

  it('logic: #AND# and #OR# keep numeric truth, operands are parenthesised', () => {
    expect(x('A1#AND#B1')).toBe('A1*B1');
    expect(x('A1#OR#B1')).toBe('A1+B1');
    expect(x('A1>1#AND#B1<2')).toBe('(A1>1)*(B1<2)');
    expect(x('A1>1#OR#B1<2')).toBe('(A1>1)+(B1<2)');
    expect(x('@IF(A1>1#AND#B1<2,1,0)')).toBe('IF((A1>1)*(B1<2),1,0)');
    expect(x('A1+B1#AND#C1')).toBe('(A1+B1)*C1');
    expect(x('(A1#OR#B1)*2')).toBe('(A1+B1)*2');
    expect(x('A1#AND#(B1#OR#C1)')).toBe('A1*(B1+C1)');
    expect(x('#NOT#A1')).toBe('NOT(A1)');
    expect(x('#NOT#A1=B1')).toBe('NOT(A1=B1)');
    expect(x('#NOT#(A1#AND#B1)')).toBe('NOT((A1*B1))');
  });

  it('unary minus binds looser than ^ in Lotus but tighter in Excel', () => {
    expect(x('-A1^2')).toBe('-(A1^2)');
    expect(x('(-A1)^2')).toBe('(-A1)^2');
    expect(x('-($A$1+$B$1)^2')).toBe('-(($A$1+$B$1)^2)');
    expect(x('(A1-B1)*-C1')).toBe('(A1-B1)*-C1');
    expect(x('A1^(-B1)')).toBe('A1^(-B1)');
    expect(x('A1-(B1-C1)')).toBe('A1-(B1-C1)');
    expect(x('2^3^2')).toBe('2^3^2');
  });

  it('constants and strings', () => {
    expect(x('1E+21')).toBe('1E+21');
    expect(x('-3')).toBe('-3');
    expect(x('"it\'s"')).toBe('"it\'s"');
    expect(x("'say \"hi\"'")).toBe('"say ""hi"""');
  });

  it('dates and money', () => {
    expect(x('@YEAR(A1)')).toBe('YEAR(A1)-1900');
    expect(x('@YEAR(A1)+1')).toBe('YEAR(A1)-1900+1');
    expect(x('@DATE(90,1,1)')).toBe('DATE(90,1,1)');
    expect(x('@INT(A1)')).toBe('TRUNC(A1)');
    expect(x('@LOG(A1)')).toBe('LOG10(A1)');
    expect(x('@PMT(A1,B1,C1)')).toBe('-PMT(B1,C1,A1)');
    expect(x('@PMT(A1,B1,C1)*12')).toBe('-PMT(B1,C1,A1)*12');
    expect(x('@PV(A1,B1,C1)')).toBe('-PV(B1,C1,A1)');
    expect(x('@FV(A1,B1,C1)')).toBe('-FV(B1,C1,A1)');
    expect(x('@IRR(0.1,A1..A5)')).toBe('IRR(A1:A5,0.1)');
    expect(x('@NPV(0.1,A1..A5)')).toBe('NPV(0.1,A1:A5)');
  });

  it('returns null when there is no faithful Excel form', () => {
    expect(x('@CELLPOINTER("address")')).toBeNull();
    expect(x('@ERR')).toBeNull();
    expect(x('1+@ERR')).toBeNull();
    expect(x('@IF(A1,@ERR,1)')).toBeNull();
  });

  it('returns null for text that is not a Lotus formula', () => {
    expect(x('')).toBeNull();
    expect(x('@NOPE(1)')).toBeNull();
    expect(x('1+')).toBeNull();
    expect(x('SUM(A1:B2)')).toBeNull();
  });

  it('every function in the notes is either translated or deliberately refused', () => {
    const refused = new Set(['ERR', 'CELLPOINTER']);
    for (const f of FUNCTIONS) {
      const n = f.arity === 'var' ? 2 : f.arity;
      const text = n === 0 ? `@${f.name}` : `@${f.name}(${Array.from({ length: n }, (_, i) => i + 1).join(',')})`;
      const out = x(text);
      if (refused.has(f.name)) expect(out, f.name).toBeNull();
      else expect(out, f.name).not.toBeNull();
    }
  });
});
