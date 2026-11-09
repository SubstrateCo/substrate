import { useEffect, useRef, type ReactNode } from "react";

import { WorkIndicator } from "../work-indicator";
import { PaneState } from "@/components/feedback/pane-state";
import { PageAside } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkTone } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Bot, Square, X } from "lucide-react";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-4">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap gap-x-2">{children}</dd>
    </div>
  );
}

/** A turn's full record in its own side panel. */
export function TurnTranscriptView({
  name,
  tone,
  label,
  startedAt,
  session,
  usage,
  sources,
  outputs,
  timeline,
  unavailable,
  loading,
  error,
  onRetry,
  onClose,
  onStop,
  stopping,
}: {
  name: string;
  tone?: WorkTone;
  label?: string;
  startedAt?: string;
  session?: string;
  usage?: string;
  sources?: ReactNode;
  outputs?: ReactNode;
  timeline?: ReactNode;
  /** Why the transcript can't show here, such as "Open on MacBook". */
  unavailable?: string;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onClose: () => void;
  onStop?: () => void;
  stopping: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Below `lg` the panel covers the page, so focus moves into it.
    if (!window.matchMedia("(min-width: 1024px)").matches) close.current?.focus();
  }, []);
  let body: ReactNode;
  if (unavailable) body = <PaneState label={unavailable} />;
  else if (timeline)
    body = (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <dl className="grid gap-1.5 border-b px-5 py-3 text-xs">
          {startedAt && (
            <Detail label="Started">
              {new Date(startedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
            </Detail>
          )}
          {session && <Detail label="Session">{session}</Detail>}
          {sources && <Detail label="From">{sources}</Detail>}
          {outputs && <Detail label="Output">{outputs}</Detail>}
          <Detail label="Usage">{usage ?? "Unavailable"}</Detail>
        </dl>
        {timeline}
      </div>
    );
  else
    body = (
      <PaneState
        label={error ? "Transcript unavailable" : "Loading transcript…"}
        error={loading ? undefined : error}
        onRetry={onRetry}
      />
    );
  return (
    <PageAside aria-label="Agent transcript">
      <header className="flex shrink-0 items-center gap-3 border-b bg-card/60 py-3 pr-3 pl-4">
        <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Bot aria-hidden="true" className="size-4" />
          {tone && <WorkIndicator tone={tone} label={label} />}
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
      {body}
    </PageAside>
  );
}
