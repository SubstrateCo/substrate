import { isAccessFailure, isInvitationUnavailable } from "./request-failure";
import { AuthError } from "@/api/auth/error";
import { ApiError } from "@/api/result";
import { describe, expect, test } from "bun:test";

describe("request failure recovery", () => {
  test("access loss must not leave cached private content visible", () => {
    expect(isAccessFailure(new ApiError("NOT_FOUND", "Changed copy", 404))).toBe(true);
    expect(isAccessFailure(new ApiError("WORKSPACE_CHANGED", "Changed copy", 200))).toBe(true);
    expect(isAccessFailure(Object.assign(new Error("Forbidden"), { status: 403 }))).toBe(true);
    expect(isAccessFailure(new Error("Network request failed"))).toBe(false);
  });
  test("auth membership failures are access loss by code, not copy", () => {
    expect(
      isAccessFailure(
        new AuthError({
          code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
          message: "Changed copy",
        }),
      ),
    ).toBe(true);
    expect(isAccessFailure(new AuthError({ code: "EMAIL_NOT_VERIFIED" }))).toBe(true);
    expect(
      isAccessFailure(new AuthError({ code: "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION" })),
    ).toBe(true);
    expect(isAccessFailure(new ApiError("UNAUTHENTICATED", "Changed copy", 200))).toBe(true);
    expect(isAccessFailure(new Error("You are not a member of this organization"))).toBe(false);
  });
  test("unavailable invitations are distinct from retryable fetch failures", () => {
    expect(
      isInvitationUnavailable(
        new AuthError({ code: "INVITATION_NOT_FOUND", message: "Unavailable" }),
      ),
    ).toBe(true);
    expect(isInvitationUnavailable(new Error("Network request failed"))).toBe(false);
  });
  test("invitation classification does not depend on English copy", () => {
    expect(
      isInvitationUnavailable(
        new AuthError({
          code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
          message: "Changed copy",
        }),
      ),
    ).toBe(true);
    expect(isInvitationUnavailable(new Error("Invitation not found!"))).toBe(false);
  });
});

test("English access messages alone do not classify errors", () => {
  expect(isAccessFailure(new Error("Item not found or access denied."))).toBe(false);
  expect(isAccessFailure(new Error("Sign in with a verified account to continue."))).toBe(false);
  expect(isAccessFailure(new Error("Workspace context is unavailable. Please try again."))).toBe(
    false,
  );
});
