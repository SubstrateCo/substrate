import type { AgentRunDetail, AgentRunRequestView } from "@startup-os/contracts/agent-runs";

import { useEffect, useRef, type ReactNode } from "react";

import { AgentRunIndicator } from "./agent-run-indicator";
import { requestOutcome } from "./requests/agent-run-request";
import { PaneState } from "@/components/feedback/pane-state";
import { PageAside } from "@/components/layout/page-layout";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RunTone } from "@/lib/agent-runs/runs";
import { cn } from "cn";
import { Bot, Check, Hand, Laptop, Square, X } from "lucide-react";

// The desktop runner records this marker when a turn starts. It is not a step.
const startMarker = "Working";

type Entry =
  | { type: "event"; at: string; key: string; event: AgentRunDetail["events"][number] }
  | { type: "request"; at: string; key: string; request: AgentRunRequestView };

function entries(run: AgentRunDetail): Entry[] {
  // Requests appear where they opened, between the events around them.
  return [
    ...run.events
      .filter((event) => !(event.kind === "activity" && event.text === startMarker))
      .map((event): Entry => ({
        type: "event",
        at: event.createdAt,
        key: `e${event.sequence}`,
        event,
      })),
    ...run.requests.map((request): Entry => ({
      type: "request",
      at: request.createdAt,
      key: `r${request.id}`,
      request,
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function Timeline({
  run,
  renderRequest,
}: {
  run: AgentRunDetail;
  renderRequest: (request: AgentRunRequestView) => ReactNode;
}) {
  const list = entries(run);
  if (!list.length)
    return <p className="px-5 py-4 text-sm text-muted-foreground">Nothing has happened yet.</p>;
  const lastActivity = list
    .filter((entry) => entry.type === "event" && entry.event.kind === "activity")
    .at(-1);
  return (
    <ol className="grid gap-3 px-5 py-4">
      {list.map((entry) => {
        if (entry.type === "request") {
          const { request } = entry;
          if (request.status === "pending")
            return <li key={entry.key}>{renderRequest(request)}</li>;
          return (
            <li
              key={entry.key}
              className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
            >
              <Hand aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate" title={request.payload.title}>
                {request.payload.title}
              </span>
              <span className="shrink-0">· {requestOutcome(request)}</span>
            </li>
          );
        }
        const { event } = entry;
        if (event.kind === "text")
          return (
            <li key={entry.key} className="flex min-w-0 gap-2.5">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <Bot aria-hidden="true" className="size-3" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <MessageMarkdown body={event.text} />
              </div>
            </li>
          );
        if (event.kind === "error")
          return (
            <li
              key={entry.key}
              className="flex min-w-0 gap-2 text-xs wrap-anywhere text-destructive"
            >
              <X aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {event.text}
            </li>
          );
        const current = run.status === "running" && entry === lastActivity;
        return (
          <li
            key={entry.key}
            className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
          >
            {current ? (
              <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center">
                <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
              </span>
            ) : (
              <Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />
            )}
            <span className="min-w-0 font-mono wrap-anywhere">{event.text}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The run's full record in its own side panel, beside the conversation. */
export function AgentRunTranscript({
  name,
  run,
  tone,
  label,
  loading,
  error,
  onRetry,
  onClose,
  sourceHref,
  renderRequest,
  onStop,
  stopping,
}: {
  name: string;
  run?: AgentRunDetail;
  tone?: RunTone;
  label?: string;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onClose: () => void;
  sourceHref?: string;
  renderRequest: (request: AgentRunRequestView) => ReactNode;
  onStop?: () => void;
  stopping: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Below `lg` the panel covers the conversation, so focus moves into it.
    if (!window.matchMedia("(min-width: 1024px)").matches) close.current?.focus();
  }, []);
  return (
    <PageAside aria-label="Agent run transcript">
      <header className="flex shrink-0 items-center gap-3 border-b bg-card/60 py-3 pr-3 pl-4">
        <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Bot aria-hidden="true" className="size-4" />
          {tone && <AgentRunIndicator tone={tone} label={label} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{name} · transcript</h2>
          {label && (
            <p
              className={cn(
                "truncate text-xs text-muted-foreground tabular-nums",
                tone === "attention" && "text-warning",
                tone === "failed" && "text-destructive",
              )}
            >
              {label}
            </p>
          )}
        </div>
        {onStop && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={stopping}
            onClick={onStop}
          >
            <Square aria-hidden="true" />
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={close}
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close transcript"
              onClick={onClose}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close transcript</TooltipContent>
        </Tooltip>
      </header>
      {run ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <dl className="grid gap-1.5 border-b px-5 py-3 text-xs">
            <div className="flex min-w-0 gap-4">
              <dt className="w-16 shrink-0 text-muted-foreground">Started</dt>
              <dd className="truncate">
                {new Date(run.startedAt ?? run.createdAt).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            {run.device && (
              <div className="flex min-w-0 gap-4">
                <dt className="w-16 shrink-0 text-muted-foreground">Runs on</dt>
                <dd className="flex min-w-0 items-center gap-1.5">
                  <Laptop aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{run.device.name}</span>
                  <span className={run.device.online ? "text-success" : "text-muted-foreground"}>
                    · {run.device.online ? "online" : "offline"}
                  </span>
                </dd>
              </div>
            )}
            {sourceHref && (
              <div className="flex min-w-0 gap-4">
                <dt className="w-16 shrink-0 text-muted-foreground">Asked in</dt>
                <dd>
                  <a href={sourceHref} className="font-medium text-primary hover:underline">
                    The original message
                  </a>
                </dd>
              </div>
            )}
          </dl>
          <Timeline run={run} renderRequest={renderRequest} />
          {run.status === "failed" && run.error && (
            <p className="mx-5 mb-4 text-xs wrap-anywhere text-destructive">{run.error}</p>
          )}
        </div>
      ) : (
        <PaneState
          label={error ? "Transcript unavailable" : "Loading transcript…"}
          error={loading ? undefined : error}
          onRetry={onRetry}
        />
      )}
    </PageAside>
  );
}
