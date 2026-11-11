import { useBlocker, type ShouldBlockFn } from "@tanstack/react-router";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { DiscardChangesDialog } from "@/components/feedback/discard-changes-dialog";
import { registerUnsavedDraft } from "@/lib/navigation/unsaved-drafts";

/**
 * Asks before the person leaves a page with an unsaved draft. A clean page never asks.
 * `description` names what would be lost, such as "Your new name isn’t saved."
 *
 * Two exits are covered while `dirty`:
 * - Router navigation, including search results and links. Pass `shouldBlock` to let some moves
 *   keep the draft, such as switching between one agent's settings sections.
 * - Full-document exits, such as a workspace switch or sign-out. They go through
 *   `leaveDocument()` from "@/lib/navigation/unsaved-drafts", which asks before they start.
 *
 * It does not use the unload event: Electron would cancel closing the window without asking.
 */
export function UnsavedChangesGuard({
  dirty,
  description,
  name,
  shouldBlock,
}: {
  dirty: boolean;
  description: string;
  /** How a document exit lists this draft when several are dirty, such as "Project details". */
  name?: string;
  shouldBlock?: ShouldBlockFn;
}) {
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock ?? (() => true),
    disabled: !dirty,
    enableBeforeUnload: false,
    withResolver: true,
  });
  const [asking, setAsking] = useState<readonly string[] | null>(null);
  const answer = useRef<((leave: boolean) => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const unregister = registerUnsavedDraft(
      (names) =>
        new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setAsking(names);
        }),
      name,
    );
    return () => {
      unregister();
      // The draft went away while the question was open; the exit that asked stays cancelled.
      answer.current?.(false);
      answer.current = null;
    };
  }, [dirty, name]);
  // A click on plain page content moves focus to the body before the question opens.
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!dirty) return;
    // The draft usually becomes dirty while its field already has focus.
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
      lastFocus.current = document.activeElement;
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) lastFocus.current = event.target;
    };
    document.addEventListener("focusin", remember);
    return () => {
      document.removeEventListener("focusin", remember);
      lastFocus.current = null;
    };
  }, [dirty]);
  const open = blocker.status === "blocked" || asking !== null;
  // The dialog returns focus to the element focused when it opened, so "Keep editing" lands
  // back where the person was working instead of on the body.
  useLayoutEffect(() => {
    if (open && document.activeElement === document.body && lastFocus.current?.isConnected)
      lastFocus.current.focus({ preventScroll: true });
  }, [open]);
  const settle = (leave: boolean) => {
    answer.current?.(leave);
    answer.current = null;
    setAsking(null);
  };
  if (!open) return null;
  // One question covers every dirty draft, so it lists each one by name.
  const several = blocker.status !== "blocked" && asking && asking.length > 1 ? asking : null;
  return (
    <DiscardChangesDialog
      description={several ? `You have ${several.length} unsaved drafts:` : description}
      onConfirm={() => {
        if (blocker.status === "blocked") blocker.proceed();
        else settle(true);
      }}
      onClose={() => {
        if (blocker.status === "blocked") blocker.reset();
        else settle(false);
      }}
    >
      {several && (
        <ul aria-label="Unsaved drafts" className="list-disc space-y-1 pl-5 text-sm">
          {several.map((draft) => (
            <li key={draft} className="wrap-anywhere">
              {draft}
            </li>
          ))}
        </ul>
      )}
    </DiscardChangesDialog>
  );
}
