import { invitationScreenState, isInvitationExpired } from "./invitations";
import { describe, expect, test } from "bun:test";

const expiresAt = "2026-11-25T12:00:00.000Z";
const expiry = new Date(expiresAt).getTime();

test("an invitation stays acceptable through its expiry instant, as Better Auth accepts it", () => {
  expect(isInvitationExpired(expiresAt, expiry - 1)).toBe(false);
  expect(isInvitationExpired(expiresAt, expiry)).toBe(false);
  expect(isInvitationExpired(expiresAt, expiry + 1)).toBe(true);
});

describe("invitationScreenState", () => {
  const pending = { expiresAt, status: "pending" };
  const state = (input: Partial<Parameters<typeof invitationScreenState>[0]>) =>
    invitationScreenState({
      invitation: undefined,
      unavailable: false,
      failed: false,
      now: expiry,
      ...input,
    }).kind;

  test("a pending invitation within its expiry is ready, even after a failed refresh", () => {
    expect(state({ invitation: pending })).toBe("ready");
    expect(state({ invitation: pending, failed: true })).toBe("ready");
  });
  test("an expired, answered, or refused invitation is missing", () => {
    expect(state({ invitation: pending, now: expiry + 1 })).toBe("missing");
    expect(state({ invitation: { expiresAt, status: "accepted" } })).toBe("missing");
    expect(state({ unavailable: true, failed: true })).toBe("missing");
  });
  test("a failed first load is an error, not a missing invitation", () => {
    expect(state({ failed: true })).toBe("error");
    expect(state({})).toBe("loading");
  });
});
