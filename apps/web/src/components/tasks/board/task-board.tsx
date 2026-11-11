import { taskStatusLabels, taskStatusValues, type TaskStatus } from "@startup-os/contracts/tasks";

import { useState } from "react";

import { blockedTaskIds } from "../links/task-relations";
import type { ProjectDetail, Task } from "../types";
import { TaskBoardCard } from "./task-board-card";
import { TaskBoardColumn } from "./task-board-column";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

export function TaskBoard({
  detail,
  tasks,
  selectedId,
  onSelect,
  onCreate,
  onStatusChange,
  statusPending,
}: {
  detail: ProjectDetail;
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (status?: TaskStatus) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
  statusPending: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const active = tasks.find((task) => task.entityId === activeId);
  const actors = new Map(detail.actors.map((actor) => [actor.entityId, actor]));
  const blocked = blockedTaskIds(detail.links, detail.tasks);
  const parents = new Map(detail.tasks.map((task) => [task.entityId, task.title]));
  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active: dragged }) => setActiveId(String(dragged.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active: dragged, over }) => {
        setActiveId(null);
        const task = tasks.find((candidate) => candidate.entityId === dragged.id);
        const status = taskStatusValues.find((candidate) => candidate === over?.id);
        if (statusPending) return;
        if (task && status && task.status !== status) onStatusChange?.(task.entityId, status);
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Drag to another status column. To change status with the keyboard, use the card’s status menu.",
        },
        announcements: {
          onDragStart: () => `Picked up ${active?.title ?? "task"}.`,
          onDragOver: ({ over }) => {
            const status = taskStatusValues.find((candidate) => candidate === over?.id);
            return status ? `Over ${taskStatusLabels[status]}.` : "Outside a status column.";
          },
          onDragEnd: ({ over }) => (over ? "Task dropped." : "Move canceled."),
          onDragCancel: () => "Move canceled.",
        },
      }}
    >
      <section
        aria-label="Task board"
        aria-busy={statusPending}
        className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-x-auto p-6"
      >
        {taskStatusValues.map((status) => {
          const rows = tasks.filter((task) => task.status === status);
          return (
            <TaskBoardColumn
              key={status}
              status={status}
              count={rows.length}
              onCreate={onCreate}
              disabled={!onStatusChange || statusPending}
            >
              {rows.map((task) => (
                <TaskBoardCard
                  key={task.entityId}
                  task={task}
                  assignee={
                    task.assigneeActorEntityId ? actors.get(task.assigneeActorEntityId) : undefined
                  }
                  parentTitle={
                    task.parentTaskEntityId ? parents.get(task.parentTaskEntityId) : undefined
                  }
                  blocked={blocked.has(task.entityId)}
                  selected={selectedId === task.entityId}
                  statusPending={statusPending}
                  onSelect={() => onSelect(task.entityId)}
                  onStatusChange={
                    onStatusChange ? (next) => onStatusChange(task.entityId, next) : undefined
                  }
                />
              ))}
            </TaskBoardColumn>
          );
        })}
      </section>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="rounded-lg border bg-popover p-4 text-sm font-medium shadow-raised">
            {active.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
