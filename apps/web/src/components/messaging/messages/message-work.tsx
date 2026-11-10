import type { TaskStatus } from "@startup-os/contracts/tasks";

import { useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { MessageWorkTile } from "./message-work-tile";

export type MessageWorkLink = {
  entityId: string;
  entityType: "task" | "project";
  title: string;
  href: string;
  status?: TaskStatus | null;
  statusName?: string | null;
  purpose: string;
  canRemove: boolean;
};

// Longer lists collapse so a message with many links stays short.
const collapsedCount = 3;

/** Work attached to a message, as compact rows under the body. Takes no space when empty. */
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
  if (error && !isAccessFailure(error))
    return (
      <div className="mt-1.5 max-w-120">
        <ErrorState compact title="Couldn’t load linked work" onRetry={onRetry} />
      </div>
    );
  if (error || !links.length) return null;
  const hidden = links.length - collapsedCount;
  const shown = expanded || hidden <= 0 ? links : links.slice(0, collapsedCount);
  return (
    <ul aria-label="Linked work" className="mt-1.5 flex max-w-120 flex-col gap-1">
      {shown.map((link) => (
        <MessageWorkTile key={link.entityId} link={link} removing={removing} onRemove={onRemove} />
      ))}
      {hidden > 0 && (
        <li>
          <Button
            type="button"
            size="xs"
            variant="disclosure"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : `Show ${hidden} more`}
          </Button>
        </li>
      )}
    </ul>
  );
}
