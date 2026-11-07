import { useEffect, useRef, useState } from "react";

export function useTaskPanel({
  selectedTaskId,
  onSelectTask,
}: {
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
}) {
  const [creating, setCreating] = useState<{ parentTaskEntityId?: string } | null>(null);
  const [restore, setRestore] = useState(0);
  const inspector = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const newTaskButton = useRef<HTMLButtonElement>(null);
  const previousId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if ((creating || selectedTaskId) && (creating || selectedTaskId !== previousId.current)) {
      const target = creating
        ? inspector.current?.querySelector<HTMLInputElement>("input")
        : inspector.current;
      if (inspector.current) inspector.current.scrollTop = 0;
      if (viewport.current) viewport.current.scrollTop = 0;
      target?.focus({ preventScroll: true });
    }
    previousId.current = selectedTaskId;
  }, [creating, selectedTaskId]);
  useEffect(() => {
    if (restore) (trigger.current?.isConnected ? trigger.current : newTaskButton.current)?.focus();
  }, [restore]);
  return {
    inspector,
    viewport,
    newTaskButton,
    panel: {
      creating,
      selectedTaskId,
      create: () => {
        trigger.current = newTaskButton.current;
        setCreating({});
      },
      select: (id: string) => {
        trigger.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        onSelectTask(id);
        setCreating(null);
      },
      saved: (id: string) => {
        onSelectTask(id);
        setCreating(null);
        setRestore((count) => count + 1);
      },
      cancel: () => {
        setCreating(null);
        setRestore((count) => count + 1);
      },
      close: () => {
        onSelectTask(null);
        setRestore((count) => count + 1);
      },
      createSubtask: (parentTaskEntityId: string) => {
        setCreating({ parentTaskEntityId });
      },
    },
  };
}
