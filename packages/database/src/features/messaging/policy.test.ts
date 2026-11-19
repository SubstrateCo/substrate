import { messagingLimits, type ConversationKind } from "@substrate/contracts/messaging/input";

import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import {
  canManage,
  canShare,
  invitationTarget,
  leaveBlocked,
  leavePlan,
  partnerTargetAllowed,
  validateBody,
  validateCreate,
  validateEmoji,
  validateExternalInvitations,
  type Viewer,
} from "./policy";
import { describe, expect, test } from "bun:test";

const host = "host";
const conversation = (kind: ConversationKind, createdBy = "owner") => ({
  kind,
  organizationId: host,
  createdBy,
});
const viewer = (overrides: Partial<Viewer> = {}): Viewer => ({
  userId: "owner",
  organizationId: host,
  agent: false,
  admin: false,
  ...overrides,
});
const connected = { connected: true, visible: true };

describe("canShare", () => {
  test("host channels need an admin, groups their owner or an admin, and DMs their owner", () => {
    const cases = (["channel", "group", "dm"] as const).map((kind) => ({
      kind,
      owner: canShare(conversation(kind), viewer(), connected),
      admin: canShare(conversation(kind), viewer({ userId: "other", admin: true }), connected),
      member: canShare(conversation(kind), viewer({ userId: "other" }), connected),
    }));
    expect(cases).toEqual([
      { kind: "channel", owner: false, admin: true, member: false },
      { kind: "group", owner: true, admin: true, member: false },
      { kind: "dm", owner: true, admin: false, member: false },
    ]);
  });

  test("partners need a connection, and then an admin or a visible DM", () => {
    const partner = viewer({ userId: "partner", organizationId: "partner" });
    const admin = { ...partner, admin: true };
    expect(canShare(conversation("group"), admin, connected)).toBe(true);
    expect(canShare(conversation("group"), partner, connected)).toBe(false);
    expect(canShare(conversation("dm"), partner, connected)).toBe(true);
    expect(canShare(conversation("dm"), admin, { connected: true, visible: false })).toBe(false);
    expect(canShare(conversation("channel"), admin, { connected: false, visible: true })).toBe(
      false,
    );
  });

  test("agents never share, even for an admin owner", () => {
    expect(canShare(conversation("group"), viewer({ agent: true, admin: true }), connected)).toBe(
      false,
    );
  });
});

test("canManage allows the host owner and host admins, never DMs, partners or agents", () => {
  expect(canManage(conversation("group"), viewer())).toBe(true);
  expect(canManage(conversation("channel"), viewer({ userId: "other", admin: true }))).toBe(true);
  expect(canManage(conversation("channel"), viewer({ userId: "other" }))).toBe(false);
  expect(canManage(conversation("dm"), viewer({ admin: true }))).toBe(false);
  expect(canManage(conversation("group"), viewer({ agent: true }))).toBe(false);
  // A legacy external creator keeps no authority in the host organization.
  expect(canManage(conversation("group"), viewer({ organizationId: "partner", admin: true }))).toBe(
    false,
  );
});

test("host channel invitations ask the partner organization; others ask the person", () => {
  expect(invitationTarget(conversation("channel"), viewer())).toEqual({
    purpose: "organization",
    targetOrganizationId: null,
  });
  expect(invitationTarget(conversation("group"), viewer())).toEqual({
    purpose: "person",
    targetOrganizationId: null,
  });
  expect(invitationTarget(conversation("channel"), viewer({ organizationId: "partner" }))).toEqual({
    purpose: "person",
    targetOrganizationId: "partner",
  });
});

test("the host targets any partner, a partner only itself, and nobody the host", () => {
  const partner = viewer({ organizationId: "partner" });
  expect(partnerTargetAllowed(conversation("channel"), viewer(), "partner")).toBe(true);
  expect(partnerTargetAllowed(conversation("channel"), viewer(), host)).toBe(false);
  expect(partnerTargetAllowed(conversation("channel"), partner, "partner")).toBe(true);
  expect(partnerTargetAllowed(conversation("channel"), partner, "another")).toBe(false);
  expect(partnerTargetAllowed(conversation("channel"), partner, host)).toBe(false);
});

test("external invitations need history consent, and an admin for channels", () => {
  const invite = (kind: ConversationKind, admin: boolean, shareHistory: boolean) => () =>
    validateExternalInvitations({ kind }, viewer({ admin }), { count: 1, shareHistory });
  expect(invite("channel", false, true)).toThrow(ValidationError);
  expect(invite("group", false, false)).toThrow(ValidationError);
  expect(invite("channel", true, true)).not.toThrow();
  expect(invite("group", false, true)).not.toThrow();
  expect(() =>
    validateExternalInvitations({ kind: "channel" }, viewer(), { count: 0, shareHistory: false }),
  ).not.toThrow();
});

test("new conversations need the right recipient count and a channel name", () => {
  expect(() => validateCreate({ kind: "dm" }, 2)).toThrow(ValidationError);
  expect(() => validateCreate({ kind: "group" }, 1)).toThrow(ValidationError);
  expect(() => validateCreate({ kind: "channel", name: "  " }, 0)).toThrow(ValidationError);
  expect(validateCreate({ kind: "channel", name: " Launch " }, 0)).toEqual({
    name: "Launch",
    private: false,
  });
  expect(validateCreate({ kind: "group", private: false }, 2)).toEqual({
    name: null,
    private: true,
  });
});

test("owners leave only by naming another owner; DMs and agents cannot leave", () => {
  expect(leavePlan(conversation("group"), viewer({ userId: "member" }))).toBe("leave");
  expect(leavePlan(conversation("group"), viewer(), "next")).toBe("transfer");
  expect(leavePlan(conversation("group"), viewer(), "owner")).toBe("blocked");
  expect(leavePlan(conversation("group"), viewer({ organizationId: "partner" }))).toBe("leave");
  expect(() => leavePlan(conversation("dm"), viewer({ userId: "member" }))).toThrow(
    AccessDeniedError,
  );
  expect(() => leavePlan(conversation("group"), viewer({ agent: true }))).toThrow(
    AccessDeniedError,
  );
  expect(leaveBlocked(true)).toBeInstanceOf(ConflictError);
  expect(leaveBlocked(false).message).toContain("Delete the conversation");
});

test("bodies and reactions must not be blank or too long", () => {
  expect(() => validateBody(" ")).toThrow(ValidationError);
  expect(() => validateBody("x".repeat(messagingLimits.body + 1))).toThrow(ValidationError);
  expect(() => validateBody("x".repeat(messagingLimits.body))).not.toThrow();
  expect(() => validateEmoji("")).toThrow(ValidationError);
  expect(() => validateEmoji("x".repeat(messagingLimits.emoji + 1))).toThrow(ValidationError);
  expect(() => validateEmoji("x".repeat(messagingLimits.emoji))).not.toThrow();
});
