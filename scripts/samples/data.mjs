// Sample data models for WK1 (budget sheet), DBF (residents table), and WordStar (letter).
// All content is original; dates are fixed to 1986-1987 for deterministic output.

// ================================================================= BUDGET87.WK1
export function budgetWk1() {
  const cur = { type: 2, decimals: 2, protected: false }; // currency, 2 places
  const gen = { type: 7, decimals: 1, protected: false }; // general
  const dflt = { type: 7, decimals: 15, protected: false }; // default
  const date = { type: 7, decimals: 2, protected: false }; // D-MMM-YY
  const col = (c) => String.fromCharCode(65 + c);
  const cells = [];
  const label = (row, c, value, align = 'left') => cells.push({ col: c, row, type: 'label', value, align, format: dflt });
  const num = (row, c, value, format = cur) =>
    cells.push({ col: c, row, type: Number.isInteger(value) ? 'integer' : 'number', value, format });
  const formula = (row, c, text, value, format = cur) => cells.push({ col: c, row, type: 'formula', value, formula: text, format });
  const rule = (row) => {
    for (let c = 0; c < 6; c++) label(row, c, '-', 'repeat');
  };
  const cents = (x) => Math.round(x * 100) / 100;
  const span = (c1, r1, c2, r2) => col(c1) + (r1 + 1) + '..' + col(c2) + (r2 + 1);

  label(0, 0, 'HOUSEHOLD BUDGET 1987');
  rule(1);
  label(2, 0, 'Item');
  ['Jan', 'Feb', 'Mar', 'Q1 Total', 'Average'].forEach((h, i) => label(2, i + 1, h, 'right'));

  const items = [
    ['Rent', 800, 800, 800],
    ['Groceries', 240, 215, 268],
    ['Electricity', 45.5, 38.25, 52.75],
    ['Telephone', 32.4, 31.6, 36.8],
    ['Car', 125, 125, 140],
    ['Insurance', 89, 89, 89],
    ['Floppy disks', 19.99, 29.99, 9.99],
    ['Savings', 300, 350, 300],
  ];
  const first = 3;
  const last = first + items.length - 1;
  const month = [0, 0, 0];
  const q1 = [];
  items.forEach(([name, ...m], i) => {
    const row = first + i;
    label(row, 0, name);
    m.forEach((v, k) => {
      num(row, k + 1, v);
      month[k] += v;
    });
    const sum = cents(m[0] + m[1] + m[2]);
    q1.push(sum);
    formula(row, 4, '@SUM(' + span(1, row, 3, row) + ')', sum);
    formula(row, 5, '@AVG(' + span(1, row, 3, row) + ')', sum / 3);
  });
  rule(last + 1);
  const totals = last + 2;
  label(totals, 0, 'TOTAL');
  month.forEach((v, k) => formula(totals, k + 1, '@SUM(' + span(k + 1, first, k + 1, last) + ')', cents(v)));
  const grand = cents(q1.reduce((x, y) => x + y, 0));
  formula(totals, 4, '@SUM(' + span(4, first, 4, last) + ')', grand);
  formula(totals, 5, '@AVG(' + span(1, totals, 3, totals) + ')', grand / 3);

  const limitRow = totals + 2;
  label(limitRow, 0, 'Monthly limit');
  num(limitRow, 1, 1650);
  label(limitRow + 1, 0, 'Over budget?');
  formula(limitRow + 1, 1, '@IF(E' + (totals + 1) + '>$B$' + (limitRow + 1) + '*3,1,0)', grand > 1650 * 3 ? 1 : 0, gen);
  label(limitRow + 2, 0, 'Largest item');
  formula(limitRow + 2, 1, '@MAX(' + span(4, first, 4, last) + ')', Math.max(...q1));
  label(limitRow + 3, 0, 'Printed');
  // 31 October 1987 as a 1-2-3 date serial (days from 30 December 1899; 1 = 1 January 1900)
  num(limitRow + 3, 1, Math.round((Date.UTC(1987, 9, 31) - Date.UTC(1899, 11, 30)) / 86400000), date);

  cells.sort((x, y) => x.row - y.row || x.col - y.col);
  return {
    kind: 'sheet',
    version: '2',
    range: { startCol: 0, startRow: 0, endCol: 5, endRow: limitRow + 3 },
    columnWidths: { 0: 14, 4: 11, 5: 10 },
    names: [{ name: 'TOTALS', range: { startCol: 1, startRow: totals, endCol: 5, endRow: totals } }],
    cells,
  };
}

