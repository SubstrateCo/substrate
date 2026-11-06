import type { ReactNode, Ref } from "react";
import { ContentNotice } from "@/ui/feedback/content-notice";
import { TaskList } from "../task-list";
import type { ProjectDetail, Task } from "../types";
import type { useTaskPanel } from "./use-task-panel";

export interface TaskPanelRenderers {
  form: (
    detail: ProjectDetail,
    parentTaskEntityId: string | undefined,
    onSaved: (id: string) => void,
    onCancel: () => void,
  ) => ReactNode;
  detail: (
    detail: ProjectDetail,
    task: Task,
    onClose: () => void,
    onSubtask: () => void,
  ) => ReactNode;
}

export function ProjectTaskPanel({
  detail,
  canEdit,
  panel,
  inspectorRef,
  renderers,
}: {
  detail: ProjectDetail;
  canEdit: boolean;
  panel: ReturnType<typeof useTaskPanel>["panel"];
  inspectorRef: Ref<HTMLDivElement>;
  renderers: TaskPanelRenderers;
}) {
  const selected = detail.tasks.find((task) => task.entityId === panel.effectiveId);
  const { creating, selectedTaskId } = panel;
  return (
    <div
      className={`grid min-h-0 min-w-0 grid-cols-1 items-start gap-5 md:h-full ${creating || selected || selectedTaskId ? "md:grid-cols-2" : ""}`}
    >
      <TaskList detail={detail} selectedId={panel.effectiveId} onSelect={panel.select} />
      {(creating || selected || selectedTaskId) && (
        <div
          ref={inspectorRef}
          tabIndex={-1}
          aria-label={creating ? "Task form panel" : "Selected task panel"}
          className="order-first min-h-0 min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring md:order-0 md:h-full md:overflow-y-auto"
        >
          {creating && canEdit && (
            <div
              key={creating.parentTaskEntityId ?? "root"}
              className="min-w-0 rounded-xl border bg-card p-4 sm:p-6"
            >
              {renderers.form(detail, creating.parentTaskEntityId, panel.saved, panel.cancel)}
            </div>
          )}
          {!(creating && canEdit) &&
            selected &&
            renderers.detail(detail, selected, panel.close, () =>
              panel.createSubtask(selected.entityId),
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
