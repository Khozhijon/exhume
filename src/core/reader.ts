// ByteReader: bounds-checked reader that records annotation spans

import { Annotation, ExhumeError } from './types.js';

export class ByteReader {
  private buffer: Uint8Array;
  private offset_: number = 0;
  private annotations_: Annotation[] = [];
  private annotationStack: Array<{ label: string; start: number; children: Annotation[] }> = [];

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }

  get offset(): number {
    return this.offset_;
  }

  get size(): number {
    return this.buffer.length;
  }

  get remaining(): number {
    return this.buffer.length - this.offset_;
  }

  /** Record an annotation span from start to current offset. */
  private annotate(label: string, start: number, value?: string): void {
    const end = this.offset_;
    const annotation: Annotation = { label, start, end };
    if (value !== undefined) {
      annotation.value = value;
    }

    if (this.annotationStack.length > 0) {
      // Add to current group
      const currentGroup = this.annotationStack[this.annotationStack.length - 1]!;
      currentGroup.children.push(annotation);
    } else {
      // Top-level annotation
      this.annotations_.push(annotation);
    }
  }

  u8(label: string): number {
    this.assertRemaining(1);
    const start = this.offset_;
    const value = this.buffer[start]!;
    this.offset_ += 1;
    this.annotate(label, start, `${value}`);
    return value;
  }

  u16le(label: string): number {
    this.assertRemaining(2);
    const start = this.offset_;
    const lo = this.buffer[start]!;
    const hi = this.buffer[start + 1]!;
    this.offset_ += 2;
    const value = lo | (hi << 8);
    this.annotate(label, start, `0x${value.toString(16).toUpperCase().padStart(4, '0')} (${value})`);
    return value;
  }

  u16be(label: string): number {
    this.assertRemaining(2);
    const start = this.offset_;
    const hi = this.buffer[start]!;
    const lo = this.buffer[start + 1]!;
    this.offset_ += 2;
    const value = (hi << 8) | lo;
    this.annotate(label, start, `0x${value.toString(16).toUpperCase().padStart(4, '0')} (${value})`);
    return value;
  }

  u32le(label: string): number {
    this.assertRemaining(4);
    const start = this.offset_;
    const b0 = this.buffer[start]!;
    const b1 = this.buffer[start + 1]!;
    const b2 = this.buffer[start + 2]!;
    const b3 = this.buffer[start + 3]!;
    this.offset_ += 4;
    const value = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
    this.annotate(label, start, `0x${value.toString(16).toUpperCase().padStart(8, '0')} (${value})`);
    return value;
  }

  u32be(label: string): number {
    this.assertRemaining(4);
    const start = this.offset_;
    const b3 = this.buffer[start]!;
    const b2 = this.buffer[start + 1]!;
    const b1 = this.buffer[start + 2]!;
    const b0 = this.buffer[start + 3]!;
    this.offset_ += 4;
    const value = ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0;
    this.annotate(label, start, `0x${value.toString(16).toUpperCase().padStart(8, '0')} (${value})`);
    return value;
  }

  i8(label: string): number {
    this.assertRemaining(1);
    const start = this.offset_;
    const value = this.buffer[start]!;
    this.offset_ += 1;
    // Sign-extend from 8 bits
    const signed = value >= 128 ? value - 256 : value;
    this.annotate(label, start, `${signed}`);
    return signed;
  }

  i16le(label: string): number {
    this.assertRemaining(2);
    const start = this.offset_;
    const lo = this.buffer[start]!;
    const hi = this.buffer[start + 1]!;
    this.offset_ += 2;
    let value = lo | (hi << 8);
    // Sign-extend from 16 bits
    if (value >= 32768) {
      value -= 65536;
    }
    this.annotate(label, start, `${value}`);
    return value;
  }

  i32le(label: string): number {
    this.assertRemaining(4);
    const start = this.offset_;
    const b0 = this.buffer[start]!;
    const b1 = this.buffer[start + 1]!;
    const b2 = this.buffer[start + 2]!;
    const b3 = this.buffer[start + 3]!;
    this.offset_ += 4;
    let value = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    this.annotate(label, start, `${value}`);
    return value;
  }

  f64le(label: string): number {
    this.assertRemaining(8);
    const start = this.offset_;
    const data = new DataView(this.buffer.buffer, this.buffer.byteOffset + start, 8);
    const value = data.getFloat64(0, true); // little-endian
    this.offset_ += 8;
    this.annotate(label, start, `${value}`);
    return value;
  }

  bytes(n: number, label: string): Uint8Array {
    if (!Number.isInteger(n) || n < 0) {
      throw new ExhumeError(`bytes: n must be a non-negative integer, got ${n}`);
    }
    this.assertRemaining(n);
    const start = this.offset_;
    const result = this.buffer.subarray(start, this.offset_ + n);
    this.offset_ += n;
    this.annotate(label, start, `${n} bytes`);
    return result;
  }

  nullString(label: string, maxLen?: number): string {
    const max = maxLen ?? this.remaining;
    if (max === 0) {
      this.annotate(label, this.offset_, `""`);
      return '';
    }
    this.assertRemaining(1);
    const start = this.offset_;
    let end = start;
    while (end < start + max && end < this.buffer.length) {
      if (this.buffer[end] === 0) {
        this.offset_ = end + 1;
        const content = this.buffer.subarray(start, end);
        let text = '';
        for (let i = 0; i < content.length; i++) {
          text += String.fromCharCode(content[i]!);
        }
        this.annotate(label, start, `"${text}"`);
        return text;
      }
      end++;
    }
    // No NUL found - stop at max or end, do NOT consume anything past content
    this.offset_ = end;
    const content = this.buffer.subarray(start, end);
    let text = '';
    for (let i = 0; i < content.length; i++) {
      text += String.fromCharCode(content[i]!);
    }
    this.annotate(label, start, `"${text}"`);
    return text;
  }

  group<T>(label: string, fn: () => T): T {
    const start = this.offset_;
    this.annotationStack.push({ label, start, children: [] });
    try {
      const result = fn();
      this.endGroup(label, start);
      return result;
    } catch (e) {
      this.endGroup(label, start);
      throw e;
    }
  }

  private endGroup(label: string, start: number): void {
    if (this.annotationStack.length === 0) {
      throw new Error('Internal error: annotation stack underflow');
    }
    const group = this.annotationStack[this.annotationStack.length - 1]!;
    this.annotationStack.pop();
    const annotation: Annotation = {
      label: group.label,
      start: group.start,
      end: this.offset_,
      children: group.children.length > 0 ? group.children : undefined,
    };
    if (this.annotationStack.length > 0) {
      const currentGroup = this.annotationStack[this.annotationStack.length - 1]!;
      currentGroup.children.push(annotation);
    } else {
      this.annotations_.push(annotation);
    }
  }

  skip(n: number, label: string): void {
    if (!Number.isInteger(n) || n < 0) {
      throw new ExhumeError(`skip: n must be a non-negative integer, got ${n}`);
    }
    this.assertRemaining(n);
    const start = this.offset_;
    this.offset_ += n;
    this.annotate(label, start, `${n} bytes`);
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.buffer.length) {
      throw new ExhumeError(
        `Seek to ${offset} is out of bounds (size: ${this.buffer.length})`,
      );
    }
    this.offset_ = offset;
  }

  /** Look at a byte without consuming it or recording an annotation. Undefined when out of range. */
  peek(at: number = this.offset_): number | undefined {
    return at >= 0 && at < this.buffer.length ? this.buffer[at] : undefined;
  }

  /** Read n bytes as text through a code page function and record the decoded text as the value. */
  text(n: number, label: string, decode: (byte: number) => string): string {
    if (!Number.isInteger(n) || n < 0) {
      throw new ExhumeError(`text: n must be a non-negative integer, got ${n}`);
    }
    this.assertRemaining(n);
    const start = this.offset_;
    let out = '';
    for (let i = 0; i < n; i++) out += decode(this.buffer[start + i]!);
    this.offset_ += n;
    this.annotate(label, start, JSON.stringify(out.length > 60 ? out.slice(0, 60) + '...' : out));
    return out;
  }

  /**
   * Record an annotation for a span the decoder consumed by other means (for example a compressed
   * run decoded by a codec). Moves the cursor to `end`.
   */
  mark(label: string, start: number, end: number, value?: string): void {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > this.buffer.length) {
      throw new ExhumeError(`mark: span ${start}..${end} is outside the file (size ${this.buffer.length})`);
    }
    this.offset_ = end;
    this.annotate(label, start, value);
  }

  /** The whole underlying buffer (for codecs that need random access). */
  get buffer_(): Uint8Array {
    return this.buffer;
  }

  annotations(): Annotation[] {
    return this.annotations_;
  }

  private assertRemaining(n: number): void {
    if (this.remaining < n) {
      throw new ExhumeError(
        `Offset ${this.offset_}: need ${n} bytes but only ${this.remaining} remaining`,
      );
    }
  }
}
