import { taskStatusLabels, taskStatusValues } from "@substrate/contracts/tasks";

import { taskPriorityLabels, taskPriorityOrder } from "./task-labels";
import { TaskPriorityIcon } from "./task-priority-icon";
import { TaskStatusIcon } from "./task-status-icon";

/** Status choices for selects and menus, each with its icon. */
export const taskStatusOptions = taskStatusValues.map((value) => ({
  value,
  label: taskStatusLabels[value],
  icon: <TaskStatusIcon status={value} />,
}));

/** Priority choices, most urgent first, each with its icon. */
export const taskPriorityOptions = taskPriorityOrder.map((value) => ({
  value,
  label: taskPriorityLabels[value],
  icon: <TaskPriorityIcon priority={value} />,
}));
