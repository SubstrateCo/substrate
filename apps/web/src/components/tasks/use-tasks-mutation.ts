import type { TasksWrite } from "@startup-os/contracts/tasks/input";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { mutateTasks } from "@/api/tasks/requests";
import { queryKeys } from "@/queries/keys";

export function useTasksMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: TasksWrite) => mutateTasks({ data: { ...data, organizationId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) }),
  });
}
