import { useEffect, useState } from "react";

export function useSearchDebounce(query: string, scope: string) {
  const [settled, setSettled] = useState<{ query: string; scope: string } | null>(null);
  useEffect(() => {
    const timeout = setTimeout(() => setSettled({ query, scope }), 200);
    return () => clearTimeout(timeout);
  }, [query, scope]);
  return {
    query: settled?.scope === scope ? settled.query : "",
    pending: settled?.scope !== scope || settled.query !== query,
  };
}
