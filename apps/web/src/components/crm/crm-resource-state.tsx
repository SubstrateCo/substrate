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
}: {
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  loading?: ReactNode;
  record?: boolean;
}) {
  const showLoading = useDelayedLoading(pending);
  const sheet = usePageSheet();
  let errorContent: ReactNode = null;
  if (isAccessFailure(error))
    errorContent = (
      <ContentNotice
        icon={Unlink}
        title="Record unavailable"
        description="This record may be unavailable or you may not have access in this workspace."
      />
    );
  else if (error)
    errorContent = (
      <ErrorState
        title="Couldn’t load CRM"
        description="Your records are unavailable. Try again."
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
