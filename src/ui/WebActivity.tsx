import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, Circle, CircleAlert, Eye, LoaderCircle, Pencil, RefreshCw, Unplug } from 'lucide-react';
import { ACTIVITY_LABEL_MAX, monotonicEpoch, type ActivityShortcuts, type WebActivityObservation, type WebActivitySnapshot } from '../shared/activity';
import type { HubClient } from '../shared/types';
import { canLabel, currentObservations, formatElapsed, labelChange, needsAttention, nextElapsedTick, sessionHeading, sessionPlace, shortcutLabel, stateElapsed } from './activityModel';
import { ProviderConnections, useWebServices } from './WebServices';
import { useObservedResource } from './useObservedResource';

export function WebActivity({ api, en, autoSeen = 0 }: { api: HubClient; en: boolean; autoSeen?: number }) {
  const read = useCallback(() => api.getWebActivity?.() || Promise.resolve<WebActivitySnapshot>({ availability: 'unavailable', observations: [], observedAt: Date.now() }), [api]);
  const readShortcuts = useCallback(() => api.getShortcuts?.() || Promise.resolve<ActivityShortcuts>({}), [api]);
  const readWindow = useCallback(() => api.getCurrentWindowId?.() || Promise.resolve(undefined), [api]);
  const activity = useObservedResource(api, read), service = useWebServices(api), shortcuts = useObservedResource(api, readShortcuts), panel = useObservedResource(api, readWindow);
  const [, tick] = useState(0);
  const now = monotonicEpoch();
  const rows = currentObservations(activity.data, service.data, now, activity.error || service.error, service.pending);
  // The window showing this panel or page; unknown (preview, failed read) omits the "other window" mention.
  const panelWindow = panel.error ? undefined : panel.data ?? undefined;
  const attentionIds = rows.filter(needsAttention).map(row => row.attention!.id), attention = attentionIds.length, working = rows.filter(row => row.state === 'working').length;
  // Unassigned (blank), unreadable or preview shortcuts hide the hint rather than suggesting a key that does nothing.
  const nextShortcut = shortcuts.error ? undefined : shortcuts.data?.['focus-next-attention'];
  const unknown = rows.filter(row => row.state === 'unknown').length;
  const granted = service.data?.providers.some(provider => provider.permission === 'granted') && !service.error;
  const loading = activity.loading || service.loading;
  const unavailable = activity.data?.availability === 'unavailable';
  useEffect(() => {
    // Expire locally even if the worker hangs, never emits, or the wall clock changes.
    const now = monotonicEpoch();
    const deadlines = (activity.data?.observations || []).map(record => record.validUntil).filter(value => Number.isFinite(value) && value > now);
    if (!deadlines.length) return;
    const timer = window.setTimeout(() => tick(value => value + 1), Math.max(1, Math.min(...deadlines) - now + 1));
    return () => window.clearTimeout(timer);
  });
  useEffect(() => {
    // Shown durations change at minute boundaries: re-render for the nearest one (at most every 15 s), only while one is shown.
    // Re-rendering keeps the same nodes, so keyboard focus stays put; the text is never announced.
    const wait = loading ? undefined : nextElapsedTick(rows, monotonicEpoch());
    if (wait === undefined) return;
    const timer = window.setTimeout(() => tick(value => value + 1), wait);
    return () => window.clearTimeout(timer);
  });
  const refresh = () => { void activity.refresh(); void service.refresh(); };
  const [bulk, setBulk] = useState<'pending' | 'error' | null>(null);
  const bulkLock = useRef(false), mounted = useRef(false), bulkButton = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  // Mark all goes once fewer than two items are left to review, also when they are seen elsewhere (automatic seen, the
  // keyboard command, another panel): if it had focus, the first row action takes it rather than the page. While mark all
  // itself is saving, the check waits for it to end, as it restores focus too.
  const bulkFocusLost = useRef(false), bulkRef = useFocusLoss(bulkButton, bulkFocusLost);
  useEffect(() => { if (!bulkLock.current && takeLostFocus(bulkFocusLost)) list.current?.querySelector<HTMLButtonElement>('.activity-row-actions button:not(:disabled)')?.focus({ preventScroll: true }); });
  const attentionKey = attentionIds.join(' '), latestKey = useRef(attentionKey);
  latestKey.current = attentionKey;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setBulk(state => state === 'error' ? null : state); }, [attentionKey]);
  const markAll = async () => {
    if (bulkLock.current || attentionIds.length < 2 || !api.acknowledgeAllWebActivity) return;
    // Only the identities shown now: an attention raised after this render stays to review.
    const ids = attentionIds, key = attentionKey, restoreFocus = document.activeElement === bulkButton.current;
    bulkLock.current = true; setBulk('pending');
    let failed = false;
    try {
      await api.acknowledgeAllWebActivity(ids);
      // Confirmation comes from a new snapshot, never from an optimistic mutation.
      if (mounted.current) await activity.refresh();
    } catch { failed = true; }
    finally {
      bulkLock.current = false;
      if (mounted.current) {
        setBulk(failed && latestKey.current === key ? 'error' : null);
        if (restoreFocus) requestAnimationFrame(() => { if (mounted.current) (bulkButton.current || list.current?.querySelector<HTMLButtonElement>('.activity-row-actions button:not(:disabled)'))?.focus({ preventScroll: true }); });
      }
    }
  };
  return <div className="page-scroll activity-page">
    <div className="activity-toolbar"><p>{en ? 'Your open sessions, at a glance.' : 'Vos sessions ouvertes, en un regard.'}</p><button className="button subtle" onClick={refresh} aria-label={en ? 'Refresh activity' : 'Actualiser l’activité'}><RefreshCw size={15} aria-hidden="true" />{en ? 'Refresh' : 'Actualiser'}</button></div>
    {activity.error && <div className="activity-notice error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{en ? 'Activity could not be refreshed. Previous observations are unconfirmed; open the service to check.' : 'L’activité n’a pas pu être actualisée. Les observations précédentes ne sont plus confirmées ; ouvrez le service pour vérifier.'}</p></div>}
    {loading ? <div className="activity-empty" role="status"><Eye size={23} strokeWidth={1.5} aria-hidden="true" /><h2>{en ? 'Checking open sessions…' : 'Recherche des sessions ouvertes…'}</h2><p>{en ? 'Pilovo checks the services you have connected.' : 'Pilovo vérifie les services que vous avez connectés.'}</p></div> : rows.length ? <>
      <div className="activity-overview">
        <dl className="activity-summary" aria-label={en ? 'Current observations' : 'Observations actuelles'}>
          <div><dt>{en ? 'To review' : 'À vérifier'}</dt><dd>{attention}</dd></div><div><dt>{en ? 'Working' : 'En cours'}</dt><dd>{working}</dd></div><div><dt>{en ? 'Unconfirmed' : 'Non confirmées'}</dt><dd>{unknown}</dd></div>
        </dl>
        {(attention >= 2 || nextShortcut) && <div className="activity-bulk">
          {attention >= 2 && <button ref={bulkRef} className="button" disabled={bulk === 'pending' || !api.acknowledgeAllWebActivity} onClick={() => { void markAll(); }}>{bulk === 'pending' ? en ? 'Saving…' : 'Enregistrement…' : en ? 'Mark all as seen' : 'Tout marquer comme vu'}</button>}
          {nextShortcut && <p className="activity-shortcut">{en ? 'Next item to review:' : 'Prochain élément à vérifier :'} <kbd>{shortcutLabel(nextShortcut, en)}</kbd></p>}
        </div>}
      </div>
      {bulk === 'error' && <p className="activity-bulk-error" role="alert">{en ? 'These signals could not be marked as seen. They may have changed; refresh activity.' : 'Ces signaux n’ont pas pu être marqués comme vus. Ils ont peut-être changé ; actualisez l’activité.'}</p>}
      <section className="activity-sessions" aria-labelledby="sessions-heading"><div className="activity-list-heading"><h2 id="sessions-heading">{en ? 'Sessions' : 'Sessions'}</h2><span>{en ? 'Attention first' : 'Votre attention d’abord'}</span></div>
        {/* Keyed by tab, not by observation: navigation in a tab replaces its observation but keeps the row, its focus and an open rename. */}
        <ul ref={list} className="activity-list">{rows.map(record => <ActivityRow key={`${record.provider}:${record.tabId}`} record={record} panelWindow={panelWindow} now={now} api={api} en={en} refresh={activity.refresh} />)}</ul>
      </section>
      <p className="activity-semantics">{en ? '“Response available” means generation has ended. Review the answer in the service; your task may still need work.' : '« Réponse disponible » signifie que la génération s’est arrêtée. Vérifiez la réponse dans le service ; votre tâche peut encore demander du travail.'}{autoSeen > 0 && (en ? ` Items are marked as seen after ${autoSeen}\u00a0s on their tab, in the focused window.` : ` Une attention est marquée comme vue après ${autoSeen}\u00a0s sur son onglet, fenêtre active.`)}</p>
    </> : <div className="activity-empty">
      <Eye size={25} strokeWidth={1.5} aria-hidden="true" />
      <h2>{unavailable ? en ? 'Observation requires the extension' : 'L’observation nécessite l’extension' : granted ? en ? 'No session observed yet' : 'Aucune session observée pour l’instant' : en ? 'Connect your first service' : 'Connectez votre premier service'}</h2>
      <p>{unavailable ? en ? 'Open Pilovo in the Chrome extension to observe Claude and ChatGPT. You can prepare prompts here.' : 'Ouvrez Pilovo dans l’extension Chrome pour observer Claude et ChatGPT. Vous pouvez préparer vos consignes ici.' : granted ? en ? 'Open an existing Claude or ChatGPT tab, or open the connected service below. An active page provides the first observation.' : 'Ouvrez un onglet Claude ou ChatGPT existant, ou ouvrez le service connecté ci-dessous. Une page active fournit la première observation.' : en ? 'Connect Claude or ChatGPT below, then open an existing tab. Pilovo will show when a session is working or needs your attention.' : 'Connectez Claude ou ChatGPT ci-dessous, puis ouvrez un onglet existant. Pilovo indiquera les sessions en cours ou à vérifier.'}</p>
    </div>}
    <ProviderConnections api={api} en={en} service={service} />
  </div>;
}

