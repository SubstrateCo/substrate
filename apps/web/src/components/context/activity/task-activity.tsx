import { useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { ActivityRow, ActivityRowSkeleton, type ActivityEvent } from "./activity-row";
import { ChevronDown } from "lucide-react";

// Show the newest events first; older ones stay one click away.
const collapsedCount = 5;

export function TaskActivity({
  items,
  loading,
  error,
  onRetry,
}: {
  items: ActivityEvent[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const visible = items;
  const hidden = visible.length - collapsedCount;
  const shown = expanded || hidden <= 0 ? visible : visible.slice(0, collapsedCount);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <section aria-label="Task activity" className="group/activity space-y-1">
        <h3 className="flex h-7 items-center">
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
        </h3>
        <CollapsibleContent>
          {loading && !visible.length && (
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
          {!loading && !error && !visible.length && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
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
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : `Show ${hidden} more`}
            </Button>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
