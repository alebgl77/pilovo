import { useCallback, useEffect, useRef, useState } from 'react';
import type { HubClient } from '../shared/types';

/** Live reads are latest-request-wins; a failed read never confirms older data. */
export function useObservedResource<T>(api: HubClient, read: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false), request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const next = await read();
      if (mounted.current && current === request.current) { setData(next); setError(false); setLoading(false); }
    } catch {
      if (mounted.current && current === request.current) { setError(true); setLoading(false); }
    }
  }, [read]);
  useEffect(() => {
    mounted.current = true;
    setData(null); setLoading(true); setError(false);
    void refresh();
    const changed = () => { if (document.visibilityState === 'visible') void refresh(); else invalidate(); };
    const unsubscribe = api.subscribe(changed);
    const timer = window.setInterval(changed, 3000);
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('focus', changed);
    return () => {
      mounted.current = false; invalidate(); unsubscribe(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', changed); window.removeEventListener('focus', changed);
    };
  }, [api, refresh, invalidate]);
  return { data, error, loading, refresh, invalidate };
}
