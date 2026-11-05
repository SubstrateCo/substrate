import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "../primitives/button";
import { PaneState } from "../feedback/pane-state";
import { ErrorState } from "../feedback/error-state";
import { isAccessFailure } from "../feedback/request-failure";

export function ThreadPane({
  root,
  onClose,
  loading = false,
  error,
  onRetry,
  replies,
  composer,
}: {
  root?: ReactNode;
  onClose: () => void;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  replies?: ReactNode;
  composer: ReactNode;
}) {
  const blocked = !!error && (!replies || isAccessFailure(error));
  return (
    <aside
      aria-label="Thread"
      className="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col border-l bg-surface shadow-raised lg:static lg:w-95 lg:shrink-0 xl:w-105"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card/60 px-5">
        <h2 className="font-semibold">Thread</h2>
        <Button size="icon" variant="ghost" aria-label="Close thread" onClick={onClose}>
          <X />
        </Button>
      </header>
      {blocked ? (
        <PaneState label="Thread unavailable" error={error} onRetry={onRetry} />
      ) : (
        <>
          {error && (
            <div className="p-3">
              <ErrorState
                compact
                title="Couldn’t refresh replies"
                description="Your loaded replies are still available. Try again to update this thread."
                onRetry={onRetry}
              />
            </div>
          )}
          {root && <div className="max-h-7/20 shrink-0 overflow-y-auto border-b">{root}</div>}
          {loading ? <PaneState label="Loading replies…" /> : replies}
        </>
      )}
      {!blocked && <div className="mt-auto shrink-0">{composer}</div>}
    </aside>
  );
}
