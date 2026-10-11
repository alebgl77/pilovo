import { describe, expect, it } from 'vitest';
import type { WebActivityObservation, WebActivitySnapshot } from '../../src/shared/activity';
import { currentObservations, needsAttention, shortcutLabel } from '../../src/ui/activityModel';
import { emptyWebDiscovery } from '../../src/shared/web';

const record = (patch: Partial<WebActivityObservation> = {}): WebActivityObservation => ({ id: 'session-a', provider: 'claude-web', tabId: 12, windowId: 1, state: 'attention', attention: { id: 'event-a', reason: 'response_ready', acknowledged: false, raisedAt: 900 }, provenance: 'observed_ui', observedAt: 1000, validUntil: 2000, ...patch });
const snapshot = (observations = [record()]): WebActivitySnapshot => ({ availability: 'available', observedAt: 1000, observations });
describe('activity presentation invariants', () => {
  it('expires at the exact logical deadline and removes stale attention from counts', () => {
    const discovery = emptyWebDiscovery('granted');
    expect(needsAttention(currentObservations(snapshot(), discovery, 1999, false)[0])).toBe(true);
    const expired = currentObservations(snapshot(), discovery, 2000, false)[0];
    expect(expired.state).toBe('unknown'); expect(expired.unknownReason).toBe('expired'); expect(expired.attention).toBeUndefined();
    expect(snapshot().observations[0].attention).toBeDefined();
  });
  it('quarantines failed reads, missing grants, pending revocation and unavailable APIs', () => {
    expect(currentObservations(snapshot(), emptyWebDiscovery('granted'), 1000, true)[0].state).toBe('unknown');
    expect(currentObservations(snapshot(), emptyWebDiscovery('not-granted'), 1000, false)[0].state).toBe('unknown');
    expect(currentObservations(snapshot(), emptyWebDiscovery('granted'), 1000, false, ['claude-web'])[0].state).toBe('unknown');
    expect(currentObservations({ ...snapshot(), availability: 'unavailable' }, emptyWebDiscovery('granted'), 1000, false)[0].state).toBe('unknown');
    expect(currentObservations(snapshot(), null, 1000, false)[0].state).toBe('unknown');
  });
  it('orders unseen attention, working, seen, idle, unknown without treating seen as complete', () => {
    const rows = [record({ id: 'unknown', state: 'unknown', attention: undefined }), record({ id: 'idle', state: 'idle', attention: undefined }), record({ id: 'seen', attention: { id: 'event-b', reason: 'input_required', acknowledged: true, raisedAt: 100 } }), record({ id: 'working', state: 'working', attention: undefined }), record({ id: 'unseen' })];
    const ordered = currentObservations(snapshot(rows), emptyWebDiscovery('granted'), 1000, false);
    expect(ordered.map(row => row.id)).toEqual(['unseen', 'working', 'seen', 'idle', 'unknown']);
    expect(ordered.filter(needsAttention)).toHaveLength(1); expect(ordered[2].state).toBe('attention');
  });
  it('permissions are independent and invalid deadlines cannot remain live', () => {
    const discovery = emptyWebDiscovery('granted'); discovery.providers[0].permission = 'not-granted';
    const rows = currentObservations(snapshot([record({ provider: discovery.providers[0].id }), record({ id: 'other', provider: discovery.providers[1].id })]), discovery, 1000, false);
    expect(rows.find(row => row.id === 'other')?.state).toBe('attention'); expect(rows.find(row => row.id === 'session-a')?.state).toBe('unknown');
    expect(currentObservations(snapshot([record({ validUntil: NaN })]), emptyWebDiscovery('granted'), 1000, false)[0].state).toBe('unknown');
  });
  it('orders unseen attention like the next-attention command: earliest raised, then lower tab ID', () => {
    const attention = (id: string, tabId: number, raisedAt: number) => record({ id, tabId, attention: { id: `event-${id}`, reason: 'input_required', acknowledged: false, raisedAt } });
    // Alphabetical ids run opposite to tab IDs, so the final id fallback cannot produce the expected tie order.
    const rows = [attention('a-late', 1, 950), record({ id: 'working', state: 'working', attention: undefined }), attention('a-tie-high', 9, 500), attention('z-tie-low', 3, 500)];
    expect(currentObservations(snapshot(rows), emptyWebDiscovery('granted'), 1000, false).map(row => row.id)).toEqual(['z-tie-low', 'a-tie-high', 'a-late', 'working']);
  });
  it('shows the configured shortcut, labelling Shift as Maj in French only', () => {
    expect(shortcutLabel('Alt+Shift+J', true)).toBe('Alt+Shift+J'); expect(shortcutLabel('Alt+Shift+J', false)).toBe('Alt+Maj+J');
    expect(shortcutLabel('Ctrl+Shift+Y', false)).toBe('Ctrl+Maj+Y'); expect(shortcutLabel('⌥⇧J', false)).toBe('⌥⇧J');
  });
});
