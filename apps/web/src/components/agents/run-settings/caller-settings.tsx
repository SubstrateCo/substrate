import { useQuery } from "@tanstack/react-query";

import { CallerSettingsView } from "./caller-settings-view";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { callersOptions, useCallMutations } from "@/queries/agent-work/calls";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

export function CallerSettings({
  userId,
  organizationId,
  agentId,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
}) {
  const callers = useQuery(callersOptions(userId, organizationId, agentId));
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const { policy, remove } = useCallMutations(userId, organizationId, agentId);
  if (callers.isPending) return <LoadingState label="Loading caller settings" variant="compact" />;
  if (!callers.data)
    return (
      <ErrorState title="Couldn’t load caller settings" onRetry={() => void callers.refetch()} />
    );
  return (
    <CallerSettingsView
      settings={callers.data}
      organizationName={organization.data?.name ?? "this workspace"}
      saving={policy.isPending}
      removing={remove.isPending}
      error={policy.error ?? remove.error}
      onSave={(next, onSuccess) => policy.mutate(next, { onSuccess })}
      onRemove={(actorId, onSuccess) => remove.mutate(actorId, { onSuccess })}
    />
  );
}
