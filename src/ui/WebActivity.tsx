import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Circle, CircleAlert, Eye, LoaderCircle, RefreshCw, Unplug } from 'lucide-react';
import { monotonicEpoch, type WebActivityObservation, type WebActivitySnapshot } from '../shared/activity';
import type { HubClient } from '../shared/types';
import { currentObservations, needsAttention } from './activityModel';
import { ProviderConnections, providerName, useWebServices } from './WebServices';
import { useObservedResource } from './useObservedResource';

export function WebActivity({ api, en }: { api: HubClient; en: boolean }) {
  const read = useCallback(() => api.getWebActivity?.() || Promise.resolve<WebActivitySnapshot>({ availability: 'unavailable', observations: [], observedAt: Date.now() }), [api]);
  const activity = useObservedResource(api, read), service = useWebServices(api);
  const [, tick] = useState(0);
  const now = monotonicEpoch();
  const rows = currentObservations(activity.data, service.data, now, activity.error || service.error, service.pending);
  const providerNumbers = new Map<string, number>();
  const sessionNumbers = new Map([...rows].sort((a, b) => a.tabId - b.tabId).map(record => {
    const number = (providerNumbers.get(record.provider) || 0) + 1;
    providerNumbers.set(record.provider, number);
    return [record.id, number];
  }));
  const attention = rows.filter(needsAttention).length, working = rows.filter(row => row.state === 'working').length;
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
  const refresh = () => { void activity.refresh(); void service.refresh(); };
  return <div className="page-scroll activity-page">
    <div className="activity-toolbar"><p>{en ? 'Your open sessions, at a glance.' : 'Vos sessions ouvertes, en un regard.'}</p><button className="button subtle" onClick={refresh} aria-label={en ? 'Refresh activity' : 'Actualiser l’activité'}><RefreshCw size={15} aria-hidden="true" />{en ? 'Refresh' : 'Actualiser'}</button></div>
    {activity.error && <div className="activity-notice error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{en ? 'Activity could not be refreshed. Previous observations are unconfirmed; open the service to check.' : 'L’activité n’a pas pu être actualisée. Les observations précédentes ne sont plus confirmées ; ouvrez le service pour vérifier.'}</p></div>}
    {loading ? <div className="activity-empty" role="status"><Eye size={23} strokeWidth={1.5} aria-hidden="true" /><h2>{en ? 'Checking open sessions…' : 'Recherche des sessions ouvertes…'}</h2><p>{en ? 'Pilovo checks the services you have connected.' : 'Pilovo vérifie les services que vous avez connectés.'}</p></div> : rows.length ? <>
      <dl className="activity-summary" aria-label={en ? 'Current observations' : 'Observations actuelles'}>
        <div><dt>{en ? 'To review' : 'À vérifier'}</dt><dd>{attention}</dd></div><div><dt>{en ? 'Working' : 'En cours'}</dt><dd>{working}</dd></div><div><dt>{en ? 'Unconfirmed' : 'Non confirmées'}</dt><dd>{unknown}</dd></div>
      </dl>
      <section className="activity-sessions" aria-labelledby="sessions-heading"><div className="activity-list-heading"><h2 id="sessions-heading">{en ? 'Sessions' : 'Sessions'}</h2><span>{en ? 'Attention first' : 'Votre attention d’abord'}</span></div>
        <ul className="activity-list">{rows.map(record => <ActivityRow key={record.id} record={record} sessionNumber={sessionNumbers.get(record.id)!} api={api} en={en} refresh={activity.refresh} />)}</ul>
      </section>
      <p className="activity-semantics">{en ? '“Response available” means generation has ended. Review the answer in the service; your task may still need work.' : '« Réponse disponible » signifie que la génération s’est arrêtée. Vérifiez la réponse dans le service ; votre tâche peut encore demander du travail.'}</p>
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

function ActivityRow({ record, sessionNumber, api, en, refresh }: { record: WebActivityObservation; sessionNumber: number; api: HubClient; en: boolean; refresh: () => Promise<void> }) {
  const [pending, setPending] = useState<'focus' | 'ack' | null>(null), [error, setError] = useState<'focus' | 'ack' | null>(null);
  const lock = useRef(false), mounted = useRef(false), event = useRef(record.attention?.id);
  const openButton = useRef<HTMLButtonElement>(null), seenButton = useRef<HTMLButtonElement>(null), latest = useRef(record);
  latest.current = record;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (event.current !== record.attention?.id) { setError(null); event.current = record.attention?.id; } }, [record.attention?.id]);
  const action = async (kind: 'focus' | 'ack') => {
    if (lock.current || record.state === 'unknown' || record.validUntil <= monotonicEpoch()) return;
    const attentionId = record.attention?.id;
    if (kind === 'ack' && (!attentionId || record.attention?.acknowledged)) return;
    lock.current = true; setPending(kind); setError(null);
    const restoreFocus = kind === 'ack' && document.activeElement === seenButton.current;
    try {
      if (kind === 'focus') await api.focusWebActivity!(record.id);
      else await api.acknowledgeWebActivity!(record.id, attentionId!);
      // Confirmation always comes from a new snapshot, never from an optimistic mutation.
      if (mounted.current) await refresh();
    } catch { if (mounted.current && (kind === 'focus' || latest.current.attention?.id === attentionId)) setError(kind); }
    finally { lock.current = false; if (mounted.current) { setPending(null); if (restoreFocus) requestAnimationFrame(() => { if (mounted.current && latest.current.attention?.id === attentionId && latest.current.attention?.acknowledged) openButton.current?.focus({ preventScroll: true }); }); } }
  };
  const state = record.state, seen = state === 'attention' && record.attention?.acknowledged;
  const Icon = state === 'working' ? LoaderCircle : state === 'unknown' ? Unplug : state === 'attention' ? seen ? Check : CircleAlert : Circle;
  const label = ({ unknown: en ? 'Observation interrupted' : 'Observation interrompue', idle: en ? 'Waiting' : 'En attente', working: en ? 'Working' : 'En cours', attention: seen ? en ? 'Seen' : 'Vu' : en ? 'To review' : 'À vérifier' })[state];
  const observed = new Date(record.observedAt);
  const dateValid = Number.isFinite(observed.getTime());
  return <li className={`activity-row activity-${state}${needsAttention(record) ? ' needs-attention' : ''}`} data-activity-id={record.id}>
    <div className="activity-state"><Icon size={17} aria-hidden="true" /><span>{label}</span></div>
    <div className="activity-row-content"><h3>{providerName(record.provider)} · session {sessionNumber}</h3><p>{reasonText(record, en)}</p><div className="activity-observed"><span title={en ? 'Observed in the page. No conversation content is collected.' : 'Observé dans la page. Aucun contenu de conversation n’est collecté.'}>{en ? 'Observed in the page' : 'Observé dans la page'}</span><span>·</span>{dateValid ? <time dateTime={observed.toISOString()} title={observed.toLocaleString(en ? 'en-GB' : 'fr-FR')}>{en ? 'Last seen' : 'Dernière observation'} {observed.toLocaleTimeString(en ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time> : <span>{en ? 'Observation time unavailable' : 'Heure d’observation indisponible'}</span>}</div></div>
    <div className="activity-row-actions"><button ref={openButton} className="button subtle" disabled={Boolean(pending) || state === 'unknown' || !api.focusWebActivity} onClick={() => { void action('focus'); }}>{pending === 'focus' ? en ? 'Opening…' : 'Ouverture…' : en ? 'Open session' : 'Ouvrir la session'}<ArrowUpRight size={14} aria-hidden="true" /></button>{needsAttention(record) && <button ref={seenButton} className="button" disabled={Boolean(pending) || !api.acknowledgeWebActivity} onClick={() => { void action('ack'); }}>{pending === 'ack' ? en ? 'Saving…' : 'Enregistrement…' : en ? 'Mark as seen' : 'Marquer comme vu'}</button>}</div>
    {error && <p className="activity-row-error" role="alert">{error === 'focus' ? en ? 'This session could not be opened. Refresh activity or open the service.' : 'Cette session n’a pas pu être ouverte. Actualisez l’activité ou ouvrez le service.' : en ? 'This signal could not be marked as seen. It may have changed; refresh activity.' : 'Ce signal n’a pas pu être marqué comme vu. Il a peut-être changé ; actualisez l’activité.'}</p>}
  </li>;
}
