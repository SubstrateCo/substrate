import type { TaskStatus } from "@substrate/contracts/tasks";

import { useEffect, useRef, useState } from "react";

import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { useMediaQuery } from "@/hooks/use-media-query";

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
  const [restore, setRestore] = useState(0);
  const inspector = useRef<HTMLElement>(null);
  const newTaskButton = useRef<HTMLButtonElement>(null);
  const selectionFocus = useFocusReturn(newTaskButton);
  const restoreSelectionFocus = selectionFocus.restore;
  const creationFocus = useFocusReturn(newTaskButton);
  const previousId = useRef<string | null | undefined>(undefined);
  const wide = useMediaQuery("(min-width: 1024px)");
  useEffect(() => {
    if (!ready) return;
    // Beside the list, focus stays where the person is working. Below `lg` the inspector covers
    // the list, so it takes focus.
    if (selectedTaskId && selectedTaskId !== previousId.current && !wide)
      inspector.current?.focus({ preventScroll: true });
    previousId.current = selectedTaskId;
  }, [selectedTaskId, ready, wide]);
  useEffect(() => {
    if (restore && !selectedTaskId) restoreSelectionFocus();
  }, [restore, selectedTaskId, restoreSelectionFocus]);
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
      onSelectTask(null);
      setRestore((count) => count + 1);
    };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, [selectedTaskId, onSelectTask]);
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
      close: () => {
        onSelectTask(null);
        setRestore((count) => count + 1);
      },
      createSubtask: (parentTaskEntityId: string) => {
        creationFocus.remember();
        setCreating({ parentTaskEntityId });
      },
    },
  };
}
