import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "../primitives/button";
import { FormMessage } from "../auth/form-message";

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
  if (error)
    return (
      <aside
        aria-label="Thread"
        className="absolute inset-0 z-10 space-y-3 border-l bg-background p-5 lg:static lg:w-[380px]"
      >
        <div className="flex justify-between">
          <h2 className="font-semibold">Thread</h2>
          <Button size="icon" variant="ghost" aria-label="Close thread" onClick={onClose}>
            <X />
          </Button>
        </div>
        <FormMessage error={error} />
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </aside>
    );
  return (
    <aside
      aria-label="Thread"
      className="absolute inset-0 z-10 flex min-h-0 flex-col border-l bg-background lg:static lg:w-[380px] lg:shrink-0 xl:w-[420px]"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-5">
        <h2 className="font-semibold">Thread</h2>
        <Button size="icon" variant="ghost" aria-label="Close thread" onClick={onClose}>
          <X />
        </Button>
      </header>
      {root && <div className="max-h-[35%] overflow-y-auto border-b">{root}</div>}
      {loading && (
        <p role="status" className="p-5 text-sm text-muted-foreground">
          Loading replies…
        </p>
      )}
      {replies}
      {!loading && empty && (
        <p className="p-5 text-sm text-muted-foreground">No replies yet. Start the thread.</p>
      )}
      <div className="mt-auto">{composer}</div>
    </aside>
  );
}
