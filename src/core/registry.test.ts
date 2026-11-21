import { describe, expect, it } from 'vitest';
import { detect, exhume, identify, modules } from './registry.js';
import { ExhumeError } from './types.js';
import { samples } from '../samples/data.js';

const bytesOf = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

describe('registry', () => {
  it('registers the six formats with unique ids', () => {
    expect(modules.map((m) => m.id).sort()).toEqual(['dbf', 'ilbm', 'macpaint', 'pcx', 'wk1', 'wordstar']);
  });
  it('identifies every built-in sample from its bytes alone, with no file name', () => {
    for (const s of samples) expect(identify(bytesOf(s.base64))?.id).toBe(s.formatId);
  });
  it('is not fooled by a wrong extension', () => {
    const ghost = samples.find((s) => s.formatId === 'macpaint')!;
    expect(identify(bytesOf(ghost.base64), 'budget.wk1')?.id).toBe('macpaint');
  });
  it('sorts matches by confidence and keeps them in [0, 1]', () => {
    const matches = detect(bytesOf(samples[0]!.base64), samples[0]!.file);
    expect(matches.length).toBeGreaterThan(0);
    for (let i = 1; i < matches.length; i++) expect(matches[i - 1]!.confidence).toBeGreaterThanOrEqual(matches[i]!.confidence);
    for (const m of matches) expect(m.confidence).toBeGreaterThan(0), expect(m.confidence).toBeLessThanOrEqual(1);
  });
  it('refuses what it does not recognise with an ExhumeError', () => {
    expect(() => exhume(new TextEncoder().encode('just some plain text, nothing legacy about it'), 'note.txt')).toThrow(ExhumeError);
    expect(() => exhume(new Uint8Array(0))).toThrow(ExhumeError);
    expect(identify(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'modern.png')).toBeNull();
  });
});
