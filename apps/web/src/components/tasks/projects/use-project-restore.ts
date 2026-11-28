import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { toast } from "sonner";

export function useProjectRestore(organizationId: string) {
  const mutation = useTasksMutation(organizationId);
  const variables = mutation.variables;
  return {
    pendingId:
      mutation.isPending && variables && "projectEntityId" in variables
        ? variables.projectEntityId
        : undefined,
    restore: (projectEntityId: string) =>
      mutation.mutate(
        { action: "restoreProject", organizationId, projectEntityId },
        {
          onError: (error) =>
            toast.error(actionErrorMessage(error, "Couldn’t restore this project. Try again.")),
        },
      ),
  };
}
