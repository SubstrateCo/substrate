import { useState, type ReactNode } from "react";

import { ErrorState } from "../../feedback/error-state";
import { ActivityRow, ActivityRowSkeleton, type ActivityEvent } from "./activity-row";
import { ContentNotice } from "@/components/feedback/content-notice";
import { RecordSection } from "@/components/layout/record-section";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

// Show the newest events first; older ones stay one click away.
const collapsedCount = 5;

export function TaskActivity({
  items,
  loading,
  error,
  onRetry,
  label = "Task activity",
  notice,
  more,
}: {
  items: ActivityEvent[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  label?: string;
  /** Replaces the list, such as when the record's activity is unavailable. */
  notice?: ReactNode;
  /** A control that loads older pages, after the rows. */
  more?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  // Kept here: the collapsed content unmounts, and reopening keeps the expanded list.
  const [expanded, setExpanded] = useState(false);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <RecordSection
        aria-label={label}
        className="group/activity"
        title={
          <CollapsibleTrigger asChild>
            <Button type="button" variant="disclosure" size="xs" className="-ml-2">
              Activity
              {items.length > 0 && <span className="font-normal tabular-nums">{items.length}</span>}
              <ChevronDown
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-data-[state=closed]/activity:-rotate-90"
              />
            </Button>
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          {notice || (
            <ActivityList
              items={items}
              loading={loading}
              error={error}
              onRetry={onRetry}
              more={more}
              expanded={expanded}
              onExpandedChange={setExpanded}
            />
          )}
        </CollapsibleContent>
      </RecordSection>
    </Collapsible>
  );
}

function ActivityList({
  items,
  loading,
  error,
  onRetry,
  more,
  expanded,
  onExpandedChange,
}: {
  items: ActivityEvent[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  more?: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const hidden = items.length - collapsedCount;
  const shown = expanded || hidden <= 0 ? items : items.slice(0, collapsedCount);
  return (
    <>
      {loading && !items.length && (
        <div role="status">
          <span className="sr-only">Loading activity</span>
          <ul aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <ActivityRowSkeleton key={i} />
            ))}
          </ul>
        </div>
      )}
      {error && <ErrorState compact title="Couldn’t load activity" onRetry={onRetry} />}
      {!loading && !error && !items.length && (
        <ContentNotice variant="inline" title="No activity yet" />
      )}
      {shown.length > 0 && (
        <ul>
          {shown.map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <Button
          type="button"
          size="xs"
          variant="disclosure"
          className="mt-1 -ml-2"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </Button>
      )}
      {(expanded || hidden <= 0) && more}
    </>
  );
}
