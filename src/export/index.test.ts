import { describe, it, expect } from 'vitest';
import { exportTargets } from './index.js';

describe('exportTargets', () => {
  const ids = (p: Parameters<typeof exportTargets>[0]) => exportTargets(p).map((t) => t.id);
  it('lists targets per payload kind', () => {
    expect(ids({ kind: 'image', width: 1, height: 1, bitsPerPixel: 8, pixels: new Uint8Array(1) })).toEqual(['png', 'json']);
    expect(ids({ kind: 'sheet', version: '1A', columnWidths: {}, names: [], cells: [] })).toEqual(['csv', 'xlsx', 'json']);
    expect(ids({ kind: 'table', fields: [], records: [], lastUpdate: '2000-01-01' })).toEqual(['csv', 'xlsx', 'json']);
    expect(ids({ kind: 'document', blocks: [] })).toEqual(['md', 'html', 'txt', 'json']);
  });
  it('gives each target an extension and mime type', () => {
    for (const t of exportTargets({ kind: 'document', blocks: [] })) {
      expect(t.extension).toBe(t.id);
      expect(t.mime).toMatch(/\//);
    }
  });
});
