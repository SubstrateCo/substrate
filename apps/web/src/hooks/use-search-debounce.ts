import { useEffect, useState } from "react";

type Settled = { query: string; scope: string };

/** Results use only a query settled in the current scope, so a scope change hides old results. */
export function debouncedSearch(settled: Settled | null, query: string, scope: string) {
  return {
    query: settled?.scope === scope ? settled.query : "",
    pending: settled?.scope !== scope || settled.query !== query,
  };
}

export function useSearchDebounce(query: string, scope: string) {
  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    const timeout = setTimeout(() => setSettled({ query, scope }), 200);
    return () => clearTimeout(timeout);
  }, [query, scope]);
  return debouncedSearch(settled, query, scope);
}
