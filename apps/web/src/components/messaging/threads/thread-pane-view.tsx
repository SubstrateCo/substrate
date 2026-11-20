import { useEffect, useRef, type ReactNode } from "react";

import { PaneState } from "../../feedback/pane-state";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { PageAside, useAsideCovers } from "@/components/layout/page-layout";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
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
  const covers = useAsideCovers();
  // Runs before the focus effect below, so it remembers where focus was before the thread opened.
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  // When the thread covers the page, focus moves into it.
  useEffect(() => {
    if (covers) close.current?.focus();
  }, [covers]);
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
          {loading && !replies ? <MessageLoading label="Loading replies…" /> : replies}
        </>
      )}
      {!blocked && <div className="mt-auto shrink-0">{composer}</div>}
    </PageAside>
  );
}
