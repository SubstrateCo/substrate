import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TasksWrite } from "@startup-os/auth/tasks-contract";
import { queryKeys } from "@/queries/keys";
import { mutateTasks } from "@/server/tasks";

export function useTasksMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: TasksWrite) => mutateTasks({ data: { ...data, organizationId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.tasks(organizationId) }),
  });
}
