import type { ActivityLease } from '../shared/activity';

// These functions must remain self-contained: Chrome serializes their bodies.
export function sampleInstalledController(lease: ActivityLease): unknown {
  return globalThis.__pilovoObserverV1?.sample(lease) ?? null;
}
export function disposeInstalledController(grantId: string): void {
  globalThis.__pilovoObserverV1?.dispose(grantId);
}
