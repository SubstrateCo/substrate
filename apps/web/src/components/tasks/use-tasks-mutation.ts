import type { TasksWrite } from "@startup-os/contracts/tasks/input";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { mutateTasks } from "@/api/tasks/requests";
import { invalidateTasksWrite } from "@/queries/tasks/mutations";

export function useTasksMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: TasksWrite) => mutateTasks({ data: { ...data, organizationId } }),
    onSuccess: (result, input) =>
      invalidateTasksWrite(client, { ...input, organizationId }, result.id),
  });
}
