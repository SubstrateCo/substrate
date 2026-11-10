import { addAgent, createAgent } from "./test-support/agent-work";
import { conversation, post, test, visit } from "./test-support/fixtures";
import { detail, project } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("opening a thread keeps message authors at the same left edge", async ({ actors, client }) => {
  const channel = await conversation(actors.sender);
  const body = `Stable message ${channel.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: channel.id, body });
  const sender = await client(actors.sender);
  await visit(sender, channel.id);
  const message = sender.page.getByTestId("conversation-content").getByText(body, { exact: true });
  await expect(message).toBeVisible();
  const before = (await message.boundingBox())!;
  await sender.page.getByRole("button", { name: "Reply in thread", exact: true }).click();
  await expect(
    sender.page.getByRole("complementary", { name: "Thread", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await message.boundingBox())!.x).toBe(before.x);
});

test("opening task details does not resize or move the task list", async ({ actors, client }) => {
  const created = await project(actors.sender);
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Stable task",
  });
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks", { projectId: created.entityId });
  const list = sender.page.getByRole("region", { name: "Project tasks", exact: true });
  await expect(list).toBeVisible();
  const status = list
    .getByRole("button", { name: /^Change status of Stable task:/ })
    .locator("svg");
  const groupStatus = list
    .getByRole("button", { name: /^Not started 1$/ })
    .locator("svg")
    .last();
  expect((await status.boundingBox())!.x).toBe((await groupStatus.boundingBox())!.x);
  const before = (await list.boundingBox())!;
  await list.getByRole("button", { name: /^Not started: Stable task/ }).click();
  await expect(sender.page.getByRole("complementary", { name: "Task", exact: true })).toBeVisible();
  await expect.poll(async () => (await list.boundingBox())!.width).toBe(before.width);
  expect((await list.boundingBox())!.x).toBe(before.x);
});

for (const [path, title, column] of [
  ["/settings/user/preferences", "Preferences", '[data-slot="settings-content"]'],
  ["/notifications", "Notifications", '[aria-label="Notification feed"] > div'],
] as const) {
  test(`${title} uses a centered content column`, async ({ actors, client }) => {
    const sender = await client(actors.sender);
    await sender.page.setViewportSize({ width: 1920, height: 1080 });
    await visit(sender, undefined, path);
    await expect(sender.page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const content = sender.page.locator(column);
    const bounds = await content.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return { center: box.x + box.width / 2, parentCenter: parent.x + parent.width / 2 };
    });
    expect(Math.abs(bounds.center - bounds.parentCenter)).toBeLessThan(2);
  });
}

test("desktop system theme sends the preference rather than the resolved color", async ({
  actors,
  client,
}) => {
  const sender = await client(actors.sender);
  await sender.page.emulateMedia({ colorScheme: "light" });
  await sender.page.addInitScript(() => {
    localStorage.setItem("startup-os-theme", "dark");
    window.startupOSWindow = {
      platform: "win32",
      isFullscreen: async () => false,
      onFullscreenChange: () => () => {},
      setTheme: async (theme) => {
        document.documentElement.dataset.nativeTheme = theme;
      },
    };
  });
  await visit(sender, undefined, "/settings/user/preferences");
  await sender.page.getByRole("radio", { name: "System", exact: true }).click();
  await expect(sender.page.locator("html")).toHaveAttribute("data-native-theme", "system");
  await expect(sender.page.locator("html")).toHaveClass(/light/);
  await sender.page.emulateMedia({ colorScheme: "dark" });
  await expect(sender.page.locator("html")).toHaveClass(/dark/);
});

test("project assignees show an identity card without opening the task", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const data = await detail(actors.sender, created.entityId);
  const assignee = data.actors.find((actor) => actor.name === actors.sender.name)!;
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Hover assignment",
    assigneeActorEntityId: assignee.entityId,
  });
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks", { projectId: created.entityId });
  const trigger = sender.page.getByLabel(`Assigned to ${assignee.name}`, { exact: true });
  await trigger.hover();
  const card = sender.page.locator('[data-slot="hover-card-content"]');
  await expect(card.getByText(assignee.name, { exact: true })).toBeVisible();
  await expect(sender.page.getByRole("complementary", { name: "Task", exact: true })).toHaveCount(
    0,
  );
  await sender.page.mouse.move(0, 0);
  await expect(card).toHaveCount(0);
  await trigger.focus();
  await expect(card.getByText(assignee.name, { exact: true })).toBeVisible();
});

test("agent status stays a small badge and Needs you centers its empty state", async ({
  actors,
  client,
}) => {
  const agent = await createAgent(actors.sender);
  const channel = await conversation(actors.sender);
  await addAgent(actors.sender, channel.id, agent.id);
  const published = await actors.sender.request.post("/api/v1/agent-work/device/status", {
    data: {
      organizationId: actors.sender.organizationId,
      installationId: agent.installationId,
      userAgentId: agent.id,
      state: "idle",
      queuedCount: 0,
      version: 1,
    },
  });
  expect(published.ok(), await published.text()).toBe(true);
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/agents");
  const row = sender.page
    .getByRole("complementary", { name: "Agents", exact: true })
    .getByRole("button", { name: new RegExp(agent.name) });
  await expect(row).toBeVisible();
  const dot = row.getByRole("img");
  await expect(dot).toBeVisible();
  const dotBox = (await dot.boundingBox())!;
  const avatarBox = (await row.locator('[data-slot="avatar"]').boundingBox())!;
  expect(dotBox.width).toBeLessThanOrEqual(avatarBox.width / 2);
  const empty = sender.page.getByRole("heading", { name: "Nothing needs you", exact: true });
  await expect(empty).toBeVisible();
  const pane = sender.page.getByTestId("agents-content");
  const paneBox = (await pane.boundingBox())!;
  const emptyBox = (await empty.boundingBox())!;
  expect(Math.abs(emptyBox.x + emptyBox.width / 2 - (paneBox.x + paneBox.width / 2))).toBeLessThan(
    2,
  );
  expect(emptyBox.y).toBeGreaterThan(paneBox.y + paneBox.height / 3);
});
