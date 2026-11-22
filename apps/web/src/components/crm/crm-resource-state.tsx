import type { UseQueryResult } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { resourceState } from "@/lib/resource-state";
import { cn } from "cn";
import { Unlink } from "lucide-react";

/** Returns readable data, or the loading, error, or unavailable view when there is none. */
export function crmResource<T>(query: UseQueryResult<T>, loading?: ReactNode) {
  const state = resourceState(query);
  if (!state.data)
    return {
      data: undefined,
      fallback: (
        <CrmResourceState
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
        <StaleNotice onRetry={() => void query.refetch()}>
          This record may be out of date.
        </StaleNotice>
      ) : null,
  };
}

export function CrmResourceState({
  pending,
  error,
  onRetry,
  loading,
}: {
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  loading?: ReactNode;
}) {
  const showLoading = useDelayedLoading(pending);
  if (isAccessFailure(error))
    return (
      <ContentNotice
        icon={Unlink}
        title="Record unavailable"
        description="This record may be unavailable or you may not have access in this workspace."
      />
    );
  if (error)
    return (
      <ErrorState
        title="Couldn’t load CRM"
        description="Your records are unavailable. Try again."
        onRetry={onRetry}
      />
    );
  if (pending)
    return (
      <div className={cn("contents", !showLoading && "invisible")}>
        {loading ?? <LoadingState label="Loading CRM…" variant="table" />}
      </div>
    );
  return null;
}
