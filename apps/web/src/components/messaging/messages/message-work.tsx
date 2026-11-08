import { useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { MessageWorkTile } from "./message-work-tile";
import { ChevronDown, Link2 } from "lucide-react";

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
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const visible = isAccessFailure(error) ? [] : links;
  if (!loading && !error && !visible.length) return null;
  const hidden = visible.length - collapsedCount;
  const shown = expanded || hidden <= 0 ? visible : visible.slice(0, collapsedCount);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <section
        aria-label="Linked work"
        className="group/linked mt-2 max-w-lg overflow-hidden rounded-lg border bg-card text-card-foreground"
      >
        <div className="p-1 group-data-[state=open]/linked:border-b">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="disclosure" size="sm" className="w-full justify-start">
              <Link2 aria-hidden="true" />
              Linked work
              {visible.length > 0 && (
                <span className="text-muted-foreground tabular-nums">· {visible.length}</span>
              )}
              <ChevronDown
                aria-hidden="true"
                className="ml-auto transition-transform group-data-[state=closed]/linked:-rotate-90"
              />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {loading && <LoadingState label="Loading linked work" variant="compact" />}
          {error && <ErrorState compact title="Couldn't load linked work" onRetry={onRetry} />}
          {shown.length > 0 && (
            <ul className="divide-y divide-border/60 py-0.5">
              {shown.map((link) => (
                <MessageWorkTile
                  key={`${link.entityId}:${link.purpose}`}
                  link={link}
                  removing={removing}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <div className="border-t px-1 py-1">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show less" : `Show ${hidden} more`}
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
