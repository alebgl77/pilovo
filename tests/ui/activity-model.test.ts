import { describe, expect, it } from 'vitest';
import type { WebActivityObservation, WebActivitySnapshot } from '../../src/shared/activity';
import { currentObservations, ELAPSED_TICK, formatElapsed, needsAttention, nextElapsedTick, shortcutLabel, stateElapsed } from '../../src/ui/activityModel';
import { emptyWebDiscovery } from '../../src/shared/web';

const record = (patch: Partial<WebActivityObservation> = {}): WebActivityObservation => ({ id: 'session-a', provider: 'claude-web', tabId: 12, windowId: 1, state: 'attention', attention: { id: 'event-a', reason: 'response_ready', acknowledged: false, raisedAt: 900 }, provenance: 'observed_ui', observedAt: 1000, validUntil: 2000, stateSince: 900, ...patch });
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

describe('ephemeral elapsed durations', () => {
  const second = 1000, minute = 60 * second, nb = '\u00a0';
  it('formats minute precision in French and English at each boundary', () => {
    const cases: [number, string, string][] = [
      [0, 'moins d’une minute', 'under a minute'], [59 * second, 'moins d’une minute', 'under a minute'], [59_999, 'moins d’une minute', 'under a minute'],
      [60 * second, `1${nb}min`, `1${nb}min`], [4 * minute + 59 * second, `4${nb}min`, `4${nb}min`], [59 * minute, `59${nb}min`, `59${nb}min`],
      [60 * minute, `1${nb}h${nb}00`, `1${nb}h${nb}00${nb}min`], [61 * minute, `1${nb}h${nb}01`, `1${nb}h${nb}01${nb}min`],
      [65 * minute + 30 * second, `1${nb}h${nb}05`, `1${nb}h${nb}05${nb}min`], [25 * 60 * minute + 9 * minute, `25${nb}h${nb}09`, `25${nb}h${nb}09${nb}min`],
    ];
    for (const [elapsed, fr, en] of cases) { expect(formatElapsed(elapsed, false), String(elapsed)).toBe(fr); expect(formatElapsed(elapsed, true), String(elapsed)).toBe(en); }
  });
  it('renders nothing for negative, non-finite or missing values', () => {
    for (const value of [-1, -minute, NaN, Infinity, -Infinity, undefined]) for (const en of [true, false]) expect(formatElapsed(value, en)).toBeUndefined();
  });
  it('times working and attention rows, seen or not, from stateSince only', () => {
    expect(stateElapsed(record({ state: 'working', attention: undefined, stateSince: 400 }), 1000)).toBe(600);
    expect(stateElapsed(record({ stateSince: 100 }), 1000)).toBe(900);
    expect(stateElapsed(record({ stateSince: 100, attention: { id: 'event-a', reason: 'error_visible', acknowledged: true, raisedAt: 100 } }), 1000)).toBe(900);
    for (const state of ['idle', 'unknown'] as const) expect(stateElapsed(record({ state, attention: undefined, stateSince: 100 }), 1000)).toBeUndefined();
    // Clock skew between contexts or a malformed value hides the duration instead of showing a wrong one.
    expect(stateElapsed(record({ stateSince: 1001 }), 1000)).toBeUndefined();
    expect(stateElapsed(record({ stateSince: NaN }), 1000)).toBeUndefined();
    expect(stateElapsed({ ...record(), stateSince: undefined } as unknown as WebActivityObservation, 1000)).toBeUndefined();
    // The panel receives JSON: NaN and ±Infinity arrive as null, which arithmetic would coerce to 0; a string would coerce too.
    for (const stateSince of [NaN, Infinity, -Infinity]) {
      const wire = JSON.parse(JSON.stringify(record({ state: 'working', attention: undefined, stateSince }))) as WebActivityObservation;
      expect(wire.stateSince).toBeNull(); expect(stateElapsed(wire, 1000)).toBeUndefined(); expect(nextElapsedTick([wire], 1000)).toBeUndefined();
    }
    expect(stateElapsed({ ...record(), stateSince: '100' } as unknown as WebActivityObservation, 1000)).toBeUndefined();
    expect(stateElapsed(record({ stateSince: 100 }), NaN)).toBeUndefined();
  });
  it('wakes for the nearest minute boundary, at most every 15 s, and only while a duration is shown', () => {
    const at = (stateSince: number, state: WebActivityObservation['state'] = 'working') => record({ state, attention: state === 'attention' ? record().attention : undefined, stateSince });
    const now = 10 * minute;
    expect(nextElapsedTick([at(now - 59 * second)], now)).toBe(1001);
    expect(nextElapsedTick([at(now - 30 * second), at(now - 3 * minute - 50 * second, 'attention')], now)).toBe(10 * second + 1);
    expect(nextElapsedTick([at(now)], now)).toBe(ELAPSED_TICK); expect(nextElapsedTick([at(now - 44 * second)], now)).toBe(ELAPSED_TICK);
    expect(nextElapsedTick([at(now - 59_999.5)], now)).toBe(2);
    expect(nextElapsedTick([], now)).toBeUndefined();
    expect(nextElapsedTick([at(now - minute, 'idle'), at(now - minute, 'unknown'), at(now + second), at(NaN)], now)).toBeUndefined();
    // Rows downgraded by currentObservations (expired, unavailable) are unknown and stop the ticker.
    const live = record({ state: 'working', attention: undefined, stateSince: 500, validUntil: 2000 });
    expect(nextElapsedTick(currentObservations(snapshot([live]), emptyWebDiscovery('granted'), 1000, false), 1000)).toBeDefined();
    expect(nextElapsedTick(currentObservations(snapshot([live]), emptyWebDiscovery('granted'), 2000, false), 2000)).toBeUndefined();
  });
});
