import type { ReactNode } from "react";

import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageSheetHeader, PageSheetBody, usePageSheet } from "@/components/layout/page-sheet";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { cn } from "cn";
import { Unlink } from "lucide-react";

export function CrmResourceState({
  pending,
  error,
  onRetry,
  loading,
  record = false,
  compact = false,
  noun,
}: {
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  loading?: ReactNode;
  record?: boolean;
  /** In a card, sheet section, or dialog, not the only content of a page. */
  compact?: boolean;
  /** What a section failed to load, in lower case, such as "follow-ups". */
  noun?: string;
}) {
  const showLoading = useDelayedLoading(pending);
  const sheet = usePageSheet();
  let errorContent: ReactNode = null;
  if (isAccessFailure(error))
    errorContent = (
      <ContentNotice
        icon={Unlink}
        variant={compact ? "compact" : "pane"}
        title={
          noun
            ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} unavailable`
            : "Record unavailable"
        }
        description={
          noun
            ? "You may not have access to these records in this workspace."
            : "This record may be unavailable or you may not have access in this workspace."
        }
      />
    );
  else if (error)
    errorContent = (
      <ErrorState
        compact={compact}
        title={noun ? `Couldn’t load ${noun}` : "Couldn’t load CRM"}
        description={
          noun ? "Check your connection and try again." : "Your records are unavailable. Try again."
        }
        onRetry={onRetry}
      />
    );
  if (record && sheet && errorContent)
    return (
      <>
        <PageSheetHeader title={sheet.label} />
        <PageSheetBody>{errorContent}</PageSheetBody>
      </>
    );
  if (errorContent) return errorContent;
  if (pending)
    return (
      <div className={cn("contents", !showLoading && "invisible")}>
        {loading ?? <LoadingState label="Loading CRM…" variant="table" />}
      </div>
    );
  return null;
}
