// Test the embedded sample specimens: decode each and verify known values.
import { describe, it, expect } from 'vitest';
import { exhume } from '../core/registry.js';
import type { ImagePayload, SheetPayload, TablePayload, DocumentPayload } from '../core/types.js';
import { samples } from './data.js';

function decodeBase64(b64: string): Uint8Array {
  // Use Buffer.from in Node (vitest environment), or atob in browser
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

describe('embedded samples', () => {
  it('decode all samples without errors', () => {
    for (const sample of samples) {
      const bytes = decodeBase64(sample.base64);
      const { module, specimen } = exhume(bytes, sample.file);
      expect(module.id).toBe(sample.formatId);
      expect(specimen.warnings).toHaveLength(0);
    }
  });

  it('GHOST.MAC is 576x720', () => {
    const sample = samples.find(s => s.file === 'GHOST.MAC')!;
    const bytes = decodeBase64(sample.base64);
    const { specimen } = exhume(bytes, sample.file);
    expect(specimen.payload.kind).toBe('image');
    const img = specimen.payload as ImagePayload;
    expect(img.width).toBe(576);
    expect(img.height).toBe(720);
    expect(img.bitsPerPixel).toBe(1);
  });

  it('BUDGET87.WK1 has Q1 total for Rent and correct value', () => {
    const sample = samples.find(s => s.file === 'BUDGET87.WK1')!;
    const bytes = decodeBase64(sample.base64);
    const { specimen } = exhume(bytes, sample.file);
    expect(specimen.payload.kind).toBe('sheet');
    const sheet = specimen.payload as SheetPayload;
    
    // Q1 Total for Rent: worksheet cell E4 (row index 3, column index 4)
    const rentQ1 = sheet.cells.find((c) => c.row === 3 && c.col === 4);
    expect(rentQ1).toBeDefined();
    expect(rentQ1?.type).toBe('formula');
    expect(rentQ1?.formula).toBe('@SUM(B4..D4)');
    expect(rentQ1?.value).toBe(2400); // 800 + 800 + 800
  });

  it('RESIDENT.DBF record 3 has name MacPaint', () => {
    const sample = samples.find(s => s.file === 'RESIDENT.DBF')!;
    const bytes = decodeBase64(sample.base64);
    const { specimen } = exhume(bytes, sample.file);
    expect(specimen.payload.kind).toBe('table');
    const table = specimen.payload as TablePayload;
    
    // Record 3 (0-indexed) should be MacPaint
    expect(table.records[2]).toBeDefined();
    const record = table.records[2]!;
    expect(record.values[0]).toBe('MacPaint');
    expect(record.deleted).toBe(false);
  });

  it('RESIDENT.DBF has two deleted records', () => {
    const sample = samples.find(s => s.file === 'RESIDENT.DBF')!;
    const bytes = decodeBase64(sample.base64);
    const { specimen } = exhume(bytes, sample.file);
    expect(specimen.payload.kind).toBe('table');
    const table = specimen.payload as TablePayload;
    
    const deletedCount = table.records.filter((r) => r.deleted).length;
    expect(deletedCount).toBe(2);
  });

  it('LETTER.WS has first bold run', () => {
    const sample = samples.find(s => s.file === 'LETTER.WS')!;
    const bytes = decodeBase64(sample.base64);
    const { specimen } = exhume(bytes, sample.file);
    expect(specimen.payload.kind).toBe('document');
    const doc = specimen.payload as DocumentPayload;
    
    // Find the first bold run (the date line)
    let foundBold = false;
    for (const block of doc.blocks) {
      if (block.type === 'pageBreak') continue;
      for (const run of block.runs) {
        if (run.bold && run.text === '31 October 1986') {
          foundBold = true;
          break;
        }
      }
      if (foundBold) break;
    }
    expect(foundBold).toBe(true);
  });
});
