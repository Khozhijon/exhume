// ByteWriter: growable writer that produces Uint8Array

export class ByteWriter {
  private buffer: Uint8Array;
  private offset: number = 0;
  private capacity: number = 64;

  constructor() {
    this.buffer = new Uint8Array(this.capacity);
  }

  get length(): number {
    return this.offset;
  }

  private ensureCapacity(n: number): void {
    if (this.offset + n > this.capacity) {
      let newCapacity = this.capacity * 2;
      while (newCapacity < this.offset + n) {
        newCapacity *= 2;
      }
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this.buffer.subarray(0, this.offset));
      this.buffer = newBuffer;
      this.capacity = newCapacity;
    }
  }

  writeU8(value: number): void {
    this.ensureCapacity(1);
    this.buffer[this.offset++] = value & 0xff;
  }

  writeU16le(value: number): void {
    this.ensureCapacity(2);
    this.buffer[this.offset++] = value & 0xff;
    this.buffer[this.offset++] = (value >> 8) & 0xff;
  }

  writeU16be(value: number): void {
    this.ensureCapacity(2);
    this.buffer[this.offset++] = (value >> 8) & 0xff;
    this.buffer[this.offset++] = value & 0xff;
  }

  writeU32le(value: number): void {
    this.ensureCapacity(4);
    this.buffer[this.offset++] = value & 0xff;
    this.buffer[this.offset++] = (value >> 8) & 0xff;
    this.buffer[this.offset++] = (value >> 16) & 0xff;
    this.buffer[this.offset++] = (value >> 24) & 0xff;
  }

  writeU32be(value: number): void {
    this.ensureCapacity(4);
    this.buffer[this.offset++] = (value >> 24) & 0xff;
    this.buffer[this.offset++] = (value >> 16) & 0xff;
    this.buffer[this.offset++] = (value >> 8) & 0xff;
    this.buffer[this.offset++] = value & 0xff;
  }

  writeI16le(value: number): void {
    this.ensureCapacity(2);
    // Convert to unsigned 16-bit
    const unsigned = value < 0 ? value + 65536 : value;
    this.buffer[this.offset++] = unsigned & 0xff;
    this.buffer[this.offset++] = (unsigned >> 8) & 0xff;
  }

  writeI32le(value: number): void {
    this.ensureCapacity(4);
    // Convert to unsigned 32-bit
    const unsigned = value < 0 ? value + 4294967296 : value;
    this.buffer[this.offset++] = unsigned & 0xff;
    this.buffer[this.offset++] = (unsigned >> 8) & 0xff;
    this.buffer[this.offset++] = (unsigned >> 16) & 0xff;
    this.buffer[this.offset++] = (unsigned >> 24) & 0xff;
  }

  writeF64le(value: number): void {
    this.ensureCapacity(8);
    const data = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 8);
    data.setFloat64(0, value, true); // little-endian
    this.offset += 8;
  }

  writeBytes(src: Uint8Array): void {
    this.ensureCapacity(src.length);
    this.buffer.set(src, this.offset);
    this.offset += src.length;
  }

  toUint8Array(): Uint8Array {
    return this.buffer.subarray(0, this.offset);
  }
}
