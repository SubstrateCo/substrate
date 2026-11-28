import { taskStatusLabels, taskStatusValues } from "@substrate/contracts/tasks";

import { taskPriorityLabels, taskPriorityOrder } from "./task-labels";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

export const taskStatusOptions = taskStatusValues.map((value) => ({
  value,
  label: taskStatusLabels[value],
  icon: <TaskStatusIcon status={value} />,
}));

export const taskPriorityOptions = taskPriorityOrder.map((value) => ({
  value,
  label: taskPriorityLabels[value],
  icon: <TaskPriorityIcon priority={value} />,
}));
