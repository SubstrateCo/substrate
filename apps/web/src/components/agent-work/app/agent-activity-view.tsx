import type { HelperStatus } from "@substrate/contracts/agent-work";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { SettingsSection } from "@/components/layout/settings-section";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { Timestamp } from "@/components/time/timestamp";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "cn";
import { Activity, ChevronRight } from "lucide-react";

const activityRowClass = "grid w-full min-w-0 gap-1 px-4 py-2.5 text-left";

function ActivityRowContent({
  summary,
  time,
  status,
  place,
}: {
  summary: ReactNode;
  time: ReactNode;
  status: ReactNode;
  place: ReactNode;
}) {
  return (
    <>
      <span className="flex min-w-0 items-baseline gap-3">
        {summary}
        {time}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {status}
        <span className="min-w-0 truncate text-xs text-muted-foreground">{place}</span>
      </span>
    </>
  );
}

function ActivityRowsLoading() {
  return (
    <div role="status" aria-label="Loading activity">
      <ul aria-hidden="true" className="divide-y overflow-hidden rounded-xl border bg-card">
        {[0, 1, 2].map((i) => (
          <li key={i} className="grid">
            <div className={activityRowClass}>
              <ActivityRowContent
                summary={
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <SkeletonText width="14rem" />
                  </span>
                }
                time={
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <SkeletonText width="3rem" />
                  </span>
                }
                status={
                  <span className="text-xs">
                    <SkeletonText width="4rem" />
                  </span>
                }
                place={<SkeletonText width="9rem" />}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type ActivityRow = {
  id: string;
  /** What the work did, such as its latest activity line or "Replied". */
  summary: string;
  /** Where it happened, already access-checked: "In #launch" or a placeholder. */
  place?: string;
  /** Direct message, Thread, Routine, or Helper. */
  kind: string;
  /** The status tag. The container passes one with its own clock for live work. */
  status: ReactNode;
  createdAt: string;
  selected: boolean;
  /** One line of reviewed copy for work that failed, since the row has no card. */
  note?: string;
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
        {loading && !rows.length && <ActivityRowsLoading />}
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
                    activityRowClass,
                    "transition-colors hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none",
                    row.selected && "bg-row-selected hover:bg-row-selected",
                  )}
                >
                  <ActivityRowContent
                    summary={
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          row.selected && "font-medium text-row-selected-foreground",
                        )}
                      >
                        {row.summary}
                      </span>
                    }
                    time={
                      <Timestamp
                        value={row.createdAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      />
                    }
                    status={row.status}
                    place={[row.kind, row.place].filter(Boolean).join(" · ")}
                  />
                  {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
                </button>
                {row.attention}
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
                <Collapsible className="group/helper">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/helper:rotate-90 motion-reduce:transition-none"
                      />
                      <span className="min-w-0 flex-1 truncate">{helper.task}</span>
                      <Tag className="shrink-0">{helperStatusLabels[helper.status]}</Tag>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-3 border-t bg-inset px-4 py-3 pl-10">
                      <div className="grid gap-1">
                        <p className="text-xs font-medium text-muted-foreground">Task</p>
                        <p className="text-sm wrap-anywhere whitespace-pre-wrap">{helper.task}</p>
                      </div>
                      <div className="grid gap-1">
                        <p className="text-xs font-medium text-muted-foreground">Report</p>
                        {helper.report ? (
                          <MessageMarkdown body={helper.report} />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {helper.status === "running"
                              ? "No report yet."
                              : "This helper left no report."}
                          </p>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}
    </div>
  );
}
