import type { TaskStatus } from "@substrate/contracts/tasks";

import { useEffect, useRef, useState } from "react";

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
  const trigger = useRef<HTMLElement | null>(null);
  const creationTrigger = useRef<HTMLElement | null>(null);
  const newTaskButton = useRef<HTMLButtonElement>(null);
  const previousId = useRef<string | null | undefined>(undefined);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Beside the list, focus stays where the person is working. Below `lg` the inspector covers
    // the list, so it takes focus.
    if (
      selectedTaskId &&
      selectedTaskId !== previousId.current &&
      !window.matchMedia("(min-width: 1024px)").matches
    )
      inspector.current?.focus({ preventScroll: true });
    previousId.current = selectedTaskId;
  }, [selectedTaskId, ready]);
  useEffect(() => {
    if (restore && !selectedTaskId)
      (trigger.current?.isConnected ? trigger.current : newTaskButton.current)?.focus();
  }, [restore, selectedTaskId]);
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
    restoreFocus: () =>
      (creationTrigger.current?.isConnected
        ? creationTrigger.current
        : newTaskButton.current
      )?.focus(),
    panel: {
      creating,
      selectedTaskId,
      create: (status?: TaskStatus) => {
        creationTrigger.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : newTaskButton.current;
        setCreating({ status });
      },
      select: (id: string) => {
        trigger.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        onSelectTask(id);
        setCreating(null);
      },
      saved: (id: string) => {
        if (!mounted.current) return;
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
        creationTrigger.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setCreating({ parentTaskEntityId });
      },
    },
  };
}
