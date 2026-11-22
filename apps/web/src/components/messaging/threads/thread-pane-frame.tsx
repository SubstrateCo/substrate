import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { PageAside, useAsideCovers } from "@/components/layout/page-layout";
import { X } from "lucide-react";

export function ThreadPaneFrame({
  conversationLabel,
  onClose,
  children,
}: {
  conversationLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const covers = useAsideCovers();
  // Remember focus before moving it into a covering thread pane.
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (covers) close.current?.focus();
  }, [covers]);
  return (
    <PageAside aria-label="Thread" animate={false}>
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
      {children}
    </PageAside>
  );
}
