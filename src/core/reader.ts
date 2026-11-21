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
    const value = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
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
    const value = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
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
        break;
      }
      end++;
    }
    this.offset_ = end + 1; // Consume the null terminator if found

    // Get string content
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
