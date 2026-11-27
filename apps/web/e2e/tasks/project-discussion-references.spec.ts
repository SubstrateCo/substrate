import { conversation, post, test, visit } from "../test-support/fixtures";
import { project } from "../test-support/tasks";
import { expect } from "@playwright/test";

test("project discussions show message references by name and open them", async ({
  account,
  client,
}) => {
  const created = await project(account);
  const titles = ["Fix calendar overflow", "Hide empty pagination"];
  const tasks = await Promise.all(
    titles.map((title) =>
      post<{ id: string }>(account, "tasks/mutations", {
        organizationId: account.organizationId,
        action: "createTask",
        projectEntityId: created.entityId,
        title,
      }),
    ),
  );
  const channel = await conversation(account);
  await post(account, "messaging/messages", {
    conversationId: channel.id,
    body: `Added to @[project:${created.entityId}]:\n\n${tasks.map((item) => `- @[task:${item.id}]`).join("\n")}\n\nBoth are not started.`,
  });
  const user = await client(account);
  await visit(user, undefined, "/tasks", { projectId: created.entityId });
  await user.page.getByRole("tab", { name: "Discussions", exact: true }).click();
  const discussion = user.page.getByRole("listitem").filter({ hasText: "Both are not started." });
  await expect(discussion.getByRole("link", { name: created.name, exact: true })).toBeVisible();
  for (const title of titles)
    await expect(discussion.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expect(discussion.getByText("[Reference]")).toHaveCount(0);
  await discussion.getByRole("link", { name: titles[1]!, exact: true }).click();
  await expect.poll(() => new URL(user.page.url()).searchParams.get("taskId")).toBe(tasks[1]!.id);
});