export function residentDbf() {
  const fields = [
    { name: 'NAME', type: 'C', length: 24, decimals: 0 },
    { name: 'BORN', type: 'N', length: 4, decimals: 0 },
    { name: 'DIED', type: 'N', length: 4, decimals: 0 },
    { name: 'PLOT', type: 'C', length: 4, decimals: 0 },
    { name: 'MOURNED', type: 'L', length: 1, decimals: 0 },
    { name: 'BURIED', type: 'D', length: 8, decimals: 0 },
    { name: 'SIZE_KB', type: 'N', length: 8, decimals: 2 },
  ];

  const records = [
    { values: ['VisiCalc', 1979, 1985, 'A1', true, '1985-11-30', 45.50], deleted: false },
    { values: ['WordStar', 1978, 1992, 'A2', true, '1992-06-15', 156.32], deleted: false },
    { values: ['MacPaint', 1984, 1988, 'A3', true, '1988-12-31', 234.75], deleted: false },
    { values: ['CP/M', 1974, 1983, 'A4', true, '1983-03-20', 87.00], deleted: true },
    { values: ['Lotus 1-2-3', 1983, 2013, 'B1', true, '2013-09-01', 512.00], deleted: false },
    { values: ['dBASE II', 1980, 1985, 'B2', true, '1985-08-10', 128.50], deleted: false },
    { values: ['PC Paintbrush', 1984, 1994, 'B3', true, '1994-07-25', 276.88], deleted: false },
    { values: ['Deluxe Paint', 1985, 1995, 'B4', true, '1995-02-14', 345.12], deleted: true },
    { values: ['Commodore 64', 1982, 1994, 'C1', true, '1994-11-20', 64.00], deleted: false },
    { values: ['Atari 2600', 1977, 1992, 'C2', true, '1992-03-03', 8.00], deleted: false },
    { values: ['Amiga 500', 1987, 2000, 'C3', true, '2000-06-01', 1024.00], deleted: false },
    { values: ['Sinclair ZX', 1980, 1995, 'C4', false, '1995-05-12', 48.00], deleted: false },
  ];

  return {
    kind: 'table',
    fields,
    records: records.map(r => ({ values: r.values, deleted: r.deleted })),
    lastUpdate: '1987-10-31',
  };
}

// ================================================================= LETTER.WS
export function letterWs() {
  const t = (text, style = {}) => ({ text, ...style });
  const p = (...runs) => ({ type: 'paragraph', runs: runs.map((r) => (typeof r === 'string' ? t(r) : r)) });
  const B = { bold: true };
  const I = { italic: true };
  const U = { underline: true };
  return {
    kind: 'document',
    header: 'The last letter on this disk',
    footer: 'Page #',
    blocks: [
      p(t('31 October 1986', B)),
      p('To whoever opens this,'),
      p(
        'If you are reading these words, then someone, somewhere, still knows how to open a WordStar file. I did not expect that. I am typing this at the kitchen table, on a machine with two floppy drives and a green screen, and I already know that one day ',
        t('nothing', B),
        ' will read what it writes.',
      ),
      p(
        "So let me tell you what is on this disk. There is a drawing I made on my sister's Macintosh: a ghost over a gravestone, every dot of it black or white. There is a pumpkin from the office PC, and a moon from the Amiga in the shop window that I could never afford. There is our household budget for next year",
        t('1', { sup: true }),
        ', with every formula ',
        t('checked twice', U),
        '. And there is a register, kept in dBASE, of things I have loved that are ',
        t('already', I),
        ' gone.',
      ),
      p(
        'I am not sad about it. Machines are replaced; that is what they are for. But the work is not the machine. The drawing is still a drawing. The numbers still add up. A letter is still a letter, even when the last program that understood it has been erased to make room for something newer.',
      ),
      { type: 'pageBreak' },
      p(
        'So I have one request. ',
        t('Do not keep these files the way I left them.', B),
        ' Move them. Copy them into whatever your world uses now, and when that format begins to die, as it will, move them again. Files do not last because they are stored. They last because somebody keeps ',
        t('carrying', I),
        ' them.',
      ),
      p('Thank you for digging. It is a strange and kind thing, to be read by a stranger so long afterwards.'),
      p('Yours, across the years,'),
      p(t('M.', B)),
      p(t('1', { sup: true }), ' Yes, the budget is for 1987. I was always planning ahead.'),
    ],
  };
}
