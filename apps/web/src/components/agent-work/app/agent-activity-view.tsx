import type { HelperStatus } from "@substrate/contracts/agent-work";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { rowStateVariants, rowTitleVariants } from "@/components/layout/row-state";
import { SettingsList, SettingsSection } from "@/components/layout/settings-section";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { Timestamp } from "@/components/time/timestamp";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemHeader, ItemMedia } from "@/components/ui/item";
import { cn } from "cn";
import { Activity, ChevronRight } from "lucide-react";

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
      <ItemHeader>
        {summary}
        <ItemActions>{time}</ItemActions>
      </ItemHeader>
      <span className="flex min-w-0 items-center gap-2">
        {status}
        <span className="min-w-0 truncate text-xs text-muted-foreground">{place}</span>
      </span>
    </>
  );
}

function ActivityRowsLoading() {
  return (
    <div role="status" aria-label="Loading work">
      <SettingsList hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="grid">
            <Item size="xs">
              <ItemContent className="min-w-0">
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
              </ItemContent>
            </Item>
          </li>
        ))}
      </SettingsList>
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

/** A row of work, or two or more finished routine runs folded into one. */
export type ActivityItem =
  | { kind: "row"; row: ActivityRow }
  | { kind: "routines"; id: string; rows: ActivityRow[] };

export type HelperRow = { id: string; task: string; status: HelperStatus; report: string | null };

function ActivityRowButton({
  row,
  onTranscript,
}: {
  row: ActivityRow;
  onTranscript: (turnId: string) => void;
}) {
  return (
    <Item asChild size="xs">
      <button
        type="button"
        aria-current={row.selected ? "true" : undefined}
        onClick={() => onTranscript(row.id)}
        className={cn("text-left", rowStateVariants({ selected: row.selected }))}
      >
        <ItemContent className="min-w-0">
          <ActivityRowContent
            summary={
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  rowTitleVariants({ selected: row.selected }),
                )}
              >
                {row.summary}
              </span>
            }
            time={
              <Timestamp value={row.createdAt} className="shrink-0 text-xs text-muted-foreground" />
            }
            status={row.status}
            place={[row.kind, row.place].filter(Boolean).join(" · ")}
          />
          {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
        </ItemContent>
      </button>
    </Item>
  );
}

/**
 * Finished routine runs in a row, folded so they don't push other work out of view. It opens on
 * its own when it holds the selected run.
 */
function RoutineRunsGroup({
  rows,
  onTranscript,
}: {
  rows: ActivityRow[];
  onTranscript: (turnId: string) => void;
}) {
  // A group always holds two or more runs, newest first.
  const newest = rows[0];
  return (
    <Collapsible className="group/runs" defaultOpen={rows.some((row) => row.selected)}>
      <CollapsibleTrigger asChild>
        <Item asChild size="xs">
          <button type="button" className="text-left hover:bg-row-hover">
            <ItemMedia>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/runs:rotate-90 motion-reduce:transition-none"
              />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <span className="truncate text-sm">{rows.length} routine runs finished</span>
            </ItemContent>
            <ItemActions>
              <Timestamp
                value={newest.createdAt}
                className="shrink-0 text-xs text-muted-foreground"
              />
            </ItemActions>
          </button>
        </Item>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul aria-label={`${rows.length} routine runs`} className="divide-y border-t bg-inset pl-6">
          {rows.map((row) => (
            <li key={row.id} className="grid">
              <ActivityRowButton row={row} onTranscript={onTranscript} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

const helperStatusLabels: Record<HelperStatus, string> = {
  running: "Running",
  finished: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

/** One agent's work, including silent, routine, and helper work. */
export function AgentActivityView({
  name,
  items,
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
  items: ActivityItem[];
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
        title="Work"
        description="Everything this agent worked on, newest first, including routines and helpers. Open a row to see its transcript."
      >
        {error && <ErrorState variant="compact" title="Couldn’t load work" onRetry={onRetry} />}
        {loading && !items.length && <ActivityRowsLoading />}
        {!loading && !error && !items.length && (
          <ContentNotice
            icon={Activity}
            title="No work yet"
            description={`When you message ${name} or one of its routines runs, the work shows here.`}
          />
        )}
        {items.length > 0 && (
          <SettingsList label="Work">
            {items.map((item) =>
              item.kind === "row" ? (
                <li key={item.row.id} className="grid">
                  <ActivityRowButton row={item.row} onTranscript={onTranscript} />
                  {item.row.attention}
                </li>
              ) : (
                <li key={`routines:${item.id}`} className="grid">
                  <RoutineRunsGroup rows={item.rows} onTranscript={onTranscript} />
                </li>
              ),
            )}
          </SettingsList>
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
          <SettingsList label="Helpers">
            {helpers.map((helper) => (
              <li key={helper.id} className="text-sm">
                <Collapsible className="group/helper">
                  <CollapsibleTrigger asChild>
                    <Item asChild size="xs">
                      <button type="button" className="text-left hover:bg-row-hover">
                        <ItemMedia>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/helper:rotate-90 motion-reduce:transition-none"
                          />
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                          <span className="truncate">{helper.task}</span>
                        </ItemContent>
                        <ItemActions>
                          <Tag>{helperStatusLabels[helper.status]}</Tag>
                        </ItemActions>
                      </button>
                    </Item>
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
          </SettingsList>
        </SettingsSection>
      )}
    </div>
  );
}
