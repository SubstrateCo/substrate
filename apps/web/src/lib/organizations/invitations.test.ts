import { isInvitationExpired } from "./invitations";
import { expect, test } from "bun:test";

const expiresAt = "2026-11-25T12:00:00.000Z";
const expiry = new Date(expiresAt).getTime();

test("an invitation stays acceptable through its expiry instant, as Better Auth accepts it", () => {
  expect(isInvitationExpired(expiresAt, expiry - 1)).toBe(false);
  expect(isInvitationExpired(expiresAt, expiry)).toBe(false);
  expect(isInvitationExpired(expiresAt, expiry + 1)).toBe(true);
});
