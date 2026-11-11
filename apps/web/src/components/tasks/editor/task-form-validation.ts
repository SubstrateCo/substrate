import { tasksWrite } from "@substrate/contracts/tasks/input";

import { z } from "zod";

const taskFields = tasksWrite.options[3].shape;
const projectFields = tasksWrite.options[1].shape;

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name.").max(projectFields.name.maxLength!),
  description: projectFields.description,
});

export function taskFormSchema(assigneeIds: string[]) {
  return z.object({
    title: z.string().trim().min(1, "Enter a task title.").max(taskFields.title.maxLength!),
    description: taskFields.description,
    status: taskFields.status,
    priority: taskFields.priority,
    assignee: z
      .string()
      .refine(
        (value) => value === "unassigned" || assigneeIds.includes(value),
        "Select an assignee who still has project access.",
      ),
    dueDate: z.union([z.literal(""), taskFields.dueDate.unwrap()]),
  });
}
