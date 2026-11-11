import { sharingInvitationSchema } from "./sharing-invitation-validation";
import { expect, test } from "bun:test";

test("sharing requires an explicit history-access acknowledgement", () => {
  expect(
    sharingInvitationSchema.safeParse({ email: "person@partner.com", confirmed: false }).success,
  ).toBe(false);
  expect(sharingInvitationSchema.safeParse({ email: "person@partner.com" }).success).toBe(false);
  expect(
    sharingInvitationSchema.safeParse({ email: "person@partner.com", confirmed: true }).success,
  ).toBe(true);
});

test("sharing normalizes the invitation address before submission", () => {
  expect(sharingInvitationSchema.parse({ email: " person@partner.com ", confirmed: true })).toEqual(
    { email: "person@partner.com", confirmed: true },
  );
});
