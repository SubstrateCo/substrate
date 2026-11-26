import { useQuery } from "@tanstack/react-query";

import { CallerSettingsLoading, CallerSettingsView } from "./caller-settings-view";
import { ErrorState } from "@/components/feedback/error-state";
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
  if (callers.isPending) return <CallerSettingsLoading />;
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
      saveError={policy.error}
      removeError={remove.error}
      onSave={(next, onSuccess) => policy.mutate(next, { onSuccess })}
      onRemove={(actorId, onSuccess) => remove.mutate(actorId, { onSuccess })}
    />
  );
}
