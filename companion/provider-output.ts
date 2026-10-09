import { StringDecoder } from 'node:string_decoder';
import { browserActivitySchema, chromeToolSchema, type BrowserActivity } from '../src/shared/launch';
import type { SourceId } from '../src/shared/types';

export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export const MAX_LINE_BYTES = 128 * 1024;
export class ProviderOutput {
  private decoder = new StringDecoder('utf8');
  private buffer = '';
  private total = 0;
  private terminal = false;
  private success = false;
  private invalid = false;
  private summary = '';
  private pendingTools = new Map<string, BrowserActivity['tool']>();
  constructor(private source: SourceId, private activity: (activity: BrowserActivity) => void) {}
  push(chunk: Buffer): void {
    this.total += chunk.length;
    if (this.total > MAX_OUTPUT_BYTES) throw new Error('output_limit');
    this.buffer += this.decoder.write(chunk);
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) { const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1); this.line(line); }
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) throw new Error('output_line_limit');
  }
  finish(exitCode: number | null): { success: boolean; summary: string } {
    this.buffer += this.decoder.end(); if (this.buffer.trim()) this.line(this.buffer); this.buffer = '';
    return { success: exitCode === 0 && this.terminal && this.success && !this.invalid, summary: this.summary };
  }
  private line(line: string): void {
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw new Error('output_line_limit');
    if (!line.trim()) return;
    let value: any;
    try { value = JSON.parse(line); } catch { this.invalid = true; return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { this.invalid = true; return; }
    if (value.type === 'error') { this.invalid = true; return; }
    if (this.source === 'codex') {
      if (value.type === 'item.completed' && value.item?.type === 'agent_message' && typeof value.item.text === 'string') this.summary = value.item.text.slice(0, 16000);
      if (value.type === 'turn.completed') { if (this.terminal) this.invalid = true; this.terminal = true; this.success = !!value.usage && typeof value.usage === 'object' && ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(value.usage[key]) && value.usage[key] >= 0); }
      if (value.type === 'error' || value.type === 'turn.failed') { this.terminal = true; this.success = false; this.invalid = true; }
      return;
    }
    if (value.type === 'result') {
      if (this.terminal) this.invalid = true;
      this.terminal = true; this.success = value.subtype === 'success' && value.is_error === false && typeof value.result === 'string' && (value.permission_denials === undefined || Array.isArray(value.permission_denials) && value.permission_denials.length === 0);
      if (this.success) this.summary = value.result.slice(0, 16000);
    }
    if (value.type === 'assistant' && Array.isArray(value.message?.content)) for (const block of value.message.content) {
      if (block?.type !== 'tool_use' || typeof block.id !== 'string' || block.id.length > 200) continue;
      const parsed = chromeToolSchema.safeParse(block.name);
      if (!parsed.success || this.pendingTools.has(block.id) || this.pendingTools.size >= 128) continue;
      this.pendingTools.set(block.id, parsed.data); this.activity(browserActivitySchema.parse({ tool: parsed.data, status: 'requested' }));
    }
    if (value.type === 'user' && Array.isArray(value.message?.content)) for (const block of value.message.content) {
      if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
      const tool = this.pendingTools.get(block.tool_use_id);
      if (!tool) continue;
      this.pendingTools.delete(block.tool_use_id); this.activity({ tool, status: block.is_error === true ? 'failed' : 'succeeded' });
    }
  }
}
