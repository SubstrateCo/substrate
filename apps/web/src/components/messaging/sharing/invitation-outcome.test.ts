import { invitationOutcome } from "./invitation-outcome";
import { ApiError } from "@/api/result";
import { expect, test } from "bun:test";

const now = Date.parse("2026-11-27T12:00:00Z");
const pending = {
  status: "pending" as const,
  expiresAt: "2026-11-28T12:00:00Z",
  targetOrganizationId: null,
  conversationId: null,
};
const base = { invitation: undefined, result: undefined, now, declined: false, error: null };

test("an invitation shows loading until it is read, and a retry after a temporary failure", () => {
  expect(invitationOutcome(base).kind).toBe("loading");
  expect(
    invitationOutcome({ ...base, error: new ApiError("INTERNAL_ERROR", "Slow", 408) }).kind,
  ).toBe("failed");
});

test("a pending invitation can be answered until it expires", () => {
  expect(invitationOutcome({ ...base, invitation: pending })).toEqual({
    kind: "respond",
    invitation: pending,
  });
  expect(
    invitationOutcome({ ...base, invitation: { ...pending, expiresAt: "2026-11-27T11:00:00Z" } })
      .kind,
  ).toBe("closed");
  expect(invitationOutcome({ ...base, invitation: { ...pending, status: "revoked" } }).kind).toBe(
    "closed",
  );
});

test("a permanent failure is missing, even over an invitation read earlier", () => {
  const error = new ApiError("NOT_FOUND", "Gone", 404);
  expect(invitationOutcome({ ...base, error }).kind).toBe("missing");
  expect(invitationOutcome({ ...base, invitation: pending, error }).kind).toBe("missing");
});

test("an answer wins over the invitation's state and over a failed reload", () => {
  const error = new ApiError("NOT_FOUND", "Gone", 404);
  expect(invitationOutcome({ ...base, invitation: pending, declined: true, error }).kind).toBe(
    "declined",
  );
  expect(
    invitationOutcome({
      ...base,
      invitation: pending,
      error,
      result: { status: "accepted", organizationId: "org-b", conversationId: "c1" },
    }),
  ).toEqual({ kind: "accepted", workspace: { organizationId: "org-b", conversationId: "c1" } });
  expect(
    invitationOutcome({
      ...base,
      invitation: pending,
      result: { status: "approval-required", organizationId: "org-b", conversationId: null },
    }).kind,
  ).toBe("approval");
});

test("an invitation accepted earlier reopens its workspace", () => {
  expect(
    invitationOutcome({
      ...base,
      invitation: {
        ...pending,
        status: "accepted",
        targetOrganizationId: "org-b",
        conversationId: "c1",
      },
    }),
  ).toEqual({ kind: "accepted", workspace: { organizationId: "org-b", conversationId: "c1" } });
});
