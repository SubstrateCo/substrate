import type { UseQueryResult } from "@tanstack/react-query";

import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { resourceState } from "@/lib/resource-state";
import { Unlink } from "lucide-react";

/** Returns the record's data, or the loading, error, or unavailable view while it has no fresh data. */
export function crmResource<T>(query: UseQueryResult<T>) {
  const state = resourceState(query);
  if (!state.data || state.error)
    return {
      data: undefined,
      fallback: (
        <CrmResourceState
          pending={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ),
    };
  return { data: state.data, fallback: null };
}

export function CrmResourceState({
  pending,
  error,
  onRetry,
}: {
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
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
  if (pending) return <LoadingState label="Loading CRM…" variant="table" />;
  return null;
}
