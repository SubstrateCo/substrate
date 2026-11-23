import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import type { ReactNode } from "react";

import { TaskStatusIcon } from "../task-cues/task-status-icon";
import { BoardColumn } from "@/components/layout/board";
import { useDroppable } from "@dnd-kit/core";

export function TaskBoardColumn({
  status,
  count,
  onCreate,
  disabled,
  children,
}: {
  status: TaskStatus;
  count: number;
  onCreate?: (status: TaskStatus) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });
  const label = taskStatusLabels[status];
  return (
    <BoardColumn
      ref={setNodeRef}
      label={label}
      listLabel={`${label} tasks`}
      count={count}
      icon={<TaskStatusIcon status={status} />}
      onAdd={onCreate && (() => onCreate(status))}
      addLabel={`Add task to ${label}`}
      empty={count ? undefined : "No tasks"}
      isOver={isOver}
    >
      {children}
    </BoardColumn>
  );
}