function reasonText(record: WebActivityObservation, en: boolean) {
  if (record.state === 'unknown') return ({
    expired: en ? 'The last observation expired. Activate the page to check again.' : 'La dernière observation a expiré. Activez la page pour vérifier à nouveau.',
    navigation: en ? 'The page changed. Waiting for a new observation.' : 'La page a changé. Une nouvelle observation est attendue.',
    unavailable: en ? 'The current state cannot be confirmed.' : 'L’état actuel ne peut pas être confirmé.',
    no_evidence: en ? 'This page does not expose a supported activity signal.' : 'Cette page ne présente pas de signal d’activité reconnu.',
  })[record.unknownReason || 'no_evidence'];
  if (record.state === 'working') return en ? 'A response is being generated in the page.' : 'Une réponse est en cours de génération dans la page.';
  if (record.state === 'idle') return en ? 'The page is ready for your next message.' : 'La page est prête pour votre prochain message.';
  return ({ response_ready: en ? 'Response available' : 'Réponse disponible', input_required: en ? 'Your input is requested' : 'Une intervention est demandée', error_visible: en ? 'An error is visible in the page' : 'Une erreur est visible dans la page' })[record.attention?.reason || 'response_ready'];
}

/** Ephemeral, derived in the panel only; nothing for idle/unknown rows or an unusable clock reading. Seen attention keeps its duration. */
function elapsedText(record: WebActivityObservation, now: number, en: boolean) {
  const value = formatElapsed(stateElapsed(record, now), en);
  if (!value) return undefined;
  if (record.state === 'working') return en ? `Working for ${value}` : `En cours depuis ${value}`;
  return ({ response_ready: en ? `Available for ${value}` : `Réponse disponible depuis ${value}`, input_required: en ? `Input requested for ${value}` : `Intervention demandée depuis ${value}`, error_visible: en ? `Error visible for ${value}` : `Erreur visible depuis ${value}` })[record.attention?.reason || 'response_ready'];
}

