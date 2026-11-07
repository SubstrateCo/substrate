import type { TaskStatus } from "@startup-os/contracts/tasks";

import type { ReactNode, Ref } from "react";

import { TaskList } from "../../list/task-list";
import type { ProjectDetail, Task } from "../../types";
import type { useTaskPanel } from "./use-task-panel";
import { ContentNotice } from "@/components/feedback/content-notice";

export interface TaskPanelRenderers {
  form: (
    detail: ProjectDetail,
    parentTaskEntityId: string | undefined,
    onSaved: (id: string) => void,
    onCancel: () => void,
    status?: TaskStatus,
  ) => ReactNode;
  detail: (
    detail: ProjectDetail,
    task: Task,
    onClose: () => void,
    onSubtask: () => void,
    visible: boolean,
  ) => ReactNode;
}

export function ProjectTaskPanel({
  detail,
  canEdit,
  panel,
  inspectorRef,
  renderers,
  visible,
}: {
  detail: ProjectDetail;
  canEdit: boolean;
  panel: ReturnType<typeof useTaskPanel>["panel"];
  inspectorRef: Ref<HTMLDivElement>;
  renderers: TaskPanelRenderers;
  visible: boolean;
}) {
  const selected = detail.tasks.find((task) => task.entityId === panel.selectedTaskId);
  const { selectedTaskId } = panel;
  return (
    <div
      className={`grid min-h-0 min-w-0 grid-cols-1 items-start gap-5 md:h-full ${selectedTaskId ? "md:grid-cols-2" : ""}`}
    >
      <TaskList
        detail={detail}
        selectedId={selectedTaskId}
        onSelect={panel.select}
        onCreate={canEdit ? panel.create : undefined}
      />
      {selectedTaskId && (
        <div
          ref={inspectorRef}
          tabIndex={-1}
          aria-label="Selected task panel"
          className="order-first min-h-0 min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring md:order-0 md:h-full md:overflow-y-auto"
        >
          {selected &&
            renderers.detail(
              detail,
              selected,
              panel.close,
              () => panel.createSubtask(selected.entityId),
              visible,
            )}
          {selectedTaskId && !selected && (
            <ContentNotice
              title="Task unavailable"
              description="This task was removed or you no longer have access. Choose another task to continue."
            />
          )}
        </div>
      )}
    </div>
  );
}
