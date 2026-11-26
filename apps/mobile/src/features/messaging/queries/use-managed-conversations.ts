import { useQuery } from "@tanstack/react-query";

import { getOrganizationPeople } from "../api/context";
import { listManagedConversations } from "../api/conversations";
import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";
import { useOrganizationAdmin } from "@/features/organizations/use-organization-admin";

export const useConversationAdminAccess = useOrganizationAdmin;

/** The server exposes metadata to admins, not a way into private message history. */
export function useManagedConversations(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  const access = useConversationAdminAccess(organizationId);
  const list = useQuery({
    queryKey: messagingKeys.managed(scope),
    queryFn: ({ signal }) =>
      listManagedConversations({ organizationId: scope.organizationId }, signal),
    enabled: access.allowed,
    retry: false,
  });
  const people = useQuery({
    queryKey: messagingKeys.people(scope),
    queryFn: ({ signal }) =>
      getOrganizationPeople({ organizationId: scope.organizationId }, signal),
    enabled: access.allowed,
    retry: false,
  });
  return { access, list, people };
}
