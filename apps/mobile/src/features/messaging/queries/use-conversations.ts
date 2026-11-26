import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";

import { getOrganizationPeople, listAgents } from "../api/context";
import { getMessagingProfile, listConversations, unreadCounts } from "../api/conversations";
import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";
import type { QueryScope } from "@/queries/keys";

export const conversationsOptions = (scope: QueryScope, selectedId?: string) =>
  queryOptions({
    queryKey: messagingKeys.conversations(scope, selectedId),
    queryFn: ({ signal }) =>
      listConversations(
        { organizationId: scope.organizationId, conversationId: selectedId },
        signal,
      ),
    retry: false,
  });

/** All visible conversations. With `selectedId`, also that task discussion if it is one. */
export function useConversations(organizationId: string, selectedId?: string) {
  return useQuery(conversationsOptions(useMessagingScope(organizationId), selectedId));
}

export function useConversation(organizationId: string, conversationId: string | undefined) {
  const list = useConversations(organizationId, conversationId);
  return {
    ...list,
    conversation: conversationId
      ? list.data?.find((conversation) => conversation.id === conversationId)
      : undefined,
  };
}

export function useUnreadCounts(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.unread(scope),
    queryFn: ({ signal }) => unreadCounts({ organizationId: scope.organizationId }, signal),
    retry: false,
  });
}

/** Workspace members other than the viewer, as people to choose, sorted by name. */
export function useWorkspacePeople(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.people(scope),
    queryFn: ({ signal }) =>
      getOrganizationPeople({ organizationId: scope.organizationId }, signal),
    staleTime: 30_000,
    retry: false,
    select: (people) =>
      people
        .flatMap((person) =>
          person.userId === scope.userId
            ? []
            : [{ id: person.userId, name: person.name, email: person.email, image: person.image }],
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
  });
}

/** The viewer's own agents. */
export function useOwnAgents(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.agents(scope),
    queryFn: ({ signal }) => listAgents(signal),
    select: (catalog) => catalog.agents,
  });
}

export function useMessagingProfile(
  organizationId: string,
  conversationId: string,
  actorId: string | undefined,
) {
  const scope = useMessagingScope(organizationId);
  return useQuery({
    queryKey: messagingKeys.profile(scope, conversationId, actorId ?? ""),
    queryFn: actorId
      ? ({ signal }) =>
          getMessagingProfile(
            { organizationId: scope.organizationId, conversationId, actorId },
            signal,
          )
      : skipToken,
    staleTime: 60_000,
    retry: false,
  });
}
