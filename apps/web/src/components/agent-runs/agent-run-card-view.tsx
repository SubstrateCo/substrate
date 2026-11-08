import type { AgentRunView } from "@startup-os/contracts/agent-runs";

import type { ReactNode } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNow } from "@/hooks/use-now";
import { formatDuration, pendingRequest } from "@/lib/agent-runs/runs";
import { Bot, CircleAlert, CircleCheck, CircleSlash, Clock, Hand } from "lucide-react";

function runStatus(run: AgentRunView, now: number) {
  const request = pendingRequest(run);
  if (request)
    return {
      icon: Hand,
      label: request.payload.type === "approval" ? "Needs approval" : "Needs an answer",
    };
  switch (run.status) {
    case "queued": {
      let label = "Queued · no desktop is set to run this agent";
      if (run.device)
        label = run.device.online
          ? `Queued · waiting for ${run.device.name}`
          : `Queued · ${run.device.name} is offline`;
      return { icon: Clock, label };
    }
    case "running":
      return {
        icon: Spinner,
        label: `Running · ${formatDuration(now - Date.parse(run.startedAt ?? run.createdAt))}`,
      };
    case "completed":
      return { icon: CircleCheck, label: "Completed" };
    case "failed":
      return { icon: CircleAlert, label: "Failed" };
    case "cancelled":
      return { icon: CircleSlash, label: "Cancelled" };
    case "expired":
      return { icon: CircleSlash, label: "Expired before it ran" };
  }
}

export function AgentRunCard({
  run,
  request,
  cancelling,
  onCancel,
  onTranscript,
}: {
  run: AgentRunView;
  request?: ReactNode;
  cancelling: boolean;
  onCancel: () => void;
  onTranscript: () => void;
}) {
  const active = run.status === "queued" || run.status === "running";
  const now = useNow(run.status === "running");
  const status = runStatus(run, now);
  const Icon = status.icon;
  return (
    <section
      aria-label={`${run.agent.name} run`}
      className="mt-2 grid max-w-xl gap-2 rounded-md border bg-card p-2.5 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Bot aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{run.agent.name}</span>
        <span
          role="status"
          className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground tabular-nums"
        >
          <Icon aria-hidden="true" role="presentation" className="size-3.5 shrink-0" />
          {status.label}
        </span>
        <span className="ml-auto flex gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={onTranscript}>
            View transcript
          </Button>
          {active && (
            <PendingButton
              type="button"
              size="xs"
              variant="outline"
              pending={cancelling}
              pendingLabel="Cancelling…"
              onClick={onCancel}
            >
              Cancel
            </PendingButton>
          )}
        </span>
      </div>
      {run.status === "running" && run.activity && (
        <p className="truncate font-mono text-xs text-muted-foreground" title={run.activity}>
          {run.activity}
        </p>
      )}
      {run.status === "failed" && run.error && (
        <p className="text-xs wrap-anywhere text-destructive">{run.error}</p>
      )}
      {request}
    </section>
  );
}
