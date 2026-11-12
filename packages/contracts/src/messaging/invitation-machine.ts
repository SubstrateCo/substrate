import { defineMachine } from "../state-machine";

export const sharingInvitationStatuses = ["pending", "accepted", "declined", "revoked"] as const;
export type SharingInvitationStatus = (typeof sharingInvitationStatuses)[number];

export const sharingInvitationMachine = defineMachine({
  states: sharingInvitationStatuses,
  terminal: ["accepted", "declined", "revoked"],
  events: {
    // The recipient and target fields record the approval request; it grants no access.
    requestApproval: { from: ["pending"], to: "pending" },
    accept: { from: ["pending"], to: "accepted" },
    decline: { from: ["pending"], to: "declined" },
    revoke: { from: ["pending"], to: "revoked" },
  },
});
