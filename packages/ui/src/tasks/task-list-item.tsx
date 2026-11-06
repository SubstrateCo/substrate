import { Button } from "../primitives/button";
import type { ProjectDetail, Task } from "./types";

export function TaskListItem({
  detail,
  task,
  selected,
  onSelect,
}: {
  detail: ProjectDetail;
  task: Task;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <Button
        variant="sidebar"
        size="selection"
        className="h-auto w-full justify-start text-left whitespace-normal"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium wrap-break-word">{task.title}</span>
          {task.parentTaskEntityId && (
            <span className="block text-xs text-muted-foreground">
              Subtask of{" "}
              {detail.tasks.find((parent) => parent.entityId === task.parentTaskEntityId)?.title ??
                "archived task"}
            </span>
          )}
          <span className="block text-xs text-muted-foreground">
            {task.priority === "none" ? "No priority" : `${task.priority} priority`}
            {task.dueDate ? ` · Due ${task.dueDate}` : ""}
            {task.assigneeActorEntityId
              ? ` · ${detail.actors.find((actor) => actor.entityId === task.assigneeActorEntityId)?.name ?? "Former member"}`
              : ""}
          </span>
        </span>
      </Button>
    </li>
  );
}
