import type { AgentAuditAction, AgentAuditEventView } from "@substrate/contracts/agent-work";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsSection } from "@/components/layout/settings-section";
import { Timestamp } from "@/components/time/timestamp";
import { callDropReason } from "@/lib/agent-work/calls";
import { ScrollText } from "lucide-react";

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
      {loading && <LoadingState label="Loading calls" variant="compact" />}
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
          <li key={entry.id} className="grid gap-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {labels[entry.action]}
                {entry.tool ? ` · ${entry.tool}` : ""}
              </span>
              <Timestamp value={entry.createdAt} format="datetime" />
            </div>
            <p className="text-xs wrap-anywhere text-muted-foreground">
              {[
                entry.access,
                entry.action === "invocation_dropped" ? callDropReason(entry.result) : entry.result,
                entry.callerActorId && `Caller ${entry.callerActorId}`,
                entry.invocationId && `Call ${entry.invocationId}`,
                entry.turnId && `Turn ${entry.turnId}`,
                entry.targetIds.length > 0 && `Targets: ${entry.targetIds.join(", ")}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
