import { useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { MessageCard, MessageCardBody, MessageCardRow, MessageCardRows } from "./message-card";
import { MessageWorkTile } from "./message-work-tile";
import { Link2 } from "lucide-react";

export type MessageWorkLink = {
  entityId: string;
  entityType: "task" | "project";
  title: string;
  href: string;
  statusName?: string | null;
  purpose: string;
  canRemove: boolean;
};

// Longer lists collapse so a message with many links stays short.
const collapsedCount = 3;

export function MessageWork({
  links,
  loading = false,
  error,
  onRetry,
  onRemove,
  removing = false,
}: {
  links: MessageWorkLink[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onRemove?: (entityId: string) => void;
  removing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = isAccessFailure(error) ? [] : links;
  if (!loading && !error && !visible.length) return null;
  const hidden = visible.length - collapsedCount;
  const shown = expanded || hidden <= 0 ? visible : visible.slice(0, collapsedCount);
  return (
    <MessageCard
      icon={Link2}
      title="Linked work"
      meta={visible.length > 0 ? visible.length : undefined}
      collapsible
    >
      {loading && (
        <MessageCardBody>
          <LoadingState label="Loading linked work" variant="compact" />
        </MessageCardBody>
      )}
      {error && (
        <MessageCardBody>
          <ErrorState compact title="Couldn't load linked work" onRetry={onRetry} />
        </MessageCardBody>
      )}
      {shown.length > 0 && (
        <MessageCardRows>
          {shown.map((link) => (
            <MessageWorkTile
              key={`${link.entityId}:${link.purpose}`}
              link={link}
              removing={removing}
              onRemove={onRemove}
            />
          ))}
        </MessageCardRows>
      )}
      {hidden > 0 && (
        <MessageCardRows>
          <MessageCardRow className="py-0.5 pl-1.5">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : `Show ${hidden} more`}
            </Button>
          </MessageCardRow>
        </MessageCardRows>
      )}
    </MessageCard>
  );
}
