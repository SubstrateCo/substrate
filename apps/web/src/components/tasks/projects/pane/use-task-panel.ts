import type { TaskStatus } from "@startup-os/contracts/tasks";

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
  const inspector = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
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
    if (selectedTaskId && selectedTaskId !== previousId.current) {
      if (inspector.current) inspector.current.scrollTop = 0;
      if (viewport.current) viewport.current.scrollTop = 0;
      inspector.current?.focus({ preventScroll: true });
    }
    previousId.current = selectedTaskId;
  }, [selectedTaskId, ready]);
  useEffect(() => {
    if (restore && !selectedTaskId)
      (trigger.current?.isConnected ? trigger.current : newTaskButton.current)?.focus();
  }, [restore, selectedTaskId]);
  return {
    inspector,
    viewport,
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
