import { conversationTargetInput, workspaceInput } from "./input";
import { z } from "zod";

export const sharingInviteInput = conversationTargetInput.extend({
  email: z.email().max(320),
  shareHistory: z.literal(true),
});
export const sharingInvitationInput = z.object({ invitationId: z.uuid() });
export const sharingAcceptInput = sharingInvitationInput.extend({
  organizationId: z.string().min(1).max(200),
  shareHistory: z.literal(true),
});
export const sharingActionInput = workspaceInput.extend({ invitationId: z.uuid() });
export const sharingDisconnectInput = conversationTargetInput.extend({
  partnerOrganizationId: z.string().min(1).max(200),
});
export const sharingRemoveInput = conversationTargetInput.extend({ actorId: z.uuid() });
