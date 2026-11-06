import { describe, expect, test } from "bun:test";
import { isAccessFailure, isInvitationUnavailable } from "./request-failure";

describe("request failure recovery", () => {
  test("access loss must not leave cached private content visible", () => {
    expect(isAccessFailure(new Error("Conversation not found or access denied."))).toBe(true);
    expect(
      isAccessFailure(new Error("Your active workspace changed. Reload this page to continue.")),
    ).toBe(true);
    expect(isAccessFailure(Object.assign(new Error("Forbidden"), { status: 403 }))).toBe(true);
    expect(isAccessFailure(new Error("Network request failed"))).toBe(false);
  });
  test("serialized membership failures are access loss even without status or code", () => {
    expect(isAccessFailure(new Error("You are not a member of this organization"))).toBe(true);
  });
  test("unavailable invitations are distinct from retryable fetch failures", () => {
    expect(
      isInvitationUnavailable(
        Object.assign(new Error("Unavailable"), { code: "INVITATION_NOT_FOUND" }),
      ),
    ).toBe(true);
    expect(isInvitationUnavailable(new Error("Network request failed"))).toBe(false);
  });
  test("code-less invitation lookup failures are unavailable rather than retryable", () => {
    expect(isInvitationUnavailable(new Error("Invitation not found!"))).toBe(true);
  });
});

test("workspace context access errors block cached private content but transient failures do not", () => {
  expect(isAccessFailure(new Error("Item not found or access denied."))).toBe(true);
  expect(isAccessFailure(new Error("Sign in with a verified account to continue."))).toBe(true);
  expect(isAccessFailure(new Error("Workspace context is unavailable. Please try again."))).toBe(
    false,
  );
});
