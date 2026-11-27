import type { UseQueryResult } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { CrmResourceFallback } from "./crm-resource-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { resourceState } from "@/lib/resource-state";

/** Returns readable data, or the loading, error, or unavailable view when there is none. */
export function crmResource<T>(query: UseQueryResult<T>, loading?: ReactNode) {
  const state = resourceState(query);
  if (!state.data)
    return {
      data: undefined,
      fallback: (
        <CrmResourceFallback
          record
          pending={query.isPending}
          error={query.error}
          loading={loading}
          onRetry={() => void query.refetch()}
        />
      ),
    };
  return {
    data: state.data,
    fallback: null,
    staleNotice:
      state.status === "stale" ? (
        <StaleNotice
          className="px-4 py-2"
          title="This record may be out of date."
          onRetry={() => void query.refetch()}
        />
      ) : null,
  };
}
