import type { AgentRunDetail } from "@startup-os/contracts/agent-runs";

import { requestOutcome } from "./requests/agent-run-request";
import { PaneState } from "@/components/feedback/pane-state";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function TranscriptEntries({ run }: { run: AgentRunDetail }) {
  // Requests appear where they opened, between the events around them.
  const entries = [
    ...run.events.map((event) => ({
      type: "event" as const,
      at: event.createdAt,
      key: `e${event.sequence}`,
      event,
    })),
    ...run.requests.map((request) => ({
      type: "request" as const,
      at: request.createdAt,
      key: `r${request.id}`,
      request,
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!entries.length)
    return <p className="text-sm text-muted-foreground">Nothing has been recorded yet.</p>;
  return (
    <ol className="grid gap-2">
      {entries.map((entry) => {
        if (entry.type === "request")
          return (
            <li key={entry.key} className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm">
              <span className="font-medium">{entry.request.payload.title}</span>
              <span className="block text-xs text-muted-foreground">
                {requestOutcome(entry.request)}
              </span>
            </li>
          );
        const event = entry.event;
        if (event.kind === "text")
          return (
            <li key={entry.key}>
              <MessageMarkdown body={event.text} />
            </li>
          );
        return (
          <li
            key={entry.key}
            className={
              event.kind === "error"
                ? "font-mono text-xs wrap-anywhere text-destructive"
                : "font-mono text-xs wrap-anywhere text-muted-foreground"
            }
          >
            {event.text}
          </li>
        );
      })}
    </ol>
  );
}

export function AgentRunTranscript({
  name,
  run,
  loading,
  error,
  onRetry,
  onClose,
}: {
  name: string;
  run?: AgentRunDetail;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name} transcript</DialogTitle>
          <DialogDescription>What the agent did on your desktop during this run.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0">
          {run ? (
            <TranscriptEntries run={run} />
          ) : (
            <PaneState
              label={error ? "Transcript unavailable" : "Loading transcript…"}
              error={loading ? undefined : error}
              onRetry={onRetry}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
