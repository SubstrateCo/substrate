import type { HelperStatus } from "@startup-os/contracts/agent-work";

import type { ReactNode } from "react";

import { WorkIndicator } from "../work-indicator";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SettingsSection } from "@/components/layout/settings-section";
import type { WorkStatus } from "@/lib/agent-work/status";
import { formatDateTime, formatFullTimestamp } from "@/lib/format/date";
import { cn } from "cn";
import { Activity, ChevronRight } from "lucide-react";

export type ActivityRow = {
  id: string;
  /** What the work did, such as its latest activity line or "Replied". */
  summary: string;
  /** Where it happened, already access-checked: "In #launch" or a placeholder. */
  place?: string;
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

export type HelperRow = { id: string; task: string; status: HelperStatus; report: string | null };

const helperStatusLabels: Record<HelperStatus, string> = {
  running: "Running",
  finished: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

/** One agent's work on its home desktop, including silent, routine, and helper work. */
export function AgentActivityView({
  name,
  rows,
  helpers,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onMore,
  onTranscript,
}: {
  name: string;
  rows: ActivityRow[];
  helpers: HelperRow[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onTranscript: (turnId: string) => void;
}) {
  return (
    <div className="grid gap-8">
      <SettingsSection
        title="Activity"
        description="Everything this agent worked on, newest first. Open a row to see its transcript."
      >
        {error && <ErrorState compact title="Couldn’t load activity" onRetry={onRetry} />}
        {loading && <LoadingState label="Loading activity" variant="compact" />}
        {!loading && !error && !rows.length && (
          <ContentNotice
            icon={Activity}
            title="No work yet"
            description={`When you message ${name} or one of its routines runs, the work shows here.`}
          />
        )}
        {rows.length > 0 && (
          <ul aria-label="Activity" className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map((row) => (
              <li key={row.id} className="grid">
                <button
                  type="button"
                  aria-current={row.selected ? "true" : undefined}
                  onClick={() => onTranscript(row.id)}
                  className={cn(
                    "flex w-full min-w-0 items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset",
                    row.selected && "bg-row-selected hover:bg-row-selected",
                  )}
                >
                  <span className="relative mt-1 size-3 shrink-0">
                    <WorkIndicator tone={row.status.tone} label={row.status.label} />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span
                      className={cn(
                        "truncate text-sm",
                        row.selected && "font-medium text-row-selected-foreground",
                      )}
                    >
                      {row.summary}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        row.kind,
                        row.unattended && "background",
                        row.place,
                        row.status.label !== row.summary && row.status.label,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <time
                    dateTime={row.createdAt}
                    title={formatFullTimestamp(row.createdAt)}
                    className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {formatDateTime(row.createdAt)}
                  </time>
                </button>
                {row.attention && <div className="px-4 pb-3">{row.attention}</div>}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <PendingButton
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            pending={loadingMore}
            pendingLabel="Loading older work…"
            onClick={onMore}
          >
            Show older work
          </PendingButton>
        )}
      </SettingsSection>
      {helpers.length > 0 && (
        <SettingsSection
          title="Helpers"
          description="Short tasks this agent handed to helpers, with their reports."
        >
          <ul aria-label="Helpers" className="divide-y overflow-hidden rounded-xl border bg-card">
            {helpers.map((helper) => (
              <li key={helper.id} className="text-sm">
                {helper.report ? (
                  <details className="group">
                    <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-4 py-2.5 hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none"
                      />
                      <span className="min-w-0 flex-1 truncate">{helper.task}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {helperStatusLabels[helper.status]}
                      </span>
                    </summary>
                    <div className="grid gap-1 border-t bg-muted/30 px-4 py-3 pl-10">
                      <p className="text-xs font-medium text-muted-foreground">Report</p>
                      <p className="text-sm wrap-anywhere whitespace-pre-wrap">{helper.report}</p>
                    </div>
                  </details>
                ) : (
                  <div className="flex min-w-0 items-center gap-2 px-4 py-2.5 pl-10">
                    <span className="min-w-0 flex-1 truncate">{helper.task}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {helperStatusLabels[helper.status]}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}
    </div>
  );
}
