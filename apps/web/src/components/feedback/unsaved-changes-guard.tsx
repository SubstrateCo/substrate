import { useBlocker, type ShouldBlockFn } from "@tanstack/react-router";

import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { registerUnsavedDraft } from "@/lib/navigation/unsaved-drafts";

/**
 * Asks before the person leaves a page with an unsaved draft. A clean page never asks.
 * `description` names what would be lost, such as "Your new name isn’t saved."
 *
 * Two exits are covered while `dirty`:
 * - Router navigation, including search results and links. Pass `shouldBlock` to let some moves
 *   keep the draft, such as switching between one agent's settings sections.
 * - Full-document exits, such as a workspace switch or sign-out. They call
 *   `confirmDiscardDrafts()` from "@/lib/navigation/unsaved-drafts" before they start.
 *
 * It does not use the unload event: Electron would cancel closing the window without asking.
 */
export function UnsavedChangesGuard({
  dirty,
  description,
  shouldBlock,
}: {
  dirty: boolean;
  description: string;
  shouldBlock?: ShouldBlockFn;
}) {
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock ?? (() => true),
    disabled: !dirty,
    enableBeforeUnload: false,
    withResolver: true,
  });
  const [asking, setAsking] = useState(false);
  const answer = useRef<((leave: boolean) => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const unregister = registerUnsavedDraft(
      () =>
        new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setAsking(true);
        }),
    );
    return () => {
      unregister();
      // The draft went away while the question was open; the exit that asked stays cancelled.
      answer.current?.(false);
      answer.current = null;
    };
  }, [dirty]);
  const settle = (leave: boolean) => {
    answer.current?.(leave);
    answer.current = null;
    setAsking(false);
  };
  if (blocker.status !== "blocked" && !asking) return null;
  return (
    <ConfirmDialog
      title="Discard unsaved changes?"
      description={description}
      confirmLabel="Discard changes"
      pendingLabel="Discarding…"
      cancelLabel="Keep editing"
      destructive
      onConfirm={() => {
        if (blocker.status === "blocked") blocker.proceed();
        else settle(true);
      }}
      onClose={() => {
        if (blocker.status === "blocked") blocker.reset();
        else settle(false);
      }}
    />
  );
}
