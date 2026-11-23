import { taskStatusLabels } from "@substrate/contracts/tasks";

import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { Task } from "../types";
import { ContentNotice } from "@/components/feedback/content-notice";
import {
  RecordSection,
  RecordSectionAction,
  recordRow,
  recordRows,
} from "@/components/layout/record-section";
import { Plus } from "lucide-react";

/** A task's subtasks as compact rows. Editors add one from the section header. */
export function TaskSubtasks({
  subtasks,
  onSelect,
  onCreate,
}: {
  subtasks: Task[];
  onSelect: (id: string) => void;
  onCreate?: () => void;
}) {
  const done = subtasks.filter((task) => task.status === "completed").length;
  return (
    <RecordSection
      aria-label="Subtasks"
      title="Subtasks"
      count={subtasks.length ? `${done}/${subtasks.length}` : undefined}
      actions={
        onCreate && (
          <RecordSectionAction label="Add subtask" onClick={onCreate}>
            <Plus aria-hidden="true" />
          </RecordSectionAction>
        )
      }
    >
      {!subtasks.length && <ContentNotice variant="inline" title="No subtasks" />}
      {!!subtasks.length && (
        <ul className={recordRows}>
          {subtasks.map((task) => (
            <li key={task.entityId}>
              <button type="button" className={recordRow} onClick={() => onSelect(task.entityId)}>
                <span className="sr-only">{taskStatusLabels[task.status]}: </span>
                <TaskStatusIcon status={task.status} />
                <span
                  className={`truncate ${task.status === "completed" || task.status === "canceled" ? "text-muted-foreground" : ""}`}
                >
                  {task.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );
}
