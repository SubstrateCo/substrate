import { Button } from "../primitives/button";
import type { ProjectDetail } from "./types";

export function TaskList({
  detail,
  selectedId,
  onSelect,
}: {
  detail: ProjectDetail;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Project tasks" className="min-w-0 space-y-5">
      {!detail.tasks.length && (
        <div className="rounded-xl border border-dashed p-6">
          <h2 className="font-semibold">No tasks yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.level === "edit" || detail.level === "owner"
              ? "Create the first task for this project."
              : "Tasks will appear here when a project editor creates them."}
          </p>
        </div>
      )}
      {detail.statuses.map((status) => {
        const rows = detail.tasks.filter((task) => task.statusId === status.id);
        if (!rows.length) return null;
        return (
          <div key={status.id}>
            <h2 className="mb-2 text-sm font-semibold wrap-anywhere">
              {status.name} <span className="text-muted-foreground">{rows.length}</span>
            </h2>
            <ul className="space-y-1">
              {rows.map((task) => (
                <li key={task.entityId}>
                  <Button
                    variant="sidebar"
                    size="selection"
                    className="h-auto w-full justify-start text-left whitespace-normal"
                    aria-pressed={task.entityId === selectedId}
                    onClick={() => onSelect(task.entityId)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium wrap-break-word">{task.title}</span>
                      {task.parentTaskEntityId && (
                        <span className="block text-xs text-muted-foreground">
                          Subtask of{" "}
                          {detail.tasks.find(
                            (parent) => parent.entityId === task.parentTaskEntityId,
                          )?.title ?? "archived task"}
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
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
