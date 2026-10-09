export const MAX_FRAME_BYTES = 256 * 1024;
export function encodeFrame(value: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  if (json.length === 0 || json.length > MAX_FRAME_BYTES) throw new Error('frame_size_invalid');
  const length = Buffer.alloc(4); length.writeUInt32LE(json.length);
  return Buffer.concat([length, json]);
}
export class FrameDecoder {
  private header = Buffer.alloc(4);
  private headerLength = 0;
  private body: Buffer | undefined;
  private bodyLength = 0;
  push(chunk: Buffer, onMessage: (value: unknown) => void): void {
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.body) {
        const count = Math.min(4 - this.headerLength, chunk.length - offset);
        chunk.copy(this.header, this.headerLength, offset, offset + count); this.headerLength += count; offset += count;
        if (this.headerLength < 4) continue;
        const size = this.header.readUInt32LE();
        if (size === 0 || size > MAX_FRAME_BYTES) throw new Error('frame_size_invalid');
        this.body = Buffer.alloc(size); this.bodyLength = 0;
      }
      const count = Math.min(this.body.length - this.bodyLength, chunk.length - offset);
      chunk.copy(this.body, this.bodyLength, offset, offset + count); this.bodyLength += count; offset += count;
      if (this.bodyLength === this.body.length) {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(this.body);
        this.body = undefined; this.bodyLength = 0; this.headerLength = 0;
        onMessage(JSON.parse(text));
      }
    }
  }
  end(): void { if (this.headerLength !== 0 || this.body) throw new Error('frame_truncated'); }
}
