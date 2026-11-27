import { createAgent } from "../test-support/agent-work";
import { post, visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("agent settings preserve the underlying thread and return through subpage history", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account);
  const routine = await account.request.post("/api/v1/agent-work/routines", {
    data: {
      organizationId: account.organizationId,
      agentId: agent.id,
      name: "History routine",
      prompt: "Summarize open work.",
      cron: "0 9 * * 1-5",
      timezone: "UTC",
      enabled: false,
      destination: null,
    },
  });
  expect(routine.ok(), await routine.text()).toBe(true);
  const dm = await post<{ id: string }>(account, "messaging/conversations", {
    kind: "agent_dm",
    private: true,
    agentIds: [agent.id],
  });
  const root = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: dm.id,
    body: "Settings history root",
  });
  await post(account, "messaging/messages", {
    conversationId: dm.id,
    threadId: root.id,
    body: "Settings history reply",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/agents", { agentId: agent.id, messageId: root.id });
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread.getByText("Settings history reply", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Agent settings", exact: true });
  await expect(settings).toBeVisible();
  expect(new URL(page.url()).searchParams.get("messageId")).toBe(root.id);
  await settings.getByRole("button", { name: "Show all 1 routine", exact: true }).click();
  await expect(page).toHaveURL(/settings=routines/);
  const length = await page.evaluate(() => history.length);
  await settings.getByRole("button", { name: "Back to settings", exact: true }).click();
  await expect(page).toHaveURL(/settings=overview/);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(page).toHaveURL(/settings=routines/);
  await settings.getByRole("button", { name: "Close agent settings", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(thread.getByText("Settings history reply", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(settings).toBeVisible();
  await page.goBack();
  await expect(settings).toHaveCount(0);
  await thread.getByRole("button", { name: "Close thread", exact: true }).click();
  await expect(thread).toHaveCount(0);
});
