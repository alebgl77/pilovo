import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, Play, RefreshCw, Square, X } from 'lucide-react';
import type { AgentDetection } from '../shared/discovery';
import { launchRequestSchema, type LaunchRequest, type LaunchReason } from '../shared/launch';
import type { HubClient, Snapshot, SourceId } from '../shared/types';
import { SourceIcon } from './components';
import { sourceName } from './model';

export function launchReason(reason: LaunchReason | undefined, en: boolean): string {
  const reasons: Partial<Record<LaunchReason, [string, string]>> = {
    cli_not_found: ['Agent introuvable sur cet ordinateur.', 'Agent not found on this computer.'],
    cli_unavailable: ['Cette installation ne peut pas être lancée.', 'This installation cannot be launched.'],
    browser_setup_required: ['Le lancement navigateur reste indisponible dans cette version.', 'Browser launch is unavailable in this version.'],
    unsupported_mode: ['Ce mode n’est pas pris en charge par cet agent.', 'This mode is not supported by this agent.'],
    capacity_reached: ['Deux tâches sont déjà en cours. Attendez leur fin.', 'Two tasks are already running. Wait for them to finish.'],
    expired_request: ['Cette demande a expiré. Fermez ce formulaire et créez une nouvelle tâche.', 'This request expired. Close this form and create a new task.'],
    request_conflict: ['Cette demande existe avec un contenu différent.', 'This request exists with different content.'],
    interrupted: ['Le démarrage a été interrompu. Consultez l’historique avant de relancer.', 'Launch was interrupted. Check history before launching again.'],
    not_owned: ['Cette tâche n’est pas contrôlée par la connexion actuelle.', 'This task is not controlled by the current connection.'],
    already_finished: ['Cette tâche est déjà terminée.', 'This task has already ended.'],
    cleanup_failed: ['L’arrêt n’a pas été confirmé. Vérifiez votre agent.', 'Termination was not confirmed. Check your agent.'],
    storage_failed: ['L’enregistrement local a échoué. Aucun nouveau lancement n’est confirmé.', 'Local storage failed. No new launch is confirmed.'],
  };
  const pair = reason && reasons[reason];
  return pair ? pair[en ? 1 : 0] : en ? 'Launch could not be confirmed. Check your agent and try again.' : 'Le lancement n’a pas pu être confirmé. Vérifiez votre agent puis réessayez.';
}

