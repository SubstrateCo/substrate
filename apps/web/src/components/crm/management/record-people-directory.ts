import { useQuery } from "@tanstack/react-query";

import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { recordPeople } from "@/lib/people/record-people";
import { crmPeopleOptions } from "@/queries/crm/management";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";

export function useRecordPeople() {
  const { organizationId } = useWorkspaceScope();
  const actors = useQuery(crmPeopleOptions(organizationId));
  const members = useQuery(workspacePeopleQueryOptions(organizationId));
  const error = actors.error ?? members.error;
  return {
    people: error ? [] : recordPeople(actors.data ?? [], members.data ?? []),
    pending: actors.isPending || members.isPending,
    error,
  };
}
