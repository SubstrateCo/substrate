import { createApp } from "../../app";
import { appFixture, createTestScopes, scopeFixture } from "../../test-support";
import { expect, test } from "bun:test";

test("agent avatar changes accept only stored avatar codes", async () => {
  const deps = appFixture();
  const scope = scopeFixture();
  deps.scopes = createTestScopes({
    api: {
      getSession: async () => scope.session,
      getActiveMemberRole: async () => ({ role: "owner" }),
    },
  });
  const changes: unknown[] = [];
  deps.services.agents.setAgentAvatar = async (_scope, input) => {
    changes.push(input);
    return {
      success: true,
      data: {
        id: input.id,
        avatar: input.avatar,
        name: "Helper",
        instructions: "",
        harness: "claude",
        enabled: true,
        disabledApps: [],
        substrateGuide: true,
      },
    };
  };
  const app = createApp(deps);
  const id = crypto.randomUUID();
  const change = (avatar: string | { body: string }) =>
    app.request("/api/v1/agents/actors/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ id, avatar }),
    });
  // Wrong version, unknown body preset, wrong length, and a body/colour object.
  for (const avatar of ["231005", "1z1005", "13100", { body: "circle" }])
    expect((await change(avatar)).status).toBe(400);
  expect(changes).toEqual([]);
  expect((await change("131005")).status).toBe(200);
  expect(changes).toEqual([{ id, avatar: "131005" }]);
});
