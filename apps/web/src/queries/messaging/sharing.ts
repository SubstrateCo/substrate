import { queryOptions } from "@tanstack/react-query";

import {
  getSharingInvitation,
  listSharing,
  listSharingConversations,
  listSharingInbox,
} from "@/api/messaging/sharing";
import { queryKeys } from "@/queries/keys";

export const sharingInvitationOptions = (invitationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.sharingInvitations, invitationId],
    queryFn: ({ signal }) => getSharingInvitation({ data: { invitationId }, signal }),
    retry: false,
  });
export const sharingOptions = (organizationId: string, conversationId: string) =>
  queryOptions({
    queryKey: queryKeys.conversationSharing(organizationId, conversationId),
    queryFn: ({ signal }) => listSharing({ data: { organizationId, conversationId }, signal }),
  });
export const sharingConversationOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.conversationSharing(organizationId),
    queryFn: ({ signal }) => listSharingConversations({ data: { organizationId }, signal }),
  });
export const sharingInboxOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.sharingInbox(organizationId),
    queryFn: ({ signal }) => listSharingInbox({ data: { organizationId }, signal }),
  });
