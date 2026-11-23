import { useState, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { DiscussionItem, DiscussionItemSkeleton, type Discussion } from "./discussion-item";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { cn } from "cn";
import { ChevronDown, MessagesSquare } from "lucide-react";

/**
 * Messages that link or reference a record. A page shows them as a list with a full empty state.
 * An inspector shows a one-line section that opens when there is something to read.
 */
export function WorkDiscussions({
  items,
  loading,
  error,
  onRetry,
  label = "Related discussions",
  variant = "inspector",
  children,
}: {
  items: Discussion[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  label?: string;
  variant?: "inspector" | "page";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>();
  const seen = new Set<string>();
  const uniqueRows = items.filter((item) => {
    const key = `${item.messageId}:${item.purpose}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const list = <DiscussionList items={uniqueRows} />;
  const failure = error && (
    <ErrorState compact title="Couldn’t load discussions" onRetry={onRetry} />
  );
  const empty = !loading && !error && !uniqueRows.length;
  const showLoading = loading && !uniqueRows.length;
  if (variant === "page")
    return (
      <section aria-label={label} className="space-y-3">
        {children}
        {showLoading && <DiscussionLoading />}
        {failure}
        {empty && (
          <ContentNotice
            icon={MessagesSquare}
            title="No discussions yet"
            description="Messages linked to this record appear here when you can read them."
          />
        )}
        {list}
      </section>
    );
  if (empty)
    return (
      <section aria-label={label} className="space-y-1">
        <h3 className="flex h-7 items-center text-xs font-medium text-muted-foreground">{label}</h3>
        <ContentNotice variant="inline" title="No linked discussions" />
      </section>
    );
  const expanded = open ?? (uniqueRows.length > 0 || !!error || showLoading);
  return (
    <Collapsible asChild open={expanded} onOpenChange={setOpen}>
      <section aria-label={label} className="group/discussions space-y-2">
        <h3 className="flex h-7 items-center">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="disclosure" size="xs" className="-ml-2">
              {label}
              {!!uniqueRows.length && <span className="tabular-nums">{uniqueRows.length}</span>}
              <ChevronDown
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-data-[state=closed]/discussions:-rotate-90"
              />
            </Button>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent>
          <div className="space-y-2">
            {children}
            {showLoading && <DiscussionLoading />}
            {failure}
            {list}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function DiscussionLoading() {
  const showLoading = useDelayedLoading(true);
  return (
    <div role="status" className={cn(!showLoading && "invisible")}>
      <span className="sr-only">Loading discussions</span>
      <ul aria-hidden="true" className="space-y-2">
        <DiscussionItemSkeleton />
        <DiscussionItemSkeleton />
      </ul>
    </div>
  );
}

function DiscussionList({ items }: { items: Discussion[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <DiscussionItem key={`${item.messageId}:${item.purpose}`} item={item} />
      ))}
    </ul>
  );
}
