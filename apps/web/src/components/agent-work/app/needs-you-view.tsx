import { Link, type LinkProps } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { ListBody } from "@/components/feedback/list-body";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageHeader } from "@/components/layout/page-header";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { useListMotion } from "@/components/motion/use-list-motion";
import { Button } from "@/components/ui/button";
import { listPhase } from "@/lib/resource-state";
import { CheckCheck, Hand } from "lucide-react";

export type NeedsYouEntry = {
  key: string;
  agentName: string;
  /** Where it comes from, already access-checked. */
  place: ReactNode;
  /** The request card, or a line for an agent that stopped. */
  body: ReactNode;
  agentLink?: LinkProps;
};

/** Everything that waits for the owner, from every agent. Works from any device. */
export function NeedsYouView({
  entries,
  loading,
  error,
  onRetry,
}: {
  entries: NeedsYouEntry[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  // An answered entry fades out and the entries below glide up. The container also holds the
  // last entry's exit while the empty notice replaces the list.
  const page = useListMotion<HTMLDivElement>("top", "fade");
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div ref={page} className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6">
        <PageHeader
          title="Needs you"
          description="Questions, approvals, and stopped work from your agents."
        />
        <ListBody
          phase={listPhase({ items: entries, loading, error })}
          loading={
            <div role="status" aria-label="Loading what needs you">
              <ul aria-hidden="true" className="grid gap-5">
                {[0, 1].map((i) => (
                  <li key={i} className="grid min-w-0 gap-1.5">
                    <p className="text-xs">
                      <SkeletonText width="10rem" />
                    </p>
                    <MessageCard
                      icon={Hand}
                      tone="attention"
                      title={<SkeletonText width="12rem" />}
                    >
                      <MessageCardBody>
                        <SkeletonText width="18rem" />
                        <SkeletonText width="12rem" />
                      </MessageCardBody>
                    </MessageCard>
                  </li>
                ))}
              </ul>
            </div>
          }
          error={<ErrorState title="Couldn’t load what needs you" onRetry={onRetry} />}
          empty={
            <ContentNotice
              icon={CheckCheck}
              title="Nothing needs you"
              description="When an agent asks a question or proposes an action, it shows here."
            />
          }
          stale={<StaleNotice title="Couldn’t load what needs you" onRetry={onRetry} />}
        >
          {(rows) => (
            <ul aria-label="Needs you" className="grid gap-5">
              {rows.map((entry) => (
                <li key={entry.key} data-motion-key={entry.key} className="grid min-w-0 gap-1.5">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {entry.agentLink ? (
                      <Button
                        asChild
                        size="xs"
                        variant="link"
                        className="-mx-2"
                        aria-label={`${entry.agentName}, open agent`}
                      >
                        <Link {...entry.agentLink}>{entry.agentName}</Link>
                      </Button>
                    ) : (
                      <span className="font-medium text-foreground">{entry.agentName}</span>
                    )}
                    <span aria-hidden="true">·</span>
                    {entry.place}
                  </p>
                  {entry.body}
                </li>
              ))}
            </ul>
          )}
        </ListBody>
      </div>
    </div>
  );
}
