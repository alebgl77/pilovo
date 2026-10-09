import type { Mission, TaskRun } from '../shared/types';
export type Route = 'activity' | 'preparations' | 'attention' | 'missions' | 'history' | 'connections' | 'settings';
export type AttentionFilter = 'all' | 'questions' | 'results' | 'failures' | 'signals';
export interface Filters { query: string; source: string; execution: string; mission: string; since: string; attention: AttentionFilter }
export const emptyFilters: Filters = { query: '', source: '', execution: '', mission: '', since: '', attention: 'all' };
export function attentionReason(task: TaskRun): Exclude<AttentionFilter, 'all'> | null {
  if (task.execution === 'waiting_input') return 'questions';
  if (task.execution === 'failed' && task.review.status === 'pending') return 'failures';
  if (task.execution === 'completed' && task.review.status === 'pending') return 'results';
  if ((task.execution === 'running' || task.execution === 'paused') && (task.connection !== 'online' || task.uncertainty)) return 'signals';
  return null;
}
export function filterTasks(tasks: TaskRun[], missions: Mission[], filters: Filters, route: Route): TaskRun[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const boundary = filters.since ? new Date(`${filters.since}T00:00:00`).getTime() : null;
  return tasks.filter(task => {
    const reason = attentionReason(task);
    if (route === 'attention' && (!reason || (filters.attention !== 'all' && reason !== filters.attention))) return false;
    if (filters.source && task.sourceId !== filters.source) return false;
    if (filters.execution && task.execution !== filters.execution) return false;
    if (filters.mission === '__none__' && task.missionId) return false;
    if (filters.mission && filters.mission !== '__none__' && task.missionId !== filters.mission) return false;
    if (boundary !== null && Number.isFinite(boundary) && Date.parse(task.createdAt) < boundary) return false;
    const mission = missions.find(item => item.id === task.missionId)?.title || '';
    return !query || `${task.title} ${task.summary || ''} ${task.question || ''} ${task.sourceId} ${mission}`.toLocaleLowerCase().includes(query);
  }).sort((a, b) => {
    const priority = { questions: 0, failures: 1, signals: 2, results: 3 };
    if (route === 'attention') {
      const delta = priority[attentionReason(a)!] - priority[attentionReason(b)!];
      if (delta) return delta;
    }
    return Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || a.key.localeCompare(b.key);
  });
}
export function sourceName(id: TaskRun['sourceId']): string { return id === 'claude-code' ? 'Claude Code' : 'Codex'; }
export function observedDuration(task: TaskRun): { seconds: number; partial: boolean } | null {
  if (!task.startedAt) return null;
  const start = Date.parse(task.startedAt), end = Date.parse(task.endedAt || task.lastEventAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { seconds: Math.round((end - start) / 1000), partial: !task.endedAt || task.uncertainty || task.gaps > 0 };
}
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}
