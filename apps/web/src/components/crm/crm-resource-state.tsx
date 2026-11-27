import type { ReactNode } from "react";

import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageSheetHeader, PageSheetBody } from "@/components/layout/page-sheet";
import { usePageSheet } from "@/components/layout/page-sheet-context";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import type { ResourceState } from "@/lib/resource-state";
import { cn } from "cn";
import { Unlink } from "lucide-react";

type CrmResourceViews = {
  onRetry: () => void;
  loading?: ReactNode;
  record?: boolean;
  /** In a card, sheet section, or dialog, not the only content of a page. */
  compact?: boolean;
  /** What a section failed to load, in lower case, such as "follow-ups". */
  noun?: string;
};

/**
 * Loaded CRM data, or the loading, error, or unavailable view in its place. After a failed
 * refresh, the loaded data stays under a notice.
 */
export function CrmResourceBoundary<T>({
  state,
  children,
  ...views
}: CrmResourceViews & {
  state: ResourceState<T>;
  children: (data: T) => ReactNode;
}) {
  if (state.data === undefined)
    return (
      <CrmResourceFallback pending={state.status === "loading"} error={state.error} {...views} />
    );
  return (
    <>
      {state.status === "stale" && (
        <StaleNotice
          title={
            views.noun
              ? `These ${views.noun} may be out of date.`
              : "This information may be out of date."
          }
          onRetry={views.onRetry}
        />
      )}
      {children(state.data)}
    </>
  );
}

/** The loading or error view of CRM data that has not loaded. */
export function CrmResourceFallback({
  pending,
  error,
  onRetry,
  loading,
  record = false,
  compact = false,
  noun,
}: CrmResourceViews & {
  pending: boolean;
  error: Error | null;
}) {
  const showLoading = useDelayedLoading(pending);
  const sheet = usePageSheet();
  if (error) {
    const content = (
      <CrmResourceError error={error} compact={compact} noun={noun} onRetry={onRetry} />
    );
    if (!record || !sheet) return content;
    return (
      <>
        <PageSheetHeader title={sheet.label} />
        <PageSheetBody className="flex flex-col">{content}</PageSheetBody>
      </>
    );
  }
  if (pending)
    return (
      <div className={cn("contents", !showLoading && "invisible")}>
        {loading ?? <LoadingState label="Loading CRM" variant="table" />}
      </div>
    );
  return null;
}

function CrmResourceError({
  error,
  compact,
  noun,
  onRetry,
}: {
  error: Error;
  compact: boolean;
  noun?: string;
  onRetry: () => void;
}) {
  if (!isAccessFailure(error))
    return (
      <ErrorState
        variant={compact ? "compact" : undefined}
        title={noun ? `Couldn’t load ${noun}` : "Couldn’t load CRM"}
        onRetry={onRetry}
      />
    );
  return (
    <ContentNotice
      icon={Unlink}
      variant={compact ? "compact" : "pane"}
      title={
        noun ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} unavailable` : "Record unavailable"
      }
      description={
        noun
          ? "You may not have access to these records in this workspace."
          : "This record may be unavailable or you may not have access in this workspace."
      }
    />
  );
}
