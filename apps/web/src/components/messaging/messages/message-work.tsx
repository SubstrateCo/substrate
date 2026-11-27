import type { ContextEntityType } from "@substrate/contracts/context/input";
import type { TaskStatus } from "@substrate/contracts/tasks";

import { useState, type ReactNode } from "react";

import { ErrorState } from "../../feedback/error-state";
import { MessageWorkItem } from "./message-work-item";
import { Button } from "@/components/ui/button";
import type { RecordLink } from "@/lib/navigation/record-links";

export type MessageWorkLink = {
  entityId: string;
  entityType: ContextEntityType;
  title: string;
  link: RecordLink;
  status?: TaskStatus | null;
  statusName?: string | null;
  purpose: string;
  canRemove: boolean;
  unavailable?: boolean;
};

// Longer lists collapse so a message with many links stays short.
const collapsedCount = 6;

/**
 * Work attached to a message, as labelled lines under the body: what the message created, then
 * what it links to. Takes no space when empty.
 */
export function MessageWork({
  links,
  error,
  onRetry,
  onRemove,
  removing = false,
}: {
  links: MessageWorkLink[];
  error?: Error | null;
  onRetry?: () => void;
  onRemove?: (entityId: string) => void;
  removing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (error)
    return (
      <div className="mt-1.5 max-w-120">
        <ErrorState variant="compact" title="Couldn’t load linked work" onRetry={onRetry} />
      </div>
    );
  if (!links.length) return null;
  const created = links.filter((link) => link.purpose === "source");
  const linked = links.filter((link) => link.purpose !== "source");
  const hidden = linked.length - collapsedCount;
  const shown = expanded || hidden <= 0 ? linked : linked.slice(0, collapsedCount);
  const item = (link: MessageWorkLink) => (
    <MessageWorkItem key={link.entityId} link={link} removing={removing} onRemove={onRemove} />
  );
  return (
    <div className="mt-1 flex flex-col border-l-2 pl-3">
      {created.length > 0 && (
        <WorkLine label="Created" listLabel="Created from this message">
          {created.map(item)}
        </WorkLine>
      )}
      {shown.length > 0 && (
        <WorkLine label="Linked" listLabel="Linked work">
          {shown.map(item)}
          {hidden > 0 && (
            <li>
              <Button
                type="button"
                size="xs"
                variant="disclosure"
                className="-ml-2"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show less" : `Show ${hidden} more`}
              </Button>
            </li>
          )}
        </WorkLine>
      )}
    </div>
  );
}

/** One group: a quiet label, then its records wrapping like text. */
function WorkLine({
  label,
  listLabel,
  children,
}: {
  label: string;
  listLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <span aria-hidden="true" className="w-12 shrink-0 text-xs/6 text-muted-foreground">
        {label}
      </span>
      {/* The gap and end padding hold each record's Unlink button. */}
      <ul aria-label={listLabel} className="flex min-w-0 flex-1 flex-wrap gap-x-5 pr-5">
        {children}
      </ul>
    </div>
  );
}
