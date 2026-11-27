import { createAgent } from "../test-support/agent-work";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("an agent waits for its catalog before opening its settings sheet", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account);
  const user = await client(account);
  const release = Promise.withResolvers<void>();
  await user.page.route("**/api/v1/agents/list", async (route) => {
    // Hold the browser request, not a fetched response that can outlive a canceled query.
    await release.promise;
    await route.continue();
  });
  try {
    const since = user.events.length;
    const search = new URLSearchParams({
      workspaceId: account.organizationId,
      agentId: agent.id,
      settings: "overview",
    });
    await user.page.goto(`/agents?${search}`);
    await user.waitForEvent(
      since,
      (event) => event.type === "ready",
      "The authenticated WebSocket completes its ready handshake",
    );
    await expect(
      user.page.getByRole("status", { name: "Loading agent", exact: true }),
    ).toBeVisible();
    await expect(
      user.page.getByRole("dialog", { name: "Agent settings", exact: true }),
    ).toHaveCount(0);
  } finally {
    release.resolve();
    await user.page.unrouteAll({ behavior: "wait" });
  }
  await expect(
    user.page.getByRole("dialog", { name: "Agent settings", exact: true }),
  ).toBeVisible();
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(agent.name);
  await expect(
    user.page.getByText(
      /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
    ),
  ).toHaveCount(0);
});
