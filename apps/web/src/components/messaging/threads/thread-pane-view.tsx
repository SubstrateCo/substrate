import type { ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import type { ResourceStatus } from "@/lib/resource-state";

export function ThreadPane({
  root,
  state,
  error,
  onRetry,
  replies,
  composer,
}: {
  root?: ReactNode;
  state: ResourceStatus;
  error?: Error | null;
  onRetry: () => void;
  /** The replies, or their loading or empty view. */
  replies: ReactNode;
  composer: ReactNode;
}) {
  if (state === "error" || state === "unavailable")
    return (
      <PaneState
        label="Thread unavailable"
        error={error}
        onRetry={state === "unavailable" ? undefined : onRetry}
      />
    );
  return (
    <>
      {state === "stale" && (
        <StaleNotice className="px-4 py-2" title="Replies may be out of date." />
      )}
      {root && <div className="max-h-7/20 shrink-0 overflow-y-auto border-b pt-4 pb-2">{root}</div>}
      {replies}
      <div className="mt-auto shrink-0">{composer}</div>
    </>
  );
}
