import { useEffect, useRef, type ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { X } from "lucide-react";

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
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const media = window.matchMedia("(min-width: 1024px)");
    const focusOverlay = () => {
      if (!media.matches) close.current?.focus();
    };
    focusOverlay();
    media.addEventListener("change", focusOverlay);
    return () => {
      media.removeEventListener("change", focusOverlay);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <aside
      aria-label="Thread"
      className="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-surface shadow-raised lg:static lg:flex-1 lg:shadow-none"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card/60 px-4">
        <h2 className="font-semibold">Thread</h2>
        <Button
          ref={close}
          size="icon-sm"
          variant="ghost"
          aria-label="Close thread"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      {blocked ? (
        <PaneState label="Thread unavailable" error={error} onRetry={onRetry} />
      ) : (
        <>
          {error && (
            <p role="status" className="p-3 text-xs text-muted-foreground">
              Replies may be out of date.
            </p>
          )}
          {root && <div className="max-h-7/20 shrink-0 overflow-y-auto border-b">{root}</div>}
          {loading && !replies ? <PaneState label="Loading replies…" /> : replies}
        </>
      )}
      {!blocked && <div className="mt-auto shrink-0">{composer}</div>}
    </aside>
  );
}
