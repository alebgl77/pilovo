import { controlResponseSchema, type ControlRequest, type ControlResponse } from '../shared/launch';
import { HubError } from '../shared/errors';

export class NativeControls {
  private pending = new Map<string, { resolve: (response: ControlResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; kind: ControlRequest['kind'] }>();
  request(request: ControlRequest, send: (input: ControlRequest) => void, timeout = 20000): Promise<ControlResponse> {
    if (this.pending.has(request.requestId) || this.pending.size >= 8) return Promise.reject(new HubError('bridge.unavailable'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(request.requestId); reject(new HubError('bridge.unavailable')); }, timeout);
      this.pending.set(request.requestId, { resolve, reject, timer, kind: request.kind });
      try { send(request); } catch { clearTimeout(timer); this.pending.delete(request.requestId); reject(new HubError('bridge.unavailable')); }
    });
  }
  receive(input: unknown): boolean {
    const parsed = controlResponseSchema.safeParse(input);
    if (!parsed.success) return false;
    const response = parsed.data, pending = this.pending.get(response.requestId);
    if (!pending) return true; // A late response is valid but must not satisfy another request.
    const expected = pending.kind === 'inventory.request' ? 'inventory.result' : pending.kind === 'launch.request' ? 'launch.result' : 'cancel.result';
    if (response.kind !== expected) return false;
    clearTimeout(pending.timer); this.pending.delete(response.requestId); pending.resolve(response); return true;
  }
  disconnect() {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new HubError('bridge.unavailable')); }
    this.pending.clear();
  }
}
