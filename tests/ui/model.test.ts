import { describe, expect, it } from 'vitest';
import type { TaskRun } from '../../src/shared/types';
import { attentionReason, emptyFilters, filterTasks, observedDuration } from '../../src/ui/model';
import { errorMessage, formatDate } from '../../src/ui/i18n';

function task(patch: Partial<TaskRun> = {}): TaskRun {
  return { key: 'codex:task:run', sourceId: 'codex', taskId: 'task', runId: 'run', title: 'A real task', execution: 'running', connection: 'online', lastEventAt: '2026-10-09T10:01:00Z', receivedAt: '2026-10-09T10:01:00Z', startedAt: '2026-10-09T10:00:00Z', createdAt: '2026-10-09T10:00:00Z', lastSequence: 2, eventCount: 2, gaps: 0, uncertainty: false, verification: { status: 'unverified' }, review: { status: 'pending' }, artifacts: [], provenance: { status: 'agent_reported', metadata: 'agent_reported', connection: 'hub_observed' }, associationHistory: [], verificationChecks: [], ...patch };
}
describe('attention reflects unresolved work, not connection status', () => {
  it('flags disconnected active work for confirmation without declaring failure', () => { const input = task({ connection: 'disconnected' }); expect(attentionReason(input)).toBe('signals'); expect(input.execution).toBe('running'); });
  it('flags stale or uncertain nonterminal work but never requeues an accepted offline receipt', () => {
    expect(attentionReason(task({ connection: 'stale' }))).toBe('signals');
    expect(attentionReason(task({ uncertainty: true }))).toBe('signals');
    expect(attentionReason(task({ execution: 'paused', connection: 'disconnected' }))).toBe('signals');
    expect(attentionReason(task({ execution: 'completed', connection: 'disconnected', uncertainty: true, review: { status: 'accepted' } }))).toBeNull();
    expect(attentionReason(task({ execution: 'cancelled', connection: 'disconnected' }))).toBeNull();
  });
  it('keeps an unanswered question open after a human review', () => { expect(attentionReason(task({ execution: 'waiting_input', review: { status: 'accepted' } }))).toBe('questions'); });
  it('removes accepted and rejected completed results from attention, keeps history', () => {
    for (const status of ['accepted', 'rejected'] as const) { const item = task({ execution: 'completed', review: { status } }); expect(attentionReason(item)).toBeNull(); expect(filterTasks([item], [], emptyFilters, 'history')).toHaveLength(1); expect(item.verification.status).toBe('unverified'); }
  });
  it('puts questions before failures and reviewable completions regardless of dates', () => {
    const result = task({ key: 'result', execution: 'completed' }), failure = task({ key: 'failure', execution: 'failed' }), question = task({ key: 'question', execution: 'waiting_input' });
    expect(filterTasks([result, failure, question], [], emptyFilters, 'attention').map(t => t.key)).toEqual(['question', 'failure', 'result']);
  });
});
describe('history search and combined filters', () => {
  const mission = { id: 'mission1', title: 'Release Alpha', createdAt: '2026-10-08T00:00:00Z', taskKeys: ['one'] };
  const input = [task({ key: 'one', missionId: mission.id, summary: 'Result with café', execution: 'completed' }), task({ key: 'two', sourceId: 'claude-code', title: 'Unrelated', createdAt: '2026-10-07T00:00:00Z' })];
  it('searches mission and result text without changing task identity', () => {
    expect(filterTasks(input, [mission], { ...emptyFilters, query: 'ALPHA' }, 'history').map(t => t.key)).toEqual(['one']);
    expect(filterTasks(input, [mission], { ...emptyFilters, query: 'CAFÉ' }, 'history').map(t => t.key)).toEqual(['one']);
  });
  it('combines source, state, date and mission conditions', () => { expect(filterTasks(input, [mission], { ...emptyFilters, source: 'codex', execution: 'completed', mission: 'mission1', since: '2026-10-08' }, 'history').map(t => t.key)).toEqual(['one']); });
  it('distinguishes all missions from unassigned tasks', () => { expect(filterTasks(input, [mission], { ...emptyFilters, mission: '__none__' }, 'history').map(t => t.key)).toEqual(['two']); });
  it('never matches deleted tasks retained only by a mission task key', () => { expect(filterTasks([], [mission], { ...emptyFilters, query: 'Alpha' }, 'history')).toEqual([]); });
  it('does not collapse identical titles from independent sources', () => { const other = task({ key: 'claude-code:task:run', sourceId: 'claude-code' }); expect(filterTasks([task(), other], [], emptyFilters, 'history')).toHaveLength(2); });
});
describe('duration uses source timestamps with explicit uncertainty', () => {
  it('uses last known event, never wall time, for an unfinished task', () => { expect(observedDuration(task())).toEqual({ seconds: 60, partial: true }); });
  it('marks complete duration partial when events are missing or uncertain', () => { expect(observedDuration(task({ endedAt: '2026-10-09T10:02:00Z', gaps: 1 }))).toEqual({ seconds: 120, partial: true }); expect(observedDuration(task({ endedAt: '2026-10-09T10:02:00Z', uncertainty: true }))?.partial).toBe(true); });
  it('returns no duration for missing, invalid or inverted clocks', () => { expect(observedDuration(task({ startedAt: undefined }))).toBeNull(); expect(observedDuration(task({ startedAt: 'invalid' }))).toBeNull(); expect(observedDuration(task({ endedAt: '2026-10-09T09:00:00Z' }))).toBeNull(); });
  it('does not subtract pauses or disconnections from a completed duration', () => { expect(observedDuration(task({ execution: 'completed', connection: 'disconnected', endedAt: '2026-10-09T10:02:00Z' }))).toEqual({ seconds: 120, partial: false }); });
});
describe('error and missing-data presentation', () => {
  it('does not display arbitrary exception messages or HTML', () => { expect(errorMessage(new Error('<script>secret</script>'), 'en')).not.toContain('secret'); expect(errorMessage({ code: '__proto__', message: 'secret' }, 'en')).not.toContain('secret'); });
  it('has distinct actionable localizations for revoked permission and changed context', () => { expect(errorMessage({ code: 'permission.denied' }, 'en')).toContain('Permission'); expect(errorMessage({ code: 'navigation.changed' }, 'fr')).toContain('contexte'); });
  it('does not render invalid dates as facts', () => { expect(formatDate('invalid', 'en')).toBe('Not provided by the connector'); });
});
