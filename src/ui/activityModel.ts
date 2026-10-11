import { activityLabelSchema, type WebActivityObservation, type WebActivitySnapshot } from '../shared/activity';
import { WEB_PROVIDERS, type WebDiscovery, type WebProvider } from '../shared/web';

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

const position = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
/** Row heading. The user's label comes first, with the provider kept as secondary text ("Revue contrat — Claude");
 * otherwise the worker's stable per-provider number ("Claude · session 3"), never recomputed here. A missing or malformed
 * number is left out rather than guessed. `session` is always the numbered form, which names the row's rename field.
 * The label is plain text: callers render it as a text node only. */
export function sessionHeading(record: Pick<WebActivityObservation, 'provider' | 'sessionNumber' | 'label'>): { text: string; session: string; provider: string; label?: string } {
  const provider = WEB_PROVIDERS.find(item => item.id === record.provider)?.name ?? String(record.provider);
  const session = Number.isSafeInteger(record.sessionNumber) && record.sessionNumber > 0 ? `${provider} · session ${record.sessionNumber}` : `${provider} · session`;
  if (typeof record.label === 'string' && record.label.trim()) return { text: `${record.label} — ${provider}`, session, provider, label: record.label };
  return { text: session, session, provider };
}
/** The worker names only live observations (current, with unexpired evidence), as for focus and seen. A row the panel
 * downgraded (expired, or unavailable while access or the snapshot is uncertain) cannot be named; a live row whose page
 * shows no recognized signal can. */
export const canLabel = (record: Pick<WebActivityObservation, 'validUntil' | 'unknownReason'>, now: number) => Number.isFinite(record.validUntil) && record.validUntil > now && record.unknownReason !== 'unavailable' && record.unknownReason !== 'expired';
/** "Onglet 4 · autre fenêtre" / "Tab 4 · other window": Chrome's 0-based index shown 1-based. The window part appears only
 * when the panel's own window is known and differs. Undefined when there is nothing reliable to say. */
export function sessionPlace(record: Pick<WebActivityObservation, 'tabIndex' | 'windowId'>, panelWindowId: number | undefined, en: boolean): string | undefined {
  const tab = position(record.tabIndex) ? `${en ? 'Tab' : 'Onglet'}\u00a0${record.tabIndex + 1}` : undefined;
  const elsewhere = position(panelWindowId) && position(record.windowId) && record.windowId !== panelWindowId;
  if (!elsewhere) return tab;
  return tab ? `${tab} · ${en ? 'other window' : 'autre fenêtre'}` : en ? 'Other window' : 'Autre fenêtre';
}
/** What a rename sends: the trimmed label, null to clear it (empty or blank), or undefined when the worker would refuse it
 * (control or bidi override characters, more than ACTIVITY_LABEL_MAX characters after trimming). */
export function labelChange(draft: string): string | null | undefined {
  if (!draft.trim()) return null;
  const parsed = activityLabelSchema.safeParse(draft);
  return parsed.success ? parsed.data : undefined;
}
