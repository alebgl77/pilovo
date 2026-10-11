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
