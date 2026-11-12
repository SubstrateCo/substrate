import { organizationId } from "../workspace";
import { conversationTargetInput, workspaceInput } from "./input";
import { z } from "zod";

export { sharingInvitationMachine, sharingInvitationStatuses } from "./invitation-machine";
export type { SharingInvitationStatus } from "./invitation-machine";

export const sharingInviteInput = conversationTargetInput.extend({
  email: z.email().max(320),
  shareHistory: z.literal(true),
});
export const sharingInvitationInput = z.object({ invitationId: z.uuid() });
export const sharingAcceptInput = sharingInvitationInput.extend({
  organizationId,
  shareHistory: z.literal(true),
});
export const sharingActionInput = workspaceInput.extend({ invitationId: z.uuid() });
export const sharingDisconnectInput = conversationTargetInput.extend({
  partnerOrganizationId: organizationId,
});
export const sharingRemoveInput = conversationTargetInput.extend({ actorId: z.uuid() });
