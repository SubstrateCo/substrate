import { queryOptions, skipToken, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  getAccountNotificationPreferences,
  getConversationNotificationPreferences,
  getWorkspaceNotificationPreferences,
  updateAccountNotificationPreferences,
  updateConversationNotificationPreferences,
  updateWorkspaceNotificationPreferences,
} from "@/api/notifications/preferences";
import { queryKeys } from "@/queries/keys";

type AccountChange = Parameters<typeof updateAccountNotificationPreferences>[0]["data"];
type WorkspaceChange = Omit<
  Parameters<typeof updateWorkspaceNotificationPreferences>[0]["data"],
  "organizationId"
>;
type ConversationChange = Omit<
  Parameters<typeof updateConversationNotificationPreferences>[0]["data"],
  "organizationId" | "conversationId"
>;

export const accountNotificationPreferencesOptions = (userId: string) =>
  queryOptions({
    queryKey: queryKeys.notificationPreferences(userId),
    queryFn: ({ signal }) => getAccountNotificationPreferences(signal),
  });

export const workspaceNotificationPreferencesOptions = (
  userId: string,
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: queryKeys.workspaceNotificationPreferences(userId, organizationId ?? ""),
    queryFn: organizationId
      ? ({ signal }) => getWorkspaceNotificationPreferences({ data: { organizationId }, signal })
      : skipToken,
  });

export const conversationNotificationPreferencesOptions = (
  userId: string,
  organizationId: string,
  conversationId: string,
) =>
  queryOptions({
    queryKey: queryKeys.conversationNotificationPreferences(userId, organizationId, conversationId),
    queryFn: ({ signal }) =>
      getConversationNotificationPreferences({ data: { organizationId, conversationId }, signal }),
  });

export function useUpdateAccountNotificationPreferences(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: AccountChange) => updateAccountNotificationPreferences({ data: change }),
    onSuccess: (preferences) => {
      client.setQueryData(queryKeys.notificationPreferences(userId), preferences);
    },
  });
}

export function useUpdateWorkspaceNotificationPreferences(userId: string, organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: WorkspaceChange) =>
      updateWorkspaceNotificationPreferences({ data: { organizationId, ...change } }),
    onSuccess: (preferences) => {
      client.setQueryData(
        queryKeys.workspaceNotificationPreferences(userId, organizationId),
        preferences,
      );
    },
  });
}

export function useUpdateConversationNotificationPreferences(
  userId: string,
  organizationId: string,
  conversationId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: ConversationChange) =>
      updateConversationNotificationPreferences({
        data: { organizationId, conversationId, ...change },
      }),
    onSuccess: (preferences) => {
      client.setQueryData(
        queryKeys.conversationNotificationPreferences(userId, organizationId, conversationId),
        preferences,
      );
    },
  });
}
