import { useEffect, useState } from "react";

type Settled = { query: string; scope: string };

/** Change query keys at once to abandon old requests; enable fetching only after settling. */
export function debouncedSearch(settled: Settled | null, query: string, scope: string) {
  return {
    query,
    pending: settled?.scope !== scope || settled.query !== query,
  };
}

export function useSearchDebounce(query: string, scope: string) {
  // The first query needs no wait, so a remount shows cached results at once.
  const [settled, setSettled] = useState<Settled>(() => ({ query, scope }));
  useEffect(() => {
    const timeout = setTimeout(() => setSettled({ query, scope }), 200);
    return () => clearTimeout(timeout);
  }, [query, scope]);
  return debouncedSearch(settled, query, scope);
}
