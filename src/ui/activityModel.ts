import type { WebActivityObservation, WebActivitySnapshot } from '../shared/activity';
import type { WebDiscovery, WebProvider } from '../shared/web';

/** Downgrade uncertain data before deriving rows, actions or summary counts. Unseen attention follows the worker's next-attention order (raised first, then lower tab ID). */
export function currentObservations(snapshot: WebActivitySnapshot | null, discovery: WebDiscovery | null, now: number, failed: boolean, pending: WebProvider[] = []): WebActivityObservation[] {
  return (snapshot?.observations || []).map(record => {
    const permission = discovery?.providers.find(provider => provider.id === record.provider)?.permission;
    const unavailable = failed || snapshot?.availability !== 'available' || permission !== 'granted' || pending.includes(record.provider);
    const expired = !Number.isFinite(record.validUntil) || record.validUntil <= now;
    if (!unavailable && !expired) return record;
    return { ...record, state: 'unknown' as const, attention: undefined, unknownReason: unavailable ? 'unavailable' as const : 'expired' as const };
  }).sort((a, b) => priority(a) - priority(b) || (priority(a) === 0 ? a.attention!.raisedAt - b.attention!.raisedAt || a.tabId - b.tabId : 0) || a.id.localeCompare(b.id));
}

export const needsAttention = (record: WebActivityObservation) => record.state === 'attention' && Boolean(record.attention && !record.attention.acknowledged);
const priority = (record: WebActivityObservation) => needsAttention(record) ? 0 : record.state === 'working' ? 1 : record.state === 'attention' ? 2 : record.state === 'idle' ? 3 : 4;

/** Chrome reports the configured shortcut text; French keyboards label Shift as Maj. */
export const shortcutLabel = (shortcut: string, en: boolean) => en ? shortcut : shortcut.split('+').map(key => key === 'Shift' ? 'Maj' : key).join('+');

/** Working and attention rows (seen or not) time their displayed state on the shared monotonic clock; other states,
 * clock skew (negative) and unusable values give undefined, so nothing is shown. Never persisted or sent. */
export function stateElapsed(record: WebActivityObservation, now: number): number | undefined {
  if (record.state !== 'working' && record.state !== 'attention') return undefined;
  // Check the operands, not only the difference: over JSON a NaN arrives as null, and `now - null` would coerce to `now`.
  if (!Number.isFinite(record.stateSince) || !Number.isFinite(now)) return undefined;
  const elapsed = now - record.stateSince;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined;
}
/** Minute precision; the number and its unit stay together (no-break spaces). */
export function formatElapsed(elapsed: number | undefined, en: boolean): string | undefined {
  if (elapsed === undefined || !Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return en ? 'under a minute' : 'moins d’une minute';
  if (minutes < 60) return `${minutes}\u00a0min`;
  const hours = `${Math.floor(minutes / 60)}\u00a0h\u00a0${String(minutes % 60).padStart(2, '0')}`;
  return en ? `${hours}\u00a0min` : hours;
}
export const ELAPSED_TICK = 15_000;
/** Delay before a shown duration can change: the nearest minute boundary, at most ELAPSED_TICK. Undefined while no row shows one. */
export function nextElapsedTick(records: readonly WebActivityObservation[], now: number): number | undefined {
  const waits = records.map(record => stateElapsed(record, now)).filter((elapsed): elapsed is number => elapsed !== undefined).map(elapsed => Math.ceil(60_000 - elapsed % 60_000) + 1);
  return waits.length ? Math.min(ELAPSED_TICK, ...waits) : undefined;
}
