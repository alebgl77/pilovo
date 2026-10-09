import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, MessageSquare } from 'lucide-react';
import type { HubClient } from '../shared/types';
import { emptyWebDiscovery, WEB_PROVIDERS, type WebProvider } from '../shared/web';
import { useObservedResource } from './useObservedResource';

export const providerName = (provider: WebProvider) => provider === 'claude-web' ? 'Claude' : 'ChatGPT';

export function useWebServices(api: HubClient) {
  const read = useCallback(() => api.getWebDiscovery?.() || Promise.resolve(emptyWebDiscovery('unavailable')), [api]);
  const resource = useObservedResource(api, read);
  const [pending, setPending] = useState<WebProvider[]>([]);
  const [message, setMessage] = useState<{ provider: WebProvider; kind: 'denied' | 'failed' } | null>(null);
  const mounted = useRef(false), locks = useRef(new Set<WebProvider>()), generation = useRef(0);
  useEffect(() => { mounted.current = true; generation.current++; return () => { mounted.current = false; generation.current++; }; }, [api]);
  const change = (provider: WebProvider, revoke: boolean) => {
    if (locks.current.has(provider)) return;
    const current = generation.current;
    locks.current.add(provider); setPending([...locks.current]); setMessage(null); resource.invalidate();
    let operation: Promise<boolean>;
    // This invocation must remain in the original click stack for Chrome's user gesture.
    try { operation = (revoke ? api.removeWebDiscoveryPermission?.(provider) : api.requestWebDiscoveryPermission?.(provider)) || Promise.resolve(false); }
    catch { operation = Promise.reject(new Error('permission')); }
    void operation.then(async allowed => {
      if (!mounted.current || current !== generation.current) return;
      if (!allowed) setMessage({ provider, kind: revoke ? 'failed' : 'denied' });
      await resource.refresh();
    }, async () => {
      if (mounted.current && current === generation.current) { setMessage({ provider, kind: 'failed' }); await resource.refresh(); }
    }).finally(() => {
      locks.current.delete(provider);
      if (mounted.current && current === generation.current) setPending([...locks.current]);
    });
  };
  return { ...resource, pending, message, change };
}

export function ProviderConnections({ api, en, service }: { api: HubClient; en: boolean; service: ReturnType<typeof useWebServices> }) {
  return <section className="web-services" aria-labelledby="web-services-title">
    <div className="web-intro"><h2 id="web-services-title">{en ? 'Connected services' : 'Services connectés'}</h2><p>{en ? 'Choose the services Pilovo can observe. No API key is needed.' : 'Choisissez les services que Pilovo peut observer. Aucune clé API nécessaire.'}</p></div>
    <div className="web-provider-list">{WEB_PROVIDERS.map(provider => {
      const entry = service.data?.providers.find(item => item.id === provider.id);
      const permission = service.error ? 'unavailable' : entry?.permission || 'unavailable';
      const granted = permission === 'granted', pending = service.pending.includes(provider.id);
      return <div className="web-provider" key={provider.id} data-provider={provider.id}>
        <MessageSquare size={21} strokeWidth={1.6} aria-hidden="true" />
        <div><h3>{provider.name}</h3><p>{service.loading ? en ? 'Checking permission…' : 'Vérification de l’autorisation…' : pending ? en ? 'Updating permission…' : 'Modification de l’autorisation…' : granted ? en ? 'Connected · observation enabled' : 'Connecté · observation autorisée' : permission === 'not-granted' ? en ? 'Not connected' : 'Non connecté' : en ? 'Observation unavailable' : 'Observation indisponible'}</p></div>
        <div className="provider-actions">
          {permission !== 'unavailable' && <button className={`button${granted ? ' subtle' : ''}`} disabled={service.loading || pending || !(granted ? api.removeWebDiscoveryPermission : api.requestWebDiscoveryPermission)} onClick={() => service.change(provider.id, granted)} aria-label={`${granted ? en ? 'Disconnect' : 'Déconnecter' : en ? 'Connect' : 'Connecter'} ${provider.name}`}>{granted ? en ? 'Disconnect' : 'Déconnecter' : en ? 'Connect' : 'Connecter'}</button>}
          <ProviderOpen api={api} provider={provider.id} en={en} compact />
        </div>
      </div>;
    })}</div>
    {service.error && <p className="field-error" role="alert">{en ? 'Permissions could not be checked. Displayed observations are unconfirmed.' : 'Impossible de vérifier les autorisations. Les observations affichées ne sont plus confirmées.'}</p>}
    {service.message && <p className="field-error" role="alert">{providerName(service.message.provider)} · {service.message.kind === 'denied' ? en ? 'Permission was not granted. You can still open the service.' : 'La permission n’a pas été accordée. Vous pouvez toujours ouvrir le service.' : en ? 'The permission could not be changed. Try again.' : 'La permission n’a pas pu être modifiée. Réessayez.'}</p>}
    <p className="service-privacy">{en ? 'Only activity signals are observed in the page. Conversation text, titles and answers are not collected.' : 'Seuls les signaux d’activité de la page sont observés. Le texte, les titres et les réponses de vos conversations ne sont pas collectés.'}</p>
  </section>;
}

export function WebServices({ api, en }: { api: HubClient; en: boolean }) {
  const service = useWebServices(api);
  return <ProviderConnections api={api} en={en} service={service} />;
}

export function ProviderOpen({ api, provider, en, compact = false }: { api: HubClient; provider: WebProvider; en: boolean; compact?: boolean }) {
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const mounted = useRef(false), lock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const label = `${en ? 'Open' : 'Ouvrir'} ${providerName(provider)}`;
  const style = `button${compact ? ' subtle' : ''}`;
  if (!api.openWebProvider) return <a className={style} href={WEB_PROVIDERS.find(item => item.id === provider)!.url} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={15} aria-hidden="true" /></a>;
  return <div className="provider-open"><button type="button" className={style} disabled={busy} onClick={() => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(false);
    void Promise.resolve().then(() => api.openWebProvider!(provider)).catch(() => { if (mounted.current) setError(true); }).finally(() => { lock.current = false; if (mounted.current) setBusy(false); });
  }}>{label}<ArrowUpRight size={15} aria-hidden="true" /></button>{error && <p className="field-error" role="alert">{en ? 'The service could not be opened. Try again.' : 'Le service n’a pas pu être ouvert. Réessayez.'}</p>}</div>;
}