export function AgentDiscovery({ api, snapshot }: { api: HubClient; snapshot: Snapshot }) {
  const en = snapshot.settings.language === 'en';
  const [detection, setDetection] = useState<AgentDetection>();
  const [loading, setLoading] = useState(false), [notice, setNotice] = useState('');
  const [launchSource, setLaunchSource] = useState<SourceId>();
  const [localJobs, setLocalJobs] = useState<{ requestId: string; sourceId: SourceId; taskId: string; runId: string }[]>([]);
  const [stopping, setStopping] = useState<string>();
  const generation = useRef(0), mounted = useRef(true);
  const refresh = useCallback(async (force = false) => {
    if (!api.getAgentDetection) return;
    const id = ++generation.current; setLoading(true);
    try { const next = await api.getAgentDetection(force); if (mounted.current && generation.current === id) setDetection(next); }
    catch { if (mounted.current && generation.current === id) setDetection(undefined); }
    finally { if (mounted.current && generation.current === id) setLoading(false); }
  }, [api]);
  useEffect(() => {
    mounted.current = true; void refresh();
    const focus = () => { void refresh(); }; window.addEventListener('focus', focus);
    return () => { mounted.current = false; generation.current++; window.removeEventListener('focus', focus); };
  }, [refresh, snapshot.bridgeStatus]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = api.subscribe(() => { clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 300); });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [api, refresh]);
  const enable = () => {
    const permission = api.requestDiscoveryPermission?.();
    setNotice('');
    void Promise.resolve(permission).then(async granted => { if (!granted) setNotice(en ? 'Detection permission was not granted.' : 'L’autorisation de détection n’a pas été accordée.'); await refresh(); }).catch(() => setNotice(en ? 'Detection is available in the installed extension.' : 'La détection est disponible dans l’extension installée.'));
  };
  const disable = async () => { try { await api.removeDiscoveryPermission?.(); await refresh(); } catch { setNotice(en ? 'Permission could not be removed.' : 'L’autorisation n’a pas pu être retirée.'); } };
  const discoveredJobs = (detection?.jobs || []).map(job => ({ ...job, requestId: job.launchRequestId }));
  const jobs = [...discoveredJobs, ...localJobs.filter(job => !discoveredJobs.some(other => other.requestId === job.requestId))].filter(job => {
    const task = snapshot.tasks.find(item => item.taskId === job.taskId && item.runId === job.runId && item.sourceId === job.sourceId);
    return !task || !['completed', 'failed', 'cancelled'].includes(task.execution);
  });
  const stop = async (requestId: string) => {
    if (!api.controlAgent || stopping) return;
    setStopping(requestId); setNotice('');
    try {
      const result = await api.controlAgent({ kind: 'launch.cancel', requestId: crypto.randomUUID(), launchRequestId: requestId });
      if (result.kind === 'cancel.result' && result.status === 'cancelled') { setLocalJobs(current => current.filter(job => job.requestId !== requestId)); await refresh(); setNotice(en ? 'Task stopped.' : 'Tâche arrêtée.'); }
      else setNotice(launchReason('reason' in result ? result.reason : undefined, en));
    } catch { setNotice(en ? 'Termination was not confirmed. Check the task before retrying.' : 'L’arrêt n’a pas été confirmé. Vérifiez la tâche avant de réessayer.'); }
    finally { setStopping(undefined); }
  };
  return <section className="agent-discovery" aria-labelledby="agent-discovery-title">
    <div className="section-heading"><h2 id="agent-discovery-title">{en ? 'Available agents' : 'Agents disponibles'}</h2><button className="icon-button" disabled={loading} aria-label={en ? 'Refresh detection' : 'Actualiser la détection'} onClick={() => { void refresh(true); }}><RefreshCw size={16} /></button></div>
    <p className="muted small">{en ? 'Local installations are detected through the companion. An installed agent is not necessarily active in your browser.' : 'Le compagnon détecte les installations locales. Un agent installé n’est pas forcément actif dans votre navigateur.'}</p>
    {loading && <p role="status" className="small muted">{en ? 'Checking installations…' : 'Recherche des installations…'}</p>}
    {detection?.companionStatus !== 'ready' && <p className="discovery-note">{en ? detection?.companionStatus === 'upgrade_required' ? 'Update the companion to enable automatic detection and launch.' : 'Connect the local companion to detect and launch Claude Code and Codex.' : detection?.companionStatus === 'upgrade_required' ? 'Mettez le compagnon à jour pour activer la détection et le lancement.' : 'Connectez le compagnon local pour détecter et lancer Claude Code et Codex.'}</p>}
    <div className="discovery-list">{(['claude-code', 'codex'] as const).map(sourceId => {
      const agent = detection?.localAgents.find(item => item.sourceId === sourceId);
      const available = agent?.availability === 'available';
      return <div className="discovery-row" key={sourceId}><SourceIcon source={sourceId} /><div><strong>{sourceName(sourceId)}</strong><p className="small muted">{available ? en ? 'Local installation detected' : 'Installation locale détectée' : agent?.availability === 'not_found' ? en ? 'Not found' : 'Non trouvé' : en ? 'Unavailable' : 'Indisponible'}{agent?.version && ` · ${agent.version}`}</p></div><button className="button" disabled={!available || !detection?.capabilities.launch || snapshot.mode === 'preview'} onClick={() => setLaunchSource(sourceId)}><Play size={14} />{en ? 'Launch' : 'Lancer'}</button></div>;
    })}</div>
    <div className="browser-detection"><h3><Monitor size={17} aria-hidden="true" />{en ? 'Browser extensions' : 'Extensions du navigateur'}</h3><p className="small muted">{en ? 'Optional detection checks only the known Claude and ChatGPT IDs. No tab content is read.' : 'La détection facultative interroge uniquement les identifiants connus de Claude et ChatGPT. Aucun contenu d’onglet n’est lu.'}</p>
      {!detection?.browserPermission ? <button className="button" disabled={snapshot.mode === 'preview' || !api.requestDiscoveryPermission} onClick={enable}>{en ? 'Enable detection' : 'Activer la détection'}</button> : <><ul className="browser-agents">{detection.browserAgents.map(agent => <li key={agent.id}><strong>{agent.name}</strong><span>{agent.presence === 'installed' ? agent.enabled ? en ? 'Installed · enabled' : 'Installée · activée' : en ? 'Installed · disabled' : 'Installée · désactivée' : en ? 'Not detected' : 'Non détectée'}{agent.version && ` · ${agent.version}`}</span>{agent.presence === 'installed' && agent.installType !== 'normal' && <small>{en ? 'Nonstandard installation · publisher not verified' : 'Installation particulière · éditeur non vérifié'}</small>}</li>)}</ul><button className="button subtle" onClick={() => { void disable(); }}>{en ? 'Disable detection' : 'Désactiver la détection'}</button></>}
      <p className="small muted">{en ? 'Presence does not confirm activity. External sessions are not observable without a supported connection. Browser task launch is not enabled in this release; Codex CLI does not control Chrome.' : 'La présence ne confirme pas l’activité. Les sessions externes ne sont pas observables sans connexion compatible. Le lancement de tâches navigateur n’est pas activé dans cette version ; Codex CLI ne pilote pas Chrome.'}</p>
    </div>
    {jobs.length > 0 && <div className="owned-jobs"><h3>{en ? 'Tasks controlled by this connection' : 'Tâches contrôlées par cette connexion'}</h3>{jobs.map(job => <div className="discovery-row" key={job.requestId}><span>{snapshot.tasks.find(task => task.taskId === job.taskId && task.runId === job.runId)?.title || sourceName(job.sourceId)}</span><button className="button" disabled={Boolean(stopping)} onClick={() => { void stop(job.requestId); }}><Square size={13} />{stopping === job.requestId ? en ? 'Stopping…' : 'Arrêt…' : en ? 'Stop' : 'Arrêter'}</button></div>)}</div>}
    {notice && <p role="status" className="discovery-note">{notice}</p>}
    {launchSource && <LaunchDialog sourceId={launchSource} api={api} en={en} dismiss={() => setLaunchSource(undefined)} accepted={request => { setLocalJobs(current => [...current.filter(job => job.requestId !== request.requestId), request]); setNotice(en ? 'Launch accepted. Follow the task in History.' : 'Lancement accepté. Retrouvez la tâche dans l’historique.'); setLaunchSource(undefined); }} />}
  </section>;
}

