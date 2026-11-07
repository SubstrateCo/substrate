import { taskStatusLabels } from "@startup-os/contracts/tasks";

import { TaskPriorityIcon } from "../task-cues/task-priority-icon";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { Task } from "../types";

export function TaskMetadata({ task, assigneeName }: { task: Task; assigneeName: string }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/40 p-3 text-sm wrap-anywhere [&_dt]:mb-1 [&_dt]:text-xs">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-1.5">
            <TaskStatusIcon status={task.status} />
            {taskStatusLabels[task.status]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Priority</dt>
          <dd className="flex items-center gap-1.5 capitalize">
            <TaskPriorityIcon priority={task.priority} />
            {task.priority}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd>{assigneeName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Due date</dt>
          <dd>{task.dueDate ?? "No due date"}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
        <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
          {task.description || "No description."}
        </p>
      </div>
    </>
  );
}
