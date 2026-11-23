import { useState, type ReactNode } from "react";

import { ErrorState } from "../../feedback/error-state";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { ActivityRow, ActivityRowSkeleton, type ActivityEvent } from "./activity-row";
import { ContentNotice } from "@/components/feedback/content-notice";
import { RecordSection } from "@/components/layout/record-section";
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
  const [expanded, setExpanded] = useState(false);
  const visible = items;
  const hidden = visible.length - collapsedCount;
  const shown = expanded || hidden <= 0 ? visible : visible.slice(0, collapsedCount);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <RecordSection
        aria-label={label}
        className="group/activity"
        title={
          <CollapsibleTrigger asChild>
            <Button type="button" variant="disclosure" size="xs" className="-ml-2">
              Activity
              {visible.length > 0 && (
                <span className="font-normal tabular-nums">{visible.length}</span>
              )}
              <ChevronDown
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-data-[state=closed]/activity:-rotate-90"
              />
            </Button>
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          {notice}
          {!notice && loading && !visible.length && (
            <div role="status">
              <span className="sr-only">Loading activity</span>
              <ul aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <ActivityRowSkeleton key={i} />
                ))}
              </ul>
            </div>
          )}
          {!notice && error && (
            <ErrorState compact title="Couldn’t load activity" onRetry={onRetry} />
          )}
          {!notice && !loading && !error && !visible.length && (
            <ContentNotice variant="inline" title="No activity yet" />
          )}
          {!notice && shown.length > 0 && (
            <ul>
              {shown.map((event) => (
                <ActivityRow key={event.id} event={event} />
              ))}
            </ul>
          )}
          {!notice && hidden > 0 && (
            <Button
              type="button"
              size="xs"
              variant="disclosure"
              className="mt-1 -ml-2"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : `Show ${hidden} more`}
            </Button>
          )}
          {!notice && (expanded || hidden <= 0) && more}
        </CollapsibleContent>
      </RecordSection>
    </Collapsible>
  );
}
