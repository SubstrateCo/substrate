import { useEffect, useRef, useState } from "react";

import type { Conversation } from "@/lib/messaging/conversations";

export function useConversationCreation(
  initialCreating: Conversation["kind"] | undefined,
  sidebarOpen: boolean,
  onSidebarOpenChange: (open: boolean) => void,
) {
  const [creating, setCreating] = useState(initialCreating);
  const [recipient, setRecipient] = useState<string>();
  const container = useRef<HTMLDivElement>(null);
  const [returnFocus, setReturnFocus] = useState<{
    element: Element | null;
    fallback: string;
    sidebarOpen: boolean;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const appliedFocus = useRef(0);
  const beginCreate = (
    kind: Conversation["kind"],
    source: "sidebar" | "empty",
    nextRecipient?: string,
  ) => {
    setReturnFocus({
      element: document.activeElement,
      fallback: `${source}-${source === "sidebar" && kind !== "channel" ? "message" : kind}`,
      sidebarOpen,
    });
    setRecipient(nextRecipient);
    setCreating(kind);
    onSidebarOpenChange(false);
  };
  const cancelCreate = () => {
    setFocusRequest((previous) => previous + 1);
    onSidebarOpenChange(returnFocus?.sidebarOpen ?? false);
    setCreating(undefined);
  };
  useEffect(() => {
    if (creating || focusRequest <= appliedFocus.current) return;
    appliedFocus.current = focusRequest;
    const previous = returnFocus;
    const original = previous?.element;
    const fallback = container.current?.querySelector<HTMLElement>(
      `[data-create-conversation="${previous?.fallback ?? "sidebar-channel"}"]`,
    );
    const target =
      original instanceof HTMLElement &&
      original !== document.body &&
      original.isConnected &&
      original.getClientRects().length
        ? original
        : fallback;
    target?.focus();
  }, [creating, focusRequest, returnFocus]);
  return { creating, recipient, setCreating, container, beginCreate, cancelCreate };
}
