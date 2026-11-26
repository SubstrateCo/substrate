import { organizationId } from "../workspace";
import { conversationTargetInput, workspaceInput } from "./input";
import { z } from "zod";

export { sharingInvitationMachine, sharingInvitationStatuses } from "./invitation-machine";
export type { SharingInvitationStatus } from "./invitation-machine";

/** A shared conversation's state from the viewer organization's side. */
export type SharedConversationStatus = "connected" | "needs-approval" | "invited";

export type SharingEventAction =
  | "invited"
  | "approval-requested"
  | "accepted"
  | "revoked"
  | "declined"
  | "disconnected"
  | "removed";

/** What a sharing event did, after the name of the person who did it. */
export const sharingEventLabels: Record<SharingEventAction, string> = {
  invited: "sent an invitation",
  "approval-requested": "requested organization approval",
  accepted: "accepted an invitation",
  revoked: "revoked an invitation",
  declined: "declined an invitation",
  disconnected: "disconnected an organization",
  removed: "removed a participant",
};

/** The status of an invitation nobody has answered. Answered ones show as people and activity. */
export function pendingInvitationStatus(
  invite: { expiresAt: string; deliveryAttempts: number; deliveredAt: string | null },
  now: number,
) {
  if (new Date(invite.expiresAt).getTime() <= now) return { text: "Expired", warning: true };
  if (invite.deliveryAttempts >= 5 && !invite.deliveredAt)
    return { text: "Email couldn’t be delivered", warning: true };
  return {
    text: invite.deliveredAt ? "Waiting for a reply · email sent" : "Waiting · email queued",
    warning: false,
  };
}

export type SharingConfirmation = {
  kind: "revoke" | "disconnect" | "remove";
  id: string;
  name: string;
};

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
