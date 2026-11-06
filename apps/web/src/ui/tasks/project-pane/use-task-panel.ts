import { useEffect, useRef, useState } from "react";

export function useTaskPanel({
  selectedTaskId,
  onSelectTask,
}: {
  selectedTaskId?: string | null;
  onSelectTask?: (id: string | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ parentTaskEntityId?: string } | null>(null);
  const [restore, setRestore] = useState(0);
  const inspector = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const newTaskButton = useRef<HTMLButtonElement>(null);
  const effectiveId = selectedTaskId === undefined ? selectedId : selectedTaskId;
  const previousId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if ((creating || effectiveId) && (creating || effectiveId !== previousId.current)) {
      const target = creating
        ? inspector.current?.querySelector<HTMLInputElement>("input")
        : inspector.current;
      if (inspector.current) inspector.current.scrollTop = 0;
      if (viewport.current) viewport.current.scrollTop = 0;
      target?.focus({ preventScroll: true });
    }
    previousId.current = effectiveId;
  }, [creating, effectiveId]);
  useEffect(() => {
    if (restore) (trigger.current?.isConnected ? trigger.current : newTaskButton.current)?.focus();
  }, [restore]);
  const select = (id: string | null) => {
    setSelectedId(id);
    onSelectTask?.(id);
  };
  return {
    inspector,
    viewport,
    newTaskButton,
    panel: {
      creating,
      effectiveId,
      selectedTaskId,
      create: () => {
        trigger.current = newTaskButton.current;
        setCreating({});
      },
      select: (id: string) => {
        trigger.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        select(id);
        setCreating(null);
      },
      saved: (id: string) => {
        select(id);
        setCreating(null);
        setRestore((count) => count + 1);
      },
      cancel: () => {
        setCreating(null);
        setRestore((count) => count + 1);
      },
      close: () => {
        select(null);
        setRestore((count) => count + 1);
      },
      createSubtask: (parentTaskEntityId: string) => {
        setCreating({ parentTaskEntityId });
      },
    },
  };
}