function LaunchDialog({ sourceId, api, en, dismiss, accepted }: { sourceId: SourceId; api: HubClient; en: boolean; dismiss: () => void; accepted: (job: { requestId: string; sourceId: SourceId; taskId: string; runId: string }) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), request = useRef<LaunchRequest | null>(null), lock = useRef(false);
  const [title, setTitle] = useState(''), [prompt, setPrompt] = useState(''), [url, setUrl] = useState('');
  const [retainResult, setRetainResult] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [attempted, setAttempted] = useState(false);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const node = dialog.current; node?.showModal(); return () => { node?.close(); previous?.isConnected && previous.focus(); }; }, []);
  const submit = async () => {
    if (!api.controlAgent || lock.current) return;
    const parsed = launchRequestSchema.safeParse(request.current || { kind: 'launch.request', requestId: crypto.randomUUID(), createdAt: new Date().toISOString(), sourceId, title, prompt, retainResult, ...(url ? { contextUrl: url } : {}), mode: 'standard' });
    if (!parsed.success) { setError(en ? 'Enter a title, a request and a valid HTTP(S) link if needed.' : 'Renseignez un titre, une consigne et, si nécessaire, un lien HTTP(S) valide.'); return; }
    request.current = parsed.data; lock.current = true; setAttempted(true); setBusy(true); setError('');
    try {
      const result = await api.controlAgent(parsed.data);
      if (result.kind === 'launch.result' && result.status === 'accepted' && result.taskId && result.runId) accepted({ requestId: parsed.data.requestId, sourceId, taskId: result.taskId, runId: result.runId });
      else setError(launchReason('reason' in result ? result.reason : undefined, en));
    } catch { setError(en ? 'No confirmation received. The task may have started. Check History or retry this same request; it keeps the same identifier.' : 'Confirmation non reçue. La tâche a peut-être démarré. Vérifiez l’historique ou réessayez cette même demande ; son identifiant est conservé.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="action-dialog launch-dialog" aria-labelledby="launch-title" onCancel={event => { event.preventDefault(); if (!busy) dismiss(); }}><form onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="dialog-heading"><h2 id="launch-title">{en ? 'Launch' : 'Lancer'} {sourceName(sourceId)}</h2><button type="button" className="icon-button" disabled={busy} aria-label={en ? 'Close' : 'Fermer'} onClick={dismiss}><X size={18} /></button></div>
    <p className="small muted">{en ? 'Start a text task using your existing agent account. No browser actions are available in this mode. Provider usage limits and charges apply.' : 'Lancez une tâche texte avec votre compte existant. Ce mode n’effectue aucune action navigateur. Les quotas et la tarification du fournisseur s’appliquent.'}</p>
    <label className="field-label">{en ? 'Task title' : 'Titre de la tâche'}<input autoFocus required maxLength={160} disabled={attempted} value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label className="field-label">{en ? 'Request' : 'Consigne'}<textarea required maxLength={10000} rows={5} disabled={attempted} value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
    <label className="field-label">{en ? 'Context link (optional)' : 'Lien de contexte (facultatif)'}<input type="url" maxLength={4096} disabled={attempted} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></label>
    <label className="checkbox-label"><input type="checkbox" checked={retainResult} disabled={attempted} onChange={event => setRetainResult(event.target.checked)} />{en ? 'Save the answer in the local receipt' : 'Conserver la réponse dans le reçu local'}</label>
    <p className="small muted">{en ? 'The request is sent to the provider. A saved answer can quote your request or private data; it follows your history retention setting. Without this option, the answer is discarded. The title, context link and execution status are always kept.' : 'La consigne est envoyée au fournisseur. Une réponse conservée peut reprendre votre consigne ou des données privées ; elle suit la durée de rétention de l’historique. Sans cette option, la réponse est écartée. Le titre, le lien et le statut d’exécution sont toujours conservés.'}</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={dismiss}>{en ? 'Close' : 'Fermer'}</button><button className="button primary" disabled={busy}><Play size={14} />{busy ? en ? 'Launching…' : 'Lancement…' : attempted ? en ? 'Retry same request' : 'Réessayer la même demande' : en ? 'Launch task' : 'Lancer la tâche'}</button></div>
  </form></dialog>;
}
