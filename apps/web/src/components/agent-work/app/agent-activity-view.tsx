import type { ReactNode } from "react";

import { WorkIndicator } from "../work-indicator";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { WorkStatus } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Laptop, PanelRight } from "lucide-react";

export type ActivityRow = {
  id: string;
  /** Direct message, Thread, Routine, or Helper. */
  kind: string;
  /** Background work that no owner message started. */
  unattended: boolean;
  status: WorkStatus;
  createdAt: string;
  selected: boolean;
  /** For example, the needs-attention card. */
  attention?: ReactNode;
};

export type HelperRow = { id: string; task: string; status: string; report: string | null };

/** One agent's work on its home desktop, including silent, routine, and helper work. */
export function AgentActivityView({
  name,
  status,
  unavailable,
  rows,
  helpers,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onMore,
  onTranscript,
  routines,
}: {
  name: string;
  status?: WorkStatus;
  /** Why the activity can't show on this device, such as "Open on MacBook". */
  unavailable?: { title: string; description: string };
  rows: ActivityRow[];
  helpers: HelperRow[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onTranscript: (turnId: string) => void;
  routines?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="shrink-0 space-y-1 px-4 pt-5 sm:px-6 sm:pt-6">
        <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
        {status && (
          <p
            className={cn(
              "text-sm text-muted-foreground",
              status.tone === "attention" && "text-warning",
            )}
          >
            {status.label}
          </p>
        )}
      </header>
      <div className="grid gap-6 p-4 sm:p-6">
        {unavailable ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Laptop aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                <h2>{unavailable.title}</h2>
              </EmptyTitle>
              <EmptyDescription>{unavailable.description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <section aria-label="Activity" className="grid gap-2">
              <h2 className="text-sm font-semibold">Activity</h2>
              {error && <ErrorState compact title="Couldn’t load activity" onRetry={onRetry} />}
              {loading && <LoadingState label="Loading activity" variant="compact" />}
              {!loading && !error && !rows.length && (
                <p className="text-sm text-muted-foreground">No work yet.</p>
              )}
              {rows.length > 0 && (
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className={cn("grid gap-1 px-3 py-2", row.selected && "bg-muted")}
                    >
                      <div className="flex min-w-0 items-center gap-3 text-sm">
                        <span className="relative size-3 shrink-0">
                          <WorkIndicator tone={row.status.tone} label={row.status.label} />
                        </span>
                        <span className="w-28 shrink-0 text-xs text-muted-foreground">
                          {row.kind}
                          {row.unattended && " · background"}
                        </span>
                        <span className="min-w-0 flex-1 truncate tabular-nums">
                          {row.status.label}
                        </span>
                        <time
                          className="shrink-0 text-xs text-muted-foreground"
                          dateTime={row.createdAt}
                        >
                          {new Date(row.createdAt).toLocaleString([], {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </time>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          aria-label="Open transcript"
                          onClick={() => onTranscript(row.id)}
                        >
                          <PanelRight aria-hidden="true" />
                        </Button>
                      </div>
                      {row.attention}
                    </li>
                  ))}
                </ul>
              )}
              {hasMore && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loadingMore}
                  onClick={onMore}
                >
                  {loadingMore ? "Loading…" : "Show older work"}
                </Button>
              )}
            </section>
            {helpers.length > 0 && (
              <section aria-label="Helpers" className="grid gap-2">
                <h2 className="text-sm font-semibold">Helpers</h2>
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {helpers.map((helper) => (
                    <li key={helper.id} className="grid gap-0.5 px-3 py-2 text-sm">
                      <span className="flex min-w-0 justify-between gap-3">
                        <span className="min-w-0 truncate">{helper.task}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {helper.status}
                        </span>
                      </span>
                      {helper.report && (
                        <span className="line-clamp-3 text-xs text-muted-foreground">
                          {helper.report}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {routines}
          </>
        )}
      </div>
    </div>
  );
}
