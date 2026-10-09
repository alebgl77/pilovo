import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Check, ChevronRight, Folder, History, FilePenLine, Plus, Search, Settings2, SlidersHorizontal, X } from 'lucide-react';
import { client } from '../platform/client';
import type { HubClient, Mission, Snapshot, TaskRun } from '../shared/types';
import { ActionDialog, EmptyState, FirstSteps, SourceIcon, Status, type ActionRunner, type DialogRequest } from './components';
import { errorMessage, executions, formatDate, translator, type MessageKey } from './i18n';
import { attentionReason, emptyFilters, filterTasks, sourceName, type Filters, type Route } from './model';
import { SettingsPage, TaskDetail } from './pages';
import { WebPreparations } from './WebPreparations';
import { WebActivity } from './WebActivity';

export function App({ api = client }: { api?: HubClient }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [route, setRoute] = useState<Route>('activity');
  const [selected, setSelected] = useState<string | null>(null);
  const [createPreparationRequest, setCreatePreparationRequest] = useState(0);
  const [filters, setFilters] = useState<Filters>({ ...emptyFilters });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false), requestId = useRef(0), mounted = useRef(true);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedTrigger = useRef<HTMLElement | null>(null);
  const language = snapshot?.settings.language || 'fr';
  const t = translator(language);
  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    try { const next = await api.getSnapshot(); if (mounted.current && request === requestId.current) { setSnapshot(next); setLoadError(null); } }
    catch (error) { if (mounted.current && request === requestId.current) setLoadError(error); }
  }, [api]);
  useEffect(() => { mounted.current = true; void refresh(); const unsubscribe = api.subscribe(() => { void refresh(); }); const focus = () => { void refresh(); }; window.addEventListener('focus', focus); return () => { mounted.current = false; requestId.current++; unsubscribe(); window.removeEventListener('focus', focus); }; }, [api, refresh]);
  useEffect(() => {
    document.documentElement.lang = language;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { document.documentElement.dataset.theme = snapshot?.settings.theme === 'system' ? media.matches ? 'dark' : 'light' : snapshot?.settings.theme || 'light'; };
    update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, [language, snapshot?.settings.theme]);
  useEffect(() => { if (selected && snapshot && !snapshot.tasks.some(task => task.key === selected)) setSelected(null); }, [snapshot, selected]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (dialog || target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) { if (searchRef.current) { event.preventDefault(); searchRef.current.focus(); } }
      if (event.key === 'Escape') { setSelected(null); requestAnimationFrame(() => selectedTrigger.current?.isConnected && selectedTrigger.current.focus()); }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [dialog]);
  const run: ActionRunner = async (action, success) => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setFeedback(null);
    try { await action(); await refresh(); if (mounted.current && success) setFeedback({ text: t(success), error: false }); return true; }
    catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'preparation.conflict') await refresh(); if (mounted.current) setFeedback({ text: errorMessage(error, language), error: true }); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const navigate = (next: Route) => { setCreatePreparationRequest(0); setRoute(next); setSelected(null); setFilters({ ...emptyFilters }); setFiltersOpen(false); };
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => { setFilters(current => ({ ...current, [key]: value })); setSelected(null); };
  const createMission = () => setDialog({ title: t('newMission'), kind: 'mission', submitLabel: t('save'), success: 'missionCreated', onSubmit: async title => { const mission = await api.createMission(title); setRoute('missions'); setFilters({ ...emptyFilters, mission: mission.id }); setSelected(null); } });
  const renameMission = (mission: Mission) => setDialog({ title: t('renameMission'), kind: 'mission', initialValue: mission.title, submitLabel: t('save'), success: 'missionUpdated', onSubmit: title => api.updateMission(mission.id, title) });
  const deleteMission = (mission: Mission) => setDialog({ title: `${t('deleteMission')} « ${mission.title} »`, description: t('deleteMissionText'), kind: 'deleteMission', danger: true, submitLabel: t('delete'), success: 'missionDeleted', onSubmit: async (_, deleteTasks) => { await api.deleteMission(mission.id, deleteTasks); setFilters(current => ({ ...current, mission: '' })); } });

  if (!snapshot) return <div className="loading-screen"><div className="brand-symbol"><img src="/icons/mark.svg" alt="Pilovo" width="28" height="28" /></div>{loadError ? <><h1>{t('errorTitle')}</h1><p role="alert">{errorMessage(loadError, language)}</p><button className="button primary" onClick={() => { void refresh(); }}>{t('retry')}</button></> : <><p role="status">{t('loading')}</p><div className="loading-lines" aria-hidden="true"><span /><span /><span /></div></>}</div>;

  const attentionCount = snapshot.tasks.filter(task => attentionReason(task)).length;
  const counts = { questions: snapshot.tasks.filter(task => attentionReason(task) === 'questions').length, results: snapshot.tasks.filter(task => attentionReason(task) === 'results').length, failures: snapshot.tasks.filter(task => attentionReason(task) === 'failures').length, signals: snapshot.tasks.filter(task => attentionReason(task) === 'signals').length };
  const tasks = filterTasks(snapshot.tasks, snapshot.missions, filters, route);
  const selectedTask = snapshot.tasks.find(task => task.key === selected);
  const currentMission = snapshot.missions.find(mission => mission.id === filters.mission);
  const hasFilters = Boolean(filters.query || filters.source || filters.execution || filters.since || (filters.mission && route !== 'missions'));
  const isTaskRoute = route === 'attention' || route === 'history';
  const navItems = [{ key: 'activity', icon: Activity }, { key: 'preparations', icon: FilePenLine, count: (snapshot.webPreparations || []).filter(item => item.status !== 'completed_by_user').length }, { key: 'missions', icon: Folder, count: snapshot.missions.length }, { key: 'history', icon: History }, { key: 'settings', icon: Settings2 }] as const;
  const pageTitle = ({ activity: 'activity', preparations: 'preparations', attention: 'attentionTitle', missions: 'missions', history: 'history', connections: 'connectionsTitle', settings: 'settings' } as const)[route];
  const pageSubtitle = ({ activity: 'activitySubtitle', preparations: 'preparationsSubtitle', attention: 'attentionSubtitle', missions: 'missionsSubtitle', history: 'historySubtitle', connections: 'connectionsSubtitle', settings: 'settingsSubtitle' } as const)[route];
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">{language === 'fr' ? 'Aller au contenu' : 'Skip to content'}</a>
    <aside className="rail"><div className="brand"><div className="brand-symbol"><img src="/icons/mark.svg" alt="" width="28" height="28" /></div><div><strong>Pilovo</strong><span>{t('localWorkspace')}</span></div></div>
      <nav aria-label={language === 'fr' ? 'Navigation principale' : 'Main navigation'}>{navItems.map(({ key, icon: Icon, ...item }) => <button className={`nav-item${route === key ? ' selected' : ''}`} key={key} aria-current={route === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /><span>{t(key)}</span>{'count' in item && item.count > 0 && <span className="nav-count">{item.count}</span>}</button>)}</nav>
      <div className="rail-bottom"><div className="local-caption"><span className="local-dot" />{t('localOnly')}</div></div>
    </aside>
    <main id="main-content" className="main" tabIndex={-1}>
      <header className="topbar"><div className="breadcrumb"><span>{t('localWorkspace')}</span><ChevronRight size={13} aria-hidden="true" /><strong>{t(route)}</strong></div><div className="topbar-actions"><select className="language-select" aria-label={t('language')} value={language} disabled={busy} onChange={event => { void run(() => api.updateSettings({ language: event.target.value as 'fr' | 'en' })); }}><option value="fr">FR</option><option value="en">EN</option></select>{location.pathname.endsWith('sidepanel.html') && <a className="icon-button" href="index.html" target="_blank" rel="noopener noreferrer" aria-label={t('fullView')} title={t('fullView')}><ArrowUpRight size={18} /></a>}</div></header>
      {snapshot.mode === 'preview' && <div className="preview-banner"><span>{t('preview')}</span><p>{t('previewText')}</p></div>}
      {feedback && <div className={`feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}><span>{!feedback.error && <Check size={16} aria-hidden="true" />}{feedback.text}</span><button className="icon-button" onClick={() => setFeedback(null)} aria-label={t('close')}><X size={16} /></button></div>}
      {Boolean(loadError) && <div className="feedback error" role="alert"><span>{errorMessage(loadError, language)}</span><button className="button subtle" onClick={() => { void refresh(); }}>{t('refresh')}</button></div>}
      <div className={`page-heading${selectedTask && isTaskRoute ? ' detail-selected' : ''}`}><div><h1>{t(pageTitle)}</h1><p>{t(pageSubtitle)}</p></div>{route === 'preparations' && <button className="button primary new-preparation-action" onClick={() => setCreatePreparationRequest(value => value + 1)}><Plus size={16} />{language === 'en' ? 'New preparation' : 'Nouvelle préparation'}</button>}{route === 'missions' && <button className="button primary new-mission" onClick={createMission}><Plus size={16} />{t('newMission')}</button>}</div>
        {route === 'missions' && <div className={`mission-bar${selectedTask ? ' detail-selected' : ''}`}><div className="mission-tabs" aria-label={t('missions')}><button className={!filters.mission ? 'active' : ''} onClick={() => updateFilter('mission', '')}>{t('allMissions')}</button>{snapshot.missions.map(mission => <button key={mission.id} title={mission.title} className={filters.mission === mission.id ? 'active' : ''} onClick={() => updateFilter('mission', mission.id)}><Folder size={14} /><span>{mission.title}</span><small>{(snapshot.webPreparations || []).filter(item => item.missionId === mission.id).length}</small></button>)}</div>{currentMission && <div className="mission-actions"><button className="button subtle" onClick={() => renameMission(currentMission)}>{t('rename')}</button><button className="button subtle danger-text" onClick={() => deleteMission(currentMission)}>{t('delete')}</button></div>}</div>}
      {isTaskRoute ? <>

        <div className={`task-toolbar${selectedTask ? ' detail-selected' : ''}`}><div className="search-field"><Search size={16} aria-hidden="true" /><input ref={searchRef} type="search" aria-label={t('searchHint')} placeholder={t('search')} value={filters.query} onChange={event => updateFilter('query', event.target.value)} /><kbd aria-hidden="true">/</kbd></div><button className={`icon-button filter-button${filtersOpen ? ' active' : ''}`} title={t('allStates')} aria-label={language === 'fr' ? 'Afficher les filtres' : 'Show filters'} aria-expanded={filtersOpen} aria-controls="task-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={18} />{(filters.source || filters.execution || filters.since) && <span className="filter-active" />}</button>
          {filtersOpen && <div className="filters" id="task-filters"><label>{t('source')}<select aria-label={t('source')} value={filters.source} onChange={event => updateFilter('source', event.target.value)}><option value="">{t('allSources')}</option><option value="claude-code">Claude Code</option><option value="codex">Codex</option></select></label><label>{t('execution')}<select aria-label={t('execution')} value={filters.execution} onChange={event => updateFilter('execution', event.target.value)}><option value="">{t('allStates')}</option>{executions.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><label>{t('missions')}<select aria-label={t('missions')} value={filters.mission} onChange={event => updateFilter('mission', event.target.value)}><option value="">{t('allMissions')}</option><option value="__none__">{t('noMission')}</option>{snapshot.missions.map(mission => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</select></label><label>{t('dateFrom')}<input type="date" value={filters.since} onChange={event => updateFilter('since', event.target.value)} /></label><button className="button subtle" onClick={() => { setFilters({ ...emptyFilters }); setSelected(null); }}>{t('clearFilters')}</button></div>}
        </div>
        {route === 'attention' && <div className={`attention-tabs${selectedTask ? ' detail-selected' : ''}`} role="group" aria-label={t('attention')}><button aria-pressed={filters.attention === 'all'} onClick={() => updateFilter('attention', 'all')}>{t('all')}<span>{attentionCount}</span></button>{(['questions', 'results', 'failures', 'signals'] as const).map(key => <button key={key} aria-pressed={filters.attention === key} onClick={() => updateFilter('attention', key)}>{t(key)}<span>{counts[key]}</span></button>)}</div>}
        <div className={`workspace${selectedTask ? ' has-selection' : ''}`}><section className="task-list" aria-label={t(route)}><div className="list-caption"><span>{currentMission?.title || t(route)}</span><span>{tasks.length} {t(tasks.length === 1 ? 'task' : 'tasks')}</span></div>{tasks.length ? <ul>{tasks.map(task => <TaskRow key={task.key} task={task} snapshot={snapshot} selected={task.key === selected} onSelect={() => { selectedTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelected(task.key); }} />)}</ul> : <EmptyState title={t(hasFilters ? 'noResults' : route === 'history' ? 'noHistory' : 'clearAttention')} text={t(hasFilters ? 'noResultsText' : route === 'history' ? 'noHistoryText' : 'clearAttentionText')} action={hasFilters ? <button className="button" onClick={() => setFilters({ ...emptyFilters })}>{t('clearFilters')}</button> : !snapshot.tasks.length ? <button className="button" onClick={() => navigate('preparations')}>{t('connectAgents')}<ChevronRight size={16} /></button> : undefined} />}</section>
          <section className="task-pane" aria-label={selectedTask?.title || t('details')}>{selectedTask ? <TaskDetail key={selectedTask.key} task={selectedTask} snapshot={snapshot} api={api} run={run} busy={busy} openDialog={setDialog} onBack={() => { setSelected(null); requestAnimationFrame(() => selectedTrigger.current?.isConnected && selectedTrigger.current.focus()); }} /> : snapshot.tasks.length ? <EmptyState title={t('selectTask')} text={t('selectTaskText')} /> : <FirstSteps t={t} connect={() => navigate('preparations')} />}</section>
        </div>
      </> : route === 'activity' ? <WebActivity api={api} en={language === 'en'} /> : route === 'preparations' || route === 'missions' ? <WebPreparations key={route} createRequest={createPreparationRequest} snapshot={snapshot} api={api} run={run} busy={busy} openDialog={setDialog} missionId={route === 'missions' ? filters.mission : undefined} showServices={route === 'preparations'} /> : <SettingsPage snapshot={snapshot} api={api} run={run} busy={busy} openDialog={setDialog} />}
    </main>
    {dialog && <ActionDialog key={`${dialog.title}-${dialog.initialValue || ''}`} request={dialog} dismiss={() => setDialog(null)} run={run} busy={busy} t={t} error={feedback?.error ? feedback.text : undefined} />}
  </div>;
}

function TaskRow({ task, snapshot, selected, onSelect }: { task: TaskRun; snapshot: Snapshot; selected: boolean; onSelect: () => void }) {
  const t = translator(snapshot.settings.language), reason = attentionReason(task);
  const mission = snapshot.missions.find(item => item.id === task.missionId);
  const reasonKey: MessageKey | null = reason === 'questions' ? 'waitingReason' : reason === 'results' ? 'completedReason' : reason === 'failures' ? 'failedReason' : reason === 'signals' ? 'staleReason' : null;
  return <li><button className={`task-row${selected ? ' selected' : ''}`} onClick={onSelect} aria-pressed={selected}><div className="task-row-top"><SourceIcon source={task.sourceId} size={17} /><span className="task-source">{sourceName(task.sourceId)}</span><time dateTime={task.receivedAt}>{formatDate(task.receivedAt, snapshot.settings.language, true)}</time></div><h2>{task.title}</h2><p className="task-mission"><Folder size={13} aria-hidden="true" />{mission?.title || t('noMission')}</p><div className="task-row-bottom"><span className={`reason reason-${reason || 'other'}`}>{reasonKey ? t(reasonKey) : t(task.execution)}</span>{task.connection !== 'online' && <Status value={task.connection} t={t} />}<ChevronRight className="row-chevron" size={15} aria-hidden="true" /></div></button></li>;
}