/** A ref for a control that can disappear under keyboard focus. Its cleanup runs while the control is still in the page,
 * so it can tell whether the control held focus when it went; the browser then leaves focus on the page itself. */
function useFocusLoss(target: { current: HTMLButtonElement | null }, lost: { current: boolean }) {
  return useCallback((node: HTMLButtonElement | null) => { target.current = node; return () => { if (node && document.activeElement === node) lost.current = true; target.current = null; }; }, [target, lost]);
}
/** After the commit that removed such a control: true once, when focus is left on the page (and nothing else took it). */
function takeLostFocus(lost: { current: boolean }) {
  if (!lost.current) return false;
  lost.current = false;
  return !document.activeElement || document.activeElement === document.body;
}

function ActivityRow({ record, panelWindow, now, api, en, refresh }: { record: WebActivityObservation; panelWindow?: number; now: number; api: HubClient; en: boolean; refresh: () => Promise<void> }) {
  const [pending, setPending] = useState<'focus' | 'ack' | null>(null), [error, setError] = useState<'focus' | 'ack' | null>(null);
  const lock = useRef(false), mounted = useRef(false), event = useRef(`${record.id} ${record.attention?.id}`);
  const openButton = useRef<HTMLButtonElement>(null), seenButton = useRef<HTMLButtonElement>(null), latest = useRef(record), item = useRef<HTMLLIElement>(null);
  latest.current = record;
  // The seen button goes once the attention is seen, also elsewhere (automatic seen, the keyboard command, another panel):
  // if it had focus, the open button takes it, or the rename button, which stays focusable, when the row has lapsed. While
  // the row's own action runs, the check waits for it to end (its buttons are disabled meanwhile).
  const seenFocusLost = useRef(false), seenRef = useFocusLoss(seenButton, seenFocusLost);
  useEffect(() => { if (!lock.current && takeLostFocus(seenFocusLost)) (openButton.current?.disabled ? item.current?.querySelector<HTMLButtonElement>('.activity-rename') : openButton.current)?.focus({ preventScroll: true }); });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // A new observation (navigation in the tab) or attention identity clears action errors raised for the previous one.
  useEffect(() => { const key = `${record.id} ${record.attention?.id}`; if (event.current !== key) { setError(null); event.current = key; } }, [record.id, record.attention?.id]);
  const action = async (kind: 'focus' | 'ack') => {
    if (lock.current || record.state === 'unknown' || record.validUntil <= monotonicEpoch()) return;
    const id = record.id, attentionId = record.attention?.id;
    if (kind === 'ack' && (!attentionId || record.attention?.acknowledged)) return;
    lock.current = true; setPending(kind); setError(null);
    const restoreFocus = kind === 'ack' && document.activeElement === seenButton.current;
    try {
      if (kind === 'focus') await api.focusWebActivity!(id);
      else await api.acknowledgeWebActivity!(id, attentionId!);
      // Confirmation always comes from a new snapshot, never from an optimistic mutation.
      if (mounted.current) await refresh();
    } catch { if (mounted.current && (kind === 'focus' ? latest.current.id === id : latest.current.attention?.id === attentionId)) setError(kind); }
    finally { lock.current = false; if (mounted.current) { setPending(null); if (restoreFocus) requestAnimationFrame(() => { if (mounted.current && latest.current.attention?.id === attentionId && latest.current.attention?.acknowledged) openButton.current?.focus({ preventScroll: true }); }); } }
  };
  const state = record.state, seen = state === 'attention' && record.attention?.acknowledged;
  const Icon = state === 'working' ? LoaderCircle : state === 'unknown' ? Unplug : state === 'attention' ? seen ? Check : CircleAlert : Circle;
  const label = ({ unknown: en ? 'Observation interrupted' : 'Observation interrompue', idle: en ? 'Waiting' : 'En attente', working: en ? 'Working' : 'En cours', attention: seen ? en ? 'Seen' : 'Vu' : en ? 'To review' : 'À vérifier' })[state];
  const observed = new Date(record.observedAt), elapsed = elapsedText(record, now, en);
  const dateValid = Number.isFinite(observed.getTime());
  const heading = sessionHeading(record), place = sessionPlace(record, panelWindow, en);
  return <li ref={item} className={`activity-row activity-${state}${needsAttention(record) ? ' needs-attention' : ''}`} data-activity-id={record.id}>
    <div className="activity-state"><Icon size={17} aria-hidden="true" /><span>{label}</span></div>
    <div className="activity-row-content"><SessionName record={record} heading={heading} live={canLabel(record, now)} api={api} en={en} refresh={refresh} />{place && <p className="activity-place">{place}</p>}<p>{reasonText(record, en)}</p>{elapsed && <p className="activity-elapsed">{elapsed}</p>}<div className="activity-observed"><span title={en ? 'Observed in the page. No conversation content is collected.' : 'Observé dans la page. Aucun contenu de conversation n’est collecté.'}>{en ? 'Observed in the page' : 'Observé dans la page'}</span><span>·</span>{dateValid ? <time dateTime={observed.toISOString()} title={observed.toLocaleString(en ? 'en-GB' : 'fr-FR')}>{en ? 'Last seen' : 'Dernière observation'} {observed.toLocaleTimeString(en ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time> : <span>{en ? 'Observation time unavailable' : 'Heure d’observation indisponible'}</span>}</div></div>
    <div className="activity-row-actions"><button ref={openButton} className="button subtle" disabled={Boolean(pending) || state === 'unknown' || !api.focusWebActivity} onClick={() => { void action('focus'); }}>{pending === 'focus' ? en ? 'Opening…' : 'Ouverture…' : en ? 'Open session' : 'Ouvrir la session'}<ArrowUpRight size={14} aria-hidden="true" /></button>{needsAttention(record) && <button ref={seenRef} className="button" disabled={Boolean(pending) || !api.acknowledgeWebActivity} onClick={() => { void action('ack'); }}>{pending === 'ack' ? en ? 'Saving…' : 'Enregistrement…' : en ? 'Mark as seen' : 'Marquer comme vu'}</button>}</div>
    {error && <p className="activity-row-error" role="alert">{error === 'focus' ? en ? 'This session could not be opened. Refresh activity or open the service.' : 'Cette session n’a pas pu être ouverte. Actualisez l’activité ou ouvrez le service.' : en ? 'This signal could not be marked as seen. It may have changed; refresh activity.' : 'Ce signal n’a pas pu être marqué comme vu. Il a peut-être changé ; actualisez l’activité.'}</p>}
  </li>;
}

/** The row heading and its rename control. The label is ephemeral (worker memory, for the tab's lifetime) and is only
 * ever rendered as a text node. Enter or leaving the field applies the name, Escape cancels; an empty name clears it.
 * Refused text keeps the field open with its text. As for focus and seen, only a live observation can be named: the
 * button then stays focusable (so focus is never dropped when a row lapses) but inert, marked aria-disabled. */
function SessionName({ record, heading, live, api, en, refresh }: { record: WebActivityObservation; heading: ReturnType<typeof sessionHeading>; live: boolean; api: HubClient; en: boolean; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(''), [problem, setProblem] = useState<'invalid' | 'failed' | null>(null);
  const button = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null), latest = useRef(record);
  const mounted = useRef(false), saving = useRef(false), closed = useRef(true), shown = useRef(`${record.id} ${record.label}`);
  const headingId = useId(), inputId = useId(), problemId = useId();
  latest.current = record;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (editing) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [editing]);
  // Like the row's action errors: a new observation (navigation in the tab) or a new name clears a message about the
  // previous one, unless it describes the text of a field that is still open.
  useEffect(() => { const key = `${record.id} ${record.label}`; if (shown.current !== key) { shown.current = key; if (closed.current) setProblem(null); } }, [record.id, record.label]);
  const open = () => { if (saving.current || !canLabel(latest.current, monotonicEpoch())) return; closed.current = false; setDraft(latest.current.label ?? ''); setProblem(null); setEditing(true); };
  // Removing the field can fire a late blur; once closed, it is ignored.
  const close = (restoreFocus: boolean) => {
    closed.current = true; setEditing(false);
    if (restoreFocus) requestAnimationFrame(() => { if (mounted.current) button.current?.focus({ preventScroll: true }); });
  };
  const save = async (restoreFocus: boolean) => {
    if (closed.current) return;
    const label = labelChange(draft);
    // Refused text is never sent or discarded: the field stays open to correct it (or Escape), on Enter or on leaving it.
    if (label === undefined) { setProblem('invalid'); return; }
    close(restoreFocus);
    if (label === (latest.current.label ?? null) || saving.current || !api.labelWebActivity) return;
    saving.current = true; setProblem(null);
    try {
      // The row follows its tab, so the tab's current observation names it even after a navigation during the edit.
      await api.labelWebActivity(latest.current.id, label);
      // As for other actions, the new name appears from a refreshed snapshot, not optimistically.
      if (mounted.current) await refresh();
    } catch { if (mounted.current) setProblem('failed'); }
    finally { saving.current = false; }
  };
  const message = problem === 'invalid'
    ? en ? `This name cannot be used. Use plain text of up to ${ACTIVITY_LABEL_MAX} characters, without control characters.` : `Ce nom ne peut pas être utilisé. Saisissez du texte simple de ${ACTIVITY_LABEL_MAX} caractères au plus, sans caractère de contrôle.`
    : en ? 'This name could not be applied. The session may have changed or closed; refresh activity.' : 'Ce nom n’a pas pu être appliqué. La session a peut-être changé ou été fermée ; actualisez l’activité.';
  const title = heading.label === undefined ? heading.text : <><bdi>{heading.label}</bdi><span className="activity-provider"> — {heading.provider}</span></>;
  return <>
    <div className="activity-heading">
      {/* While the field is open, the row keeps its heading for screen readers, and the field's name says which session it renames. */}
      {editing ? <><h3 id={headingId} className="sr-only">{title}</h3><form className="activity-rename-form" onSubmit={event => { event.preventDefault(); void save(true); }}>
        <label className="sr-only" htmlFor={inputId}>{en ? `Name for ${heading.session} (${ACTIVITY_LABEL_MAX} characters maximum, empty to clear)` : `Nom de ${heading.session} (${ACTIVITY_LABEL_MAX} caractères au plus, vide pour l’effacer)`}</label>
        <input ref={input} id={inputId} type="text" value={draft} maxLength={ACTIVITY_LABEL_MAX} autoComplete="off" spellCheck={false} aria-invalid={problem === 'invalid' || undefined} aria-describedby={problem ? problemId : undefined}
          onChange={event => { setDraft(event.target.value); if (problem === 'invalid') setProblem(null); }}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setProblem(null); close(true); } }}
          onBlur={() => { void save(false); }} />
      </form></> : <h3 id={headingId}>{title}</h3>}
      {!editing && <button ref={button} type="button" className="icon-button activity-rename" aria-label={en ? 'Name this session' : 'Nommer cette session'} aria-describedby={headingId} aria-disabled={!live || undefined} title={en ? 'Name this session' : 'Nommer cette session'} disabled={!api.labelWebActivity} onClick={open}><Pencil size={14} aria-hidden="true" /></button>}
    </div>
    {problem && <p id={problemId} className="activity-label-error" role="alert">{message}</p>}
  </>;
}
