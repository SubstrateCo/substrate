import { useEffect, useRef, type ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageAside } from "@/components/layout/page-layout";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ResourceStatus } from "@/lib/resource-state";
import { X } from "lucide-react";

export function ThreadPane({
  root,
  state,
  conversationLabel,
  onClose,
  loading = false,
  error,
  onRetry,
  replies,
  composer,
}: {
  root?: ReactNode;
  state: ResourceStatus;
  conversationLabel: string;
  onClose: () => void;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  replies?: ReactNode;
  composer: ReactNode;
}) {
  const blocked = state === "error" || state === "unavailable";
  const close = useRef<HTMLButtonElement>(null);
  const wide = useMediaQuery("(min-width: 1024px)");
  // Runs before the focus effect below, so it remembers where focus was before the thread opened.
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  // Below `lg` the thread covers the page, so focus moves into it.
  useEffect(() => {
    if (!wide) close.current?.focus();
  }, [wide]);
  return (
    <PageAside aria-label="Thread">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card/60 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-sm font-semibold">Thread</h2>
          <Button variant="link" size="xs" className="min-w-0" onClick={onClose}>
            <span className="truncate text-muted-foreground">{conversationLabel}</span>
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={close}
              size="icon-sm"
              variant="ghost"
              aria-label="Close thread"
              onClick={onClose}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close thread</TooltipContent>
        </Tooltip>
      </header>
      {blocked ? (
        <PaneState
          label="Thread unavailable"
          error={error}
          onRetry={state === "unavailable" ? undefined : onRetry}
        />
      ) : (
        <>
          {state === "stale" && <StaleNotice>Replies may be out of date.</StaleNotice>}
          {root && (
            <div className="max-h-7/20 shrink-0 overflow-y-auto border-b pt-4 pb-2">{root}</div>
          )}
          {loading && !replies ? <PaneState label="Loading replies…" /> : replies}
        </>
      )}
      {!blocked && <div className="mt-auto shrink-0">{composer}</div>}
    </PageAside>
  );
}
