import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";

export type NeedsYouEntry = {
  key: string;
  agentName: string;
  /** Where it comes from, already access-checked. */
  place: ReactNode;
  /** The request card, or a line for an agent that stopped. */
  body: ReactNode;
  onOpenAgent?: () => void;
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
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl gap-6 p-6">
        <PageHeader
          title="Needs you"
          description="Questions, approvals, and stopped work from your agents."
        />
        {error && <ErrorState title="Couldn’t load what needs you" onRetry={onRetry} />}
        {loading && <LoadingState label="Loading what needs you" variant="compact" />}
        {!loading && !error && !entries.length && (
          <ContentNotice
            icon={CheckCheck}
            title="Nothing needs you"
            description="When an agent asks a question or proposes an action, it shows here."
          />
        )}
        {entries.length > 0 && (
          <ul aria-label="Needs you" className="grid gap-5">
            {entries.map((entry) => (
              <li key={entry.key} className="grid min-w-0 gap-1.5">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{entry.agentName}</span>
                  {entry.place}
                  {entry.onOpenAgent && (
                    <Button type="button" size="xs" variant="link" onClick={entry.onOpenAgent}>
                      Open activity
                    </Button>
                  )}
                </p>
                {entry.body}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
