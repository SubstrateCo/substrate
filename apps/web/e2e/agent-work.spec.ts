import { mcpTools } from "@startup-os/contracts/harness/tools";

import { conversation, expect, test, visit } from "./test-support/fixtures";
import { project, visitProject } from "./test-support/tasks";

test("agents receive explicit access and their messages, comments and activity are labelled", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const origin = process.env.PLAYWRIGHT_BASE_URL!;
  const name = `Research ${crypto.randomUUID()}`;
  const saved = await owner.request.post("/api/v1/agents/actors/save", {
    headers: { origin },
    data: { name, instructions: "Help with work", harness: "opencode", enabled: true },
  });
  expect(saved.ok()).toBe(true);
  const agentId: string = (await saved.json()).data.id;
  const [channel, created] = await Promise.all([conversation(owner), project(owner)]);
  const user = await client(owner);
  await visit(user, channel.id);
  await user.page.getByRole("button", { name: "Add people", exact: true }).click();
  await user.page.getByRole("checkbox", { name: `${name} Agent`, exact: true }).check();
  await user.page.getByRole("button", { name: "Add members", exact: true }).click();
  await expect(user.page.getByRole("checkbox", { name: `${name} Agent`, exact: true })).toHaveCount(
    0,
  );
  const sent = await owner.request.post("/api/v1/mcp/call", {
    headers: { origin },
    data: {
      organizationId: owner.organizationId,
      agentId,
      tool: "send_message",
      input: {
        requestId: crypto.randomUUID(),
        conversationId: channel.id,
        body: "Agent progress report",
      },
    },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  const message = mcpTools.send_message.output.parse((await sent.json()).data);
  const article = user.page.getByRole("article").filter({ hasText: "Agent progress report" });
  await expect(article.getByText(name, { exact: true })).toBeVisible();
  await expect(article.getByText("Agent", { exact: true })).toBeVisible();
  await expect(article.getByText("External", { exact: true })).toHaveCount(0);
  await visitProject(user, created.entityId);
  await user.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await user.page.getByRole("button", { name: "Add access", exact: true }).click();
  const agentOption = user.page.getByRole("option", { name: new RegExp(name) });
  await expect(agentOption.getByText("Agent", { exact: true })).toBeVisible();
  await agentOption.click();
  await user.page.getByRole("button", { name: "Review access", exact: true }).click();
  await user.page.getByRole("button", { name: "Confirm access", exact: true }).click();
  await expect(
    user.page.getByRole("dialog", { name: "Review access change", exact: true }),
  ).toHaveCount(0);
  await expect(user.page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  const taskResponse = await owner.request.post("/api/v1/mcp/call", {
    headers: { origin },
    data: {
      organizationId: owner.organizationId,
      agentId,
      tool: "create_task",
      input: {
        requestId: crypto.randomUUID(),
        projectId: created.entityId,
        title: "Agent follow-up",
        source: { type: "message", conversationId: channel.id, messageId: message.messageId },
      },
    },
  });
  expect(taskResponse.ok(), await taskResponse.text()).toBe(true);
  const task = mcpTools.create_task.output.parse((await taskResponse.json()).data);
  const commentResponse = await owner.request.post("/api/v1/mcp/call", {
    headers: { origin },
    data: {
      organizationId: owner.organizationId,
      agentId,
      tool: "add_task_comment",
      input: {
        requestId: crypto.randomUUID(),
        taskId: task.taskId,
        body: "Agent investigation notes",
      },
    },
  });
  expect(commentResponse.ok()).toBe(true);
  await visitProject(user, created.entityId, task.taskId);
  const comment = user.page.getByRole("article").filter({ hasText: "Agent investigation notes" });
  await expect(comment.getByText(name, { exact: true })).toBeVisible();
  await expect(comment.getByText("Agent", { exact: true })).toBeVisible();
  const activity = user.page.getByRole("region", { name: "Task activity", exact: true });
  await expect(activity.getByText("Agent", { exact: true }).first()).toBeVisible();
  await expect(
    user.page.getByRole("link", {
      name: `Created from a discussion · ${channel.name}`,
      exact: true,
    }),
  ).toBeVisible();
});
