import type { TaskStatus } from "@substrate/contracts/tasks";

import { useCallback, useEffect, useRef, useState } from "react";

import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { useAsideCovers } from "@/components/layout/page-layout";

export function useTaskPanel({
  selectedTaskId,
  onSelectTask,
  ready,
}: {
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  ready: boolean;
}) {
  const [creating, setCreating] = useState<{
    parentTaskEntityId?: string;
    status?: TaskStatus;
  } | null>(null);
  const inspector = useRef<HTMLElement>(null);
  const newTaskButton = useRef<HTMLButtonElement>(null);
  const selectionFocus = useFocusReturn(newTaskButton);
  const creationFocus = useFocusReturn(newTaskButton);
  const previousId = useRef<string | null | undefined>(undefined);
  const covers = useAsideCovers();
  useEffect(() => {
    if (!ready) return;
    // Beside the list, focus stays where the person is working. When the inspector covers the
    // list, it takes focus.
    if (selectedTaskId && selectedTaskId !== previousId.current && covers)
      inspector.current?.focus({ preventScroll: true });
    previousId.current = selectedTaskId;
  }, [selectedTaskId, ready, covers]);
  // Focus returns to what opened the task once the inspector has closed. An unsaved draft can
  // block the close; then "Keep editing" returns focus to the draft, and nothing moves it.
  const closing = useRef(false);
  const { restore: restoreSelectionFocus } = selectionFocus;
  useEffect(() => {
    if (!closing.current || selectedTaskId) return;
    closing.current = false;
    restoreSelectionFocus();
  }, [selectedTaskId, restoreSelectionFocus]);
  const close = useCallback(() => {
    closing.current = true;
    onSelectTask(null);
  }, [onSelectTask]);
  useEffect(() => {
    if (!selectedTaskId) return;
    // A click on the page outside the inspector closes it. Controls keep their own action, such
    // as opening another task. Menus and dialogs render outside the page layout, so they are
    // not part of the page.
    const dismiss = (event: MouseEvent) => {
      const pane = inspector.current;
      if (!pane || event.defaultPrevented || !(event.target instanceof Element)) return;
      if (pane.contains(event.target)) return;
      if (!pane.closest('[data-slot="page-layout"]')?.contains(event.target)) return;
      if (event.target.closest("button, a, input, textarea, select, label")) return;
      if (window.getSelection()?.isCollapsed === false) return;
      close();
    };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, [selectedTaskId, close]);
  return {
    inspector,
    newTaskButton,
    restoreFocus: creationFocus.restore,
    panel: {
      creating,
      selectedTaskId,
      create: (status?: TaskStatus) => {
        creationFocus.remember();
        setCreating({ status });
      },
      select: (id: string) => {
        closing.current = false;
        selectionFocus.remember();
        onSelectTask(id);
        setCreating(null);
      },
      // The form saves with `mutate` callbacks, which skip an unmounted pane.
      saved: (id: string) => {
        onSelectTask(id);
        setCreating(null);
      },
      cancel: () => {
        setCreating(null);
      },
      close,
      createSubtask: (parentTaskEntityId: string) => {
        creationFocus.remember();
        setCreating({ parentTaskEntityId });
      },
    },
  };
}
