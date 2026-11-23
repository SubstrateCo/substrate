import type { ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
import type { ResourceStatus } from "@/lib/resource-state";

export function ThreadPane({
  root,
  state,
  loading = false,
  error,
  onRetry,
  replies,
  composer,
}: {
  root?: ReactNode;
  state: ResourceStatus;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  replies?: ReactNode;
  composer: ReactNode;
}) {
  const blocked = state === "error" || state === "unavailable";
  return (
    <>
      {blocked ? (
        <PaneState
          label="Thread unavailable"
          error={error}
          onRetry={state === "unavailable" ? undefined : onRetry}
        />
      ) : (
        <>
          {state === "stale" && <StaleNotice>Replies may be out of date.</StaleNotice>}
          {root && (
            <div className="max-h-7/20 shrink-0 overflow-y-auto border-b pt-4 pb-2">{root}</div>
          )}
          {loading && !replies ? <MessageLoading label="Loading replies" /> : replies}
        </>
      )}
      {!blocked && <div className="mt-auto shrink-0">{composer}</div>}
    </>
  );
}
