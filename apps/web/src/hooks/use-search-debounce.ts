import { useDebouncedState } from "@tanstack/react-pacer";

import { useEffect } from "react";

export function useSearchDebounce(query: string, scope: string) {
  const [settled, setSettled] = useDebouncedState<{ query: string; scope: string } | null>(null, {
    wait: 200,
  });
  useEffect(() => {
    setSettled({ query, scope });
  }, [query, scope, setSettled]);
  return {
    query: settled?.scope === scope ? settled.query : "",
    pending: settled?.scope !== scope || settled.query !== query,
  };
}
