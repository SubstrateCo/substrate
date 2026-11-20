import type { AgentAuditAction, AgentAuditEventView } from "@substrate/contracts/agent-work";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { SettingsSection } from "@/components/layout/settings-section";
import { Timestamp } from "@/components/time/timestamp";
import { callDropReason } from "@/lib/agent-work/calls";
import { ScrollText } from "lucide-react";

function CallRow({
  title,
  time,
  detail,
}: {
  title: ReactNode;
  time: ReactNode;
  detail: ReactNode;
}) {
  return (
    <li className="grid gap-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        {time}
      </div>
      <p className="text-xs wrap-anywhere text-muted-foreground">{detail}</p>
    </li>
  );
}

const labels: Record<AgentAuditAction, string> = {
  policy_changed: "Caller policy changed",
  caller_allowed: "Caller allowed",
  caller_removed: "Caller removed",
  invocation_admitted: "Call admitted",
  invocation_held: "Call waiting for approval",
  invocation_rate_limited: "Call rate limited",
  invocation_approved: "Call approved",
  invocation_declined: "Call declined",
  invocation_expired: "Call expired",
  invocation_cancelled: "Call cancelled",
  invocation_dropped: "Call dropped",
  mcp_call: "Tool call",
};

export function CallsLogView({
  entries,
  loading,
  error,
  onRetry,
}: {
  entries: AgentAuditEventView[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <SettingsSection
      title="Calls"
      description="Your agent’s caller decisions and tool activity. Only you can see this log."
    >
      {loading && !entries.length && (
        <div role="status" aria-label="Loading calls">
          <ul aria-hidden="true" className="divide-y">
            {[0, 1, 2].map((i) => (
              <CallRow
                key={i}
                title={<SkeletonText width="12rem" />}
                time={<SkeletonText width="6rem" />}
                detail={<SkeletonText width="18rem" />}
              />
            ))}
          </ul>
        </div>
      )}
      {error && <ErrorState title="Couldn’t load calls" onRetry={onRetry} />}
      {!loading && !error && !entries.length && (
        <ContentNotice
          icon={ScrollText}
          title="No calls yet"
          description="Caller decisions and tool activity appear here."
        />
      )}
      <ul className="divide-y">
        {entries.map((entry) => (
          <CallRow
            key={entry.id}
            title={
              <>
                {labels[entry.action]}
                {entry.tool ? ` · ${entry.tool}` : ""}
              </>
            }
            time={<Timestamp value={entry.createdAt} format="datetime" />}
            detail={[
              entry.access,
              entry.action === "invocation_dropped" ? callDropReason(entry.result) : entry.result,
              entry.callerActorId && `Caller ${entry.callerActorId}`,
              entry.invocationId && `Call ${entry.invocationId}`,
              entry.turnId && `Turn ${entry.turnId}`,
              entry.targetIds.length > 0 && `Targets: ${entry.targetIds.join(", ")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </ul>
    </SettingsSection>
  );
}
