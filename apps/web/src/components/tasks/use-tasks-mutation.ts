import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TasksWrite } from "@startup-os/contracts/tasks/input";
import { queryKeys } from "@/queries/keys";
import { mutateTasks } from "@/api/tasks";

export function useTasksMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: TasksWrite) => mutateTasks({ data: { ...data, organizationId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) }),
  });
}
