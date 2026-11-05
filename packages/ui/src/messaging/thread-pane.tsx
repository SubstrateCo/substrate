import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "../primitives/button";
import { PaneState } from "../feedback/pane-state";

export function ThreadPane({
  root,
  onClose,
  loading = false,
  error,
  onRetry,
  replies,
  empty = false,
  composer,
}: {
  root?: ReactNode;
  onClose: () => void;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  replies?: ReactNode;
  empty?: boolean;
  composer: ReactNode;
}) {
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
      {error ? (
        <PaneState label="Thread unavailable" error={error} onRetry={onRetry} />
      ) : (
        <>
          {root && <div className="max-h-[35%] shrink-0 overflow-y-auto border-b">{root}</div>}
          {loading ? <PaneState label="Loading replies…" /> : replies}
          {!loading && empty && (
            <p className="p-5 text-sm text-muted-foreground">No replies yet. Start the thread.</p>
          )}
        </>
      )}
      {!error && <div className="mt-auto shrink-0">{composer}</div>}
    </aside>
  );
}
