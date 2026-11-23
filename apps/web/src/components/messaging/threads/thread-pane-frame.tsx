import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader
        variant="pane"
        title={
          <span className="flex min-w-0 items-baseline gap-2">
            Thread
            <Button variant="link" size="xs" className="min-w-0" onClick={onClose}>
              <span className="truncate font-normal text-muted-foreground">{conversationLabel}</span>
            </Button>
          </span>
        }
        actions={
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
        }
      />
      {children}
    </PageAside>
  );
}
