import { useEffect, useState } from "react";

type Settled = { query: string; scope: string };

export function debouncedSearch(settled: Settled | null, query: string, scope: string) {
  return {
    query,
    pending: settled?.scope !== scope || settled.query !== query,
  };
}

export function useSearchDebounce(query: string, scope: string) {
  const [settled, setSettled] = useState<Settled>(() => ({ query, scope }));
  useEffect(() => {
    const timeout = setTimeout(() => setSettled({ query, scope }), 200);
    return () => clearTimeout(timeout);
  }, [query, scope]);
  return debouncedSearch(settled, query, scope);
}
