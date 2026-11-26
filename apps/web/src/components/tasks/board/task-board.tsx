import { taskStatusLabels, taskStatusValues, type TaskStatus } from "@substrate/contracts/tasks";

import { useState, type ComponentProps } from "react";

import type { Task } from "../types";
import { TaskBoardCard } from "./task-board-card";
import { TaskBoardColumn } from "./task-board-column";
import { Board, BoardCard } from "@/components/layout/board";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

export function TaskBoard({
  tasks,
  cues,
  selectedId,
  onSelect,
  onCreate,
  onStatusChange,
  statusPending,
}: {
  tasks: Task[];
  /** A card's assignee, parent title, and blocked cue, which the list resolves once. */
  cues: (
    task: Task,
  ) => Pick<ComponentProps<typeof TaskBoardCard>, "assignee" | "parentTitle" | "blocked">;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (status?: TaskStatus) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
  statusPending: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const active = tasks.find((task) => task.entityId === activeId);
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
      <Board aria-label="Task board" aria-busy={statusPending} className="p-6">
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
                  {...cues(task)}
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
      </Board>
      <DragOverlay dropAnimation={null}>
        {active && (
          <BoardCard overlay>
            <span className="truncate font-medium">{active.title}</span>
          </BoardCard>
        )}
      </DragOverlay>
    </DndContext>
  );
}
