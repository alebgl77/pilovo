import type { WebActivityObservation, WebActivitySnapshot } from '../shared/activity';
import type { WebDiscovery, WebProvider } from '../shared/web';

/** Downgrade uncertain data before deriving rows, actions or summary counts. */
export function currentObservations(snapshot: WebActivitySnapshot | null, discovery: WebDiscovery | null, now: number, failed: boolean, pending: WebProvider[] = []): WebActivityObservation[] {
  return (snapshot?.observations || []).map(record => {
    const permission = discovery?.providers.find(provider => provider.id === record.provider)?.permission;
    const unavailable = failed || snapshot?.availability !== 'available' || permission !== 'granted' || pending.includes(record.provider);
    const expired = !Number.isFinite(record.validUntil) || record.validUntil <= now;
    if (!unavailable && !expired) return record;
    return { ...record, state: 'unknown' as const, attention: undefined, unknownReason: unavailable ? 'unavailable' as const : 'expired' as const };
  }).sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
}

export const needsAttention = (record: WebActivityObservation) => record.state === 'attention' && Boolean(record.attention && !record.attention.acknowledged);
const priority = (record: WebActivityObservation) => needsAttention(record) ? 0 : record.state === 'working' ? 1 : record.state === 'attention' ? 2 : record.state === 'idle' ? 3 : 4;
