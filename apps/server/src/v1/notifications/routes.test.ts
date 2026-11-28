import { defaultAccountNotificationPreferences } from "@substrate/contracts/notifications/preferences";

import { createApp } from "../../app";
import { appFixture, createTestScopes, scopeFixture } from "../../test-support";
import { expect, test } from "bun:test";

// Bodies are JSON text: some cases send input that the contract must reject.
const patch = (body: string) => ({
  method: "PATCH",
  headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  body,
});
const unreachable = async () => {
  throw new Error("Invalid input must not reach the service.");
};

test("account settings use the verified account without an active workspace", async () => {
  const deps = appFixture();
  const scope = { ...scopeFixture(), organizationId: null };
  scope.session.session.activeOrganizationId = null;
  const updates: unknown[] = [];
  deps.scopes = createTestScopes({
    api: {
      getSession: async () => scope.session,
      getActiveMemberRole: async () => {
        throw new Error("Account settings must not require an active membership.");
      },
    },
    repositories: {
      forOwnerSession: async ({ userId }) => ({
        ...scope.owner,
        notifications: {
          get: async () => ({
            ...defaultAccountNotificationPreferences,
            sound: userId !== scope.userId,
          }),
          update: async (input) => {
            updates.push({ userId, input });
            return { result: defaultAccountNotificationPreferences, hints: [] };
          },
        },
      }),
    },
  });
  const app = createApp(deps);
  const read = await app.request("/api/v1/notifications/preferences");
  expect(await read.json()).toEqual({
    success: true,
    data: { ...defaultAccountNotificationPreferences, sound: false },
  });
  const saved = await app.request(
    "/api/v1/notifications/preferences",
    patch(JSON.stringify({ sound: false })),
  );
  expect(saved.status).toBe(200);
  expect(updates).toEqual([{ userId: scope.userId, input: { sound: false } }]);
});

test("account settings reject unknown fields and invalid schedules before the service", async () => {
  const deps = appFixture();
  deps.services.notificationPreferences.updateAccount = unreachable;
  const app = createApp(deps);
  for (const body of [
    { userId: "someone-else" },
    { schedule: { days: [1], start: 60, end: 60, timeZone: "UTC" } },
    { schedule: { days: [1], start: 60, end: 120, timeZone: "Mars/Base" } },
    { preview: "everything" },
  ]) {
    const response = await app.request(
      "/api/v1/notifications/preferences",
      patch(JSON.stringify(body)),
    );
    expect(response.status).toBe(400);
  }
});

test("conversation settings take the conversation from the path and reject other fields", async () => {
  const deps = appFixture();
  const calls: unknown[] = [];
  deps.services.notificationPreferences.updateConversation = async (
    _scope,
    conversationId,
    input,
  ) => {
    calls.push({ conversationId, input });
    return { success: true, data: { level: "mentions", mutedUntil: null } };
  };
  const app = createApp(deps);
  const conversationId = "00000000-0000-4000-8000-000000000001";
  const path = `/api/v1/notifications/preferences/conversations/${conversationId}`;
  const saved = await app.request(
    path,
    patch(JSON.stringify({ organizationId: "org", level: "mentions" })),
  );
  expect(saved.status).toBe(200);
  expect(calls).toEqual([{ conversationId, input: { organizationId: "org", level: "mentions" } }]);
  for (const [target, body] of [
    [path, { organizationId: "org", conversationId: "another" }],
    [path, { organizationId: "org", level: "loud" }],
    ["/api/v1/notifications/preferences/conversations/not-a-uuid", { organizationId: "org" }],
  ] as const) {
    deps.services.notificationPreferences.updateConversation = unreachable;
    const response = await app.request(target, patch(JSON.stringify(body)));
    expect(response.status).toBe(400);
  }
});
