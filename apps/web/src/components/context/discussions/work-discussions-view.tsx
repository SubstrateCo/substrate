import { useState, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { DiscussionItem, DiscussionItemSkeleton, type Discussion } from "./discussion-item";
import { ListBody } from "@/components/feedback/list-body";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { RecordSection } from "@/components/layout/record-section";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { listPhase, type ListPhase } from "@/lib/resource-state";
import { cn } from "cn";
import { ChevronDown, MessagesSquare } from "lucide-react";

export type WorkDiscussionsProps = {
  items: Discussion[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  label?: string;
  children?: ReactNode;
};

function discussionPhase({ items, loading, error }: WorkDiscussionsProps) {
  const seen = new Set<string>();
  const uniqueRows = items.filter((item) => {
    const key = `${item.messageId}:${item.purpose}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return listPhase({ items: uniqueRows, loading, error });
}

function DiscussionsBody({
  phase,
  onRetry,
  empty,
}: {
  phase: ListPhase<Discussion>;
  onRetry: () => void;
  empty: ReactNode;
}) {
  return (
    <ListBody
      phase={phase}
      loading={<DiscussionLoading />}
      error={<ErrorState variant="compact" title="Couldn’t load discussions" onRetry={onRetry} />}
      empty={empty}
      stale={<StaleNotice title="Couldn’t load discussions" onRetry={onRetry} />}
    >
      {(rows) => <DiscussionList items={rows} />}
    </ListBody>
  );
}

export function PageDiscussions(props: WorkDiscussionsProps) {
  const { label = "Related discussions", onRetry, children } = props;
  return (
    <section aria-label={label} className="flex flex-1 flex-col gap-3">
      {children}
      <DiscussionsBody
        phase={discussionPhase(props)}
        onRetry={onRetry}
        empty={
          <ContentNotice
            icon={MessagesSquare}
            title="No discussions yet"
            description="Messages linked to this record appear here when you can read them."
          />
        }
      />
    </section>
  );
}

export function InspectorDiscussions({
  emptyTitle = "No linked discussions",
  ...props
}: WorkDiscussionsProps & {
  emptyTitle?: string;
}) {
  const { label = "Related discussions", onRetry, children } = props;
  const [open, setOpen] = useState<boolean>();
  const phase = discussionPhase(props);
  if (phase.status === "empty")
    return (
      <RecordSection aria-label={label} title={label}>
        <ContentNotice variant="inline" title={emptyTitle} />
      </RecordSection>
    );
  const expanded = open ?? true;
  return (
    <Collapsible asChild open={expanded} onOpenChange={setOpen}>
      <RecordSection
        aria-label={label}
        className="group/discussions"
        title={
          <CollapsibleTrigger asChild>
            <Button type="button" variant="disclosure" size="xs" className="-ml-2">
              {label}
              {"items" in phase && (
                <span className="font-normal tabular-nums">{phase.items.length}</span>
              )}
              <ChevronDown
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-data-[state=closed]/discussions:-rotate-90"
              />
            </Button>
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          <div className="grid gap-2">
            {children}
            <DiscussionsBody phase={phase} onRetry={onRetry} empty={null} />
          </div>
        </CollapsibleContent>
      </RecordSection>
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
