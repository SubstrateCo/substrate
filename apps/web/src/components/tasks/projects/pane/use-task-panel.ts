import type { TaskStatus } from "@substrate/contracts/tasks";

import { useRef, useState } from "react";

import { useFocusReturn } from "@/components/feedback/use-focus-return";

export function useTaskPanel({
  selectedTaskId,
  onSelectTask,
}: {
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
}) {
  const [creating, setCreating] = useState<{
    parentTaskEntityId?: string;
    status?: TaskStatus;
  } | null>(null);
  const inspector = useRef<HTMLDivElement>(null);
  const newTaskButton = useRef<HTMLButtonElement>(null);
  const creationFocus = useFocusReturn(newTaskButton);
  const close = () => onSelectTask(null);
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
