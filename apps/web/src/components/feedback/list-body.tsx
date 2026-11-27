import type { ReactNode } from "react";

import type { ListPhase } from "@/lib/resource-state";

/**
 * One list body: the loading, error, or empty view in place of the rows, or the rows. After a
 * failed refresh, `stale` (a `StaleNotice`) shows above the cached rows.
 */
export function ListBody<T>({
  phase,
  loading,
  error,
  empty,
  stale,
  children,
}: {
  phase: ListPhase<T>;
  loading: ReactNode;
  error: ReactNode;
  empty: ReactNode;
  stale: ReactNode;
  children: (items: T[]) => ReactNode;
}) {
  if (phase.status === "loading") return loading;
  if (phase.status === "error") return error;
  if (phase.status === "empty") return empty;
  if (phase.status === "ready") return children(phase.items);
  return (
    <>
      {stale}
      {children(phase.items)}
    </>
  );
}
