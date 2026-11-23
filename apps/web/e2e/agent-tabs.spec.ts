import { createAgent } from "./test-support/agent-work";
import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("an agent waits for its catalog before mounting its tab panels", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account);
  const user = await client(account);
  const release = Promise.withResolvers<void>();
  await user.page.route("**/api/v1/agents/list", async (route) => {
    const response = await route.fetch();
    await release.promise;
    if (!user.page.isClosed()) await route.fulfill({ response });
  });
  try {
    const since = user.events.length;
    const search = new URLSearchParams({
      workspaceId: account.organizationId,
      agentId: agent.id,
      section: "general",
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
    await expect(user.page.getByRole("tablist", { name: "Agent views" })).toHaveCount(0);
  } finally {
    release.resolve();
    await user.page.unrouteAll({ behavior: "wait" });
  }
  await expect(user.page.getByRole("tabpanel", { name: "Settings", exact: true })).toBeVisible();
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(agent.name);
  await expect(
    user.page.getByText(
      /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
    ),
  ).toHaveCount(0);
});

test("agent tabs keep distinct panels and load calls only when opened", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account);
  const user = await client(account);
  const release = Promise.withResolvers<void>();
  let callsRequested = false;
  await user.page.route("**/api/v1/agent-work/calls?*", async (route) => {
    callsRequested = true;
    const response = await route.fetch();
    await release.promise;
    if (!user.page.isClosed()) await route.fulfill({ response });
  });
  try {
    await visit(user, undefined, "/agents", { agentId: agent.id });
    const messages = user.page.getByRole("tabpanel", { name: "Messages", exact: true });
    await expect(messages.getByRole("button", { name: "Start conversation" })).toBeVisible();
    expect(callsRequested).toBe(false);
    const messagesId = await messages.getAttribute("id");
    await user.page.getByRole("tab", { name: "Calls", exact: true }).click();
    const calls = user.page.getByRole("tabpanel", { name: "Calls", exact: true });
    await expect(calls.getByRole("status", { name: "Loading calls" })).toBeVisible();
    expect(await calls.getAttribute("id")).not.toBe(messagesId);
    await expect(user.page.getByRole("tab", { name: "Settings", exact: true })).toBeEnabled();
    await expect(messages).toBeHidden();
  } finally {
    release.resolve();
    await user.page.unrouteAll({ behavior: "wait" });
  }
  await expect(
    user.page.getByRole("tabpanel", { name: "Calls", exact: true }).getByText("No calls yet"),
  ).toBeVisible();
  await user.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(
    user.page
      .getByRole("tabpanel", { name: "Settings", exact: true })
      .getByRole("navigation", { name: "Agent sections" }),
  ).toBeVisible();
  await user.page.getByRole("tab", { name: "Messages", exact: true }).click();
  await expect(
    user.page
      .getByRole("tabpanel", { name: "Messages", exact: true })
      .getByRole("button", { name: "Start conversation" }),
  ).toBeVisible();
});
