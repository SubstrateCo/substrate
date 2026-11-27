import { createApp } from "../../app";
import { appFixture, createTestScopes, scopeFixture } from "../../test-support";
import { expect, test } from "bun:test";

test("attention uses the verified account without requiring an active workspace", async () => {
  const deps = appFixture();
  const scope = { ...scopeFixture(), organizationId: null };
  scope.session.session.activeOrganizationId = null;
  deps.scopes = createTestScopes({
    api: {
      getSession: async () => scope.session,
      getActiveMemberRole: async () => {
        throw new Error("Account attention must not require an active membership.");
      },
    },
    repositories: {
      forOwnerSession: async ({ userId }) => ({
        ...scope.owner,
        attention: async () => ({ count: userId === scope.userId ? 6 : 100 }),
      }),
    },
  });
  const response = await createApp(deps).request("/api/v1/attention?userId=another-person");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: { count: 6 } });
});

for (const verified of [false, true]) {
  test(`attention rejects ${verified ? "anonymous" : "unverified"} sessions`, async () => {
    const deps = appFixture();
    const scope = scopeFixture();
    scope.session.user.emailVerified = false;
    deps.scopes = createTestScopes({
      api: {
        getSession: async () => (verified ? null : scope.session),
        getActiveMemberRole: async () => ({ role: "owner" }),
      },
    });
    deps.services.attention.summary = async () => {
      throw new Error("Private attention must not be read.");
    };
    const response = await createApp(deps).request("/api/v1/attention");
    expect(response.status).toBe(verified ? 401 : 403);
  });
}
