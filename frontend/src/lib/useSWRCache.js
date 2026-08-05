/**
 * useSWRCache — a tiny stale-while-revalidate hook.
 *
 * Reads from sessionStorage synchronously on mount (so the page renders
 * pre-cached data on the first paint, no skeleton flash), then re-fetches
 * in the background and swaps in the fresh data when it arrives.
 *
 * Usage:
 *   const { data, loading, refetch } = useSWRCache("products", () => api.get("/products").then(r => r.data));
 *
 * `loading` is only true when there's NO cached data yet — subsequent
 * revalidations don't toggle it (so the UI stays put while fresh data loads).
 * Callers can look at `revalidating` if they need to show a soft spinner.
 */
import { useEffect, useRef, useState, useCallback } from "react";

const KEY_PREFIX = "swr:";

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeCache(key, value) {
  try { sessionStorage.setItem(KEY_PREFIX + key, JSON.stringify(value)); }
  catch { /* quota exceeded — ignore */ }
}

export default function useSWRCache(key, fetcher, { fallback = null } = {}) {
  const cached = readCache(key);
  const [data, setData] = useState(cached ?? fallback);
  const [loading, setLoading] = useState(cached === null);
  const [revalidating, setRevalidating] = useState(false);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    setRevalidating(true);
    try {
      const fresh = await fetcher();
      if (!mountedRef.current) return;
      setData(fresh);
      writeCache(key, fresh);
    } catch {
      // keep stale data on error — user still sees SOMETHING
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRevalidating(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, revalidating, refetch: doFetch, setData };
}
