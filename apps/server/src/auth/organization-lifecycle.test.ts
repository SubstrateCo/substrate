import { createOrganizationLifecycle } from "./organization-lifecycle";
import { APIError } from "better-auth/api";
import { describe, expect, test } from "bun:test";

function fixture() {
  const effects: unknown[] = [];
  const handle = createOrganizationLifecycle({
    clearMembershipSharing: async (userId, organizationId) => {
      effects.push({ cleanup: { userId, organizationId } });
    },
    publishMembershipChange: async (input) => {
      effects.push({ membership: input });
    },
    publishInvitationChange: async (input) => {
      effects.push({ invitation: input });
    },
  });
  return { effects, handle };
}

const session = { user: { id: "user" } };
const member = { id: "membership", userId: "user", organizationId: "org", role: "member" };
const invitation = {
  id: "invitation",
  organizationId: "org",
  email: "recipient@example.com",
  status: "pending",
  expiresAt: new Date(),
};

describe("organization endpoint lifecycle", () => {
  test("successful leave clears sharing and publishes membership access changes", async () => {
    const f = fixture();
    await f.handle({
      path: "/organization/leave",
      body: { organizationId: "org" },
      returned: member,
      session,
    });
    expect(f.effects).toEqual([
      { cleanup: { userId: "user", organizationId: "org" } },
      { membership: { user: { id: "user" }, organization: { id: "org" } } },
    ]);
  });

  test("leave requires a matching request, result and authenticated user", async () => {
    const f = fixture();
    for (const input of [
      { body: {}, returned: member, session },
      { body: { organizationId: "other" }, returned: member, session },
      { body: { organizationId: "org" }, returned: { ...member, userId: "other" }, session },
      { body: { organizationId: "org" }, returned: member, session: null },
      { body: { organizationId: "org" }, returned: { organizationId: "org" }, session },
      { body: { organizationId: "org" }, returned: null, session },
    ]) {
      await f.handle({ path: "/organization/leave", ...input });
    }
    expect(f.effects).toEqual([]);
  });

  test("failed leave does not publish a completed membership cleanup", async () => {
    const effects: unknown[] = [];
    const handle = createOrganizationLifecycle({
      clearMembershipSharing: async () => {
        throw new Error("Cleanup failed");
      },
      publishMembershipChange: async (input) => {
        effects.push(input);
      },
      publishInvitationChange: async (input) => {
        effects.push(input);
      },
    });
    const failed = await handle({
      path: "/organization/leave",
      body: { organizationId: "org" },
      returned: member,
      session,
    }).then(
      () => false,
      () => true,
    );
    expect(failed).toBe(true);
    expect(effects).toEqual([]);
  });

  test.each([false, true])(
    "successful invite with resend=%s publishes exactly one invitation hint",
    async (resend) => {
      const f = fixture();
      await f.handle({
        path: "/organization/invite-member",
        body: { organizationId: "org", email: invitation.email, resend },
        returned: invitation,
        session,
      });
      expect(f.effects).toEqual([
        { invitation: { invitation: { organizationId: "org", email: invitation.email } } },
      ]);
    },
  );

  test("invitation hints use the committed result, including implicit organization and normalized email", async () => {
    const f = fixture();
    await f.handle({
      path: "/organization/invite-member",
      body: { email: "RECIPIENT@example.com", resend: true },
      returned: invitation,
      session,
    });
    expect(f.effects).toEqual([
      { invitation: { invitation: { organizationId: "org", email: "recipient@example.com" } } },
    ]);
  });

  test("malformed or non-pending invitation results produce no effects", async () => {
    const f = fixture();
    for (const returned of [
      null,
      {},
      { organizationId: "org", email: invitation.email },
      { ...invitation, id: "" },
      { ...invitation, email: "invalid" },
      { ...invitation, organizationId: "" },
      { ...invitation, status: "canceled" },
    ]) {
      await f.handle({ path: "/organization/invite-member", body: {}, returned, session });
    }
    expect(f.effects).toEqual([]);
  });

  test("endpoint failures and unrelated operations produce no effects", async () => {
    const f = fixture();
    for (const path of ["/organization/leave", "/organization/invite-member"]) {
      await f.handle({
        path,
        body: { organizationId: "org" },
        returned: new APIError("FORBIDDEN", { message: "Not allowed" }),
        session,
      });
    }
    await f.handle({ path: "/organization/remove-member", body: {}, returned: member, session });
    await f.handle({
      path: "/organization/cancel-invitation",
      body: {},
      returned: invitation,
      session,
    });
    expect(f.effects).toEqual([]);
  });
});
