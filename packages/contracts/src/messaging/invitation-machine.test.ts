import { sharingInvitationMachine } from "./invitation-machine";
import { expect, test } from "bun:test";

test("sharing invitations resolve only from pending", () => {
  expect(sharingInvitationMachine.next("pending", "accept")).toBe("accepted");
  expect(sharingInvitationMachine.next("pending", "decline")).toBe("declined");
  expect(sharingInvitationMachine.next("pending", "revoke")).toBe("revoked");
  for (const state of ["accepted", "declined", "revoked"] as const) {
    for (const event of ["accept", "decline", "revoke", "requestApproval"] as const)
      expect(sharingInvitationMachine.next(state, event)).toBeNull();
  }
});

test("requesting organization approval leaves the invitation pending and resolvable", () => {
  expect(sharingInvitationMachine.next("pending", "requestApproval")).toBe("pending");
  expect(sharingInvitationMachine.from("requestApproval")).toEqual(["pending"]);
  for (const event of ["accept", "decline", "revoke"] as const)
    expect(sharingInvitationMachine.from(event)).toEqual(["pending"]);
});
