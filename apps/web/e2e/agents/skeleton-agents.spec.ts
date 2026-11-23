import { addAgent, createAgent } from "../test-support/agent-work";
import { conversation, test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("caller settings keep their layout while the owner's real settings load", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account);
  const channel = await conversation(account);
  await addAgent(account, channel.id, agent.id);
  const user = await client(account);
  const ready = Promise.withResolvers<{ status?: number; error?: string }>();
  const release = Promise.withResolvers<void>();
  await user.page.route("**/api/v1/agents/actors/callers/list", async (route) => {
    try {
      const response = await route.fetch();
      ready.resolve({ status: response.status() });
      await release.promise;
      if (!user.page.isClosed()) await route.fulfill({ response });
    } catch (error) {
      ready.resolve({ error: String(error) });
    }
  });

  try {
    const since = user.events.length;
    const search = new URLSearchParams({
      workspaceId: user.actor.organizationId,
      agentId: agent.id,
      section: "run",
    });
    await user.page.goto(`/agents?${search}`);
    await user.waitForEvent(
      since,
      (event) => event.type === "ready",
      "The real authenticated WebSocket completes its ready handshake",
    );
    const result = await ready.promise;
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);
    const loading = user.page.getByRole("status", { name: "Loading caller settings" });
    await expect(loading).toBeVisible();
    const radios = loading.locator('[role="radio"]');
    await expect(radios).toHaveCount(3);
    for (const radio of await radios.all()) await expect(radio).toBeDisabled();
    await expect(
      loading.locator("button:not(:disabled), input:not(:disabled), [tabindex='0']"),
    ).toHaveCount(0);
  } finally {
    release.resolve();
    if (!user.page.isClosed()) await user.page.unrouteAll({ behavior: "wait" });
  }
  await expect(user.page.getByRole("status", { name: "Loading caller settings" })).toHaveCount(0);
  const settings = user.page.getByRole("region", { name: "Who can call this agent" });
  await expect(settings.getByRole("radio", { name: "Only me" })).toBeChecked();
  await expect(settings.getByRole("radio", { name: "Ask me first" })).toBeEnabled();
  await expect(user.page.getByRole("region", { name: "Allowed callers" })).toBeVisible();
  // The initial cache refresh can finish only after the held caller-settings response is released.
  await expect(
    user.page.getByText(
      /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
    ),
  ).toHaveCount(0);
});
