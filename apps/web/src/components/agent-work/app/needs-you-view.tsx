import type { ReactNode } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
      <header className="shrink-0 space-y-1 px-4 pt-5 sm:px-6 sm:pt-6">
        <h1 className="text-xl font-semibold tracking-tight">Needs you</h1>
        <p className="text-sm text-muted-foreground">
          Questions, approvals, and stopped work from your agents.
        </p>
      </header>
      <div className="grid gap-4 p-4 sm:p-6">
        {error && <ErrorState title="Couldn’t load what needs you" onRetry={onRetry} />}
        {loading && <LoadingState label="Loading what needs you" variant="compact" />}
        {!loading && !error && !entries.length && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCheck aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                <h2>Nothing needs you</h2>
              </EmptyTitle>
              <EmptyDescription>
                When an agent asks a question or proposes an action, it shows here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {entries.length > 0 && (
          <ul aria-label="Needs you" className="grid gap-4">
            {entries.map((entry) => (
              <li key={entry.key} className="min-w-0">
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
