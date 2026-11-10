import { conversation, post, test, visit } from "./test-support/fixtures";
import { detail, project, share } from "./test-support/tasks";
import { expect, type Locator } from "@playwright/test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

async function expectPicture(container: Locator, image: string) {
  const picture = container.locator("img").filter({ visible: true }).first();
  await expect(picture).toHaveAttribute("src", image);
  await expect
    .poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
}

test("actor pictures reach notifications, threads, project discussions, comments and assignees without profile fetches", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const uploaded = await actors.sender.request.post("/api/v1/files/pictures/avatar", {
    multipart: { file: { name: "actor.png", mimeType: "image/png", buffer: png } },
  });
  expect(uploaded.ok()).toBe(true);
  const {
    data: { url: image },
  } = await uploaded.json();
  const update = await actors.sender.request.post("/api/auth/update-user", { data: { image } });
  expect(update.ok()).toBe(true);
  try {
    const created = await project(actors.sender);
    await share(actors.sender, created.entityId, actors.member.name, "edit");
    const projectData = await detail(actors.sender, created.entityId);
    const assignee = projectData.actors.find((actor) => actor.name === actors.sender.name)!;
    const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
      action: "createTask",
      organizationId: actors.sender.organizationId,
      projectEntityId: created.entityId,
      title: "Picture task",
      assigneeActorEntityId: assignee.entityId,
    });
    await post(actors.sender, "tasks/mutations", {
      action: "comment",
      organizationId: actors.sender.organizationId,
      projectEntityId: created.entityId,
      taskEntityId: task.id,
      body: "Picture comment",
    });
    const channel = await conversation(actors.sender, [actors.member.email], [actors.member]);
    const root = await post<{ id: string }>(actors.member, "messaging/messages", {
      conversationId: channel.id,
      body: "Picture thread",
    });
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: "Picture timeline",
    });
    const reply = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: `Picture reply @[task:${task.id}]`,
    });
    const member = await client(actors.member);
    const requests: string[] = [];
    member.page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await visit(member, channel.id);
    await expectPicture(
      member.page.getByRole("article").filter({ hasText: "Picture timeline" }),
      image,
    );
    const withoutPicture = member.page.getByRole("article").filter({ hasText: "Picture thread" });
    await expect(withoutPicture.locator('[data-slot="avatar-fallback"]')).toBeVisible();
    await expect(withoutPicture.locator("img")).toHaveCount(0);
    requests.length = 0;
    await member.page
      .getByRole("navigation", { name: "Apps" })
      .getByRole("button", { name: /^Notifications/ })
      .click();
    const notice = member.page.getByRole("listitem").filter({
      has: member.page.locator(`a[href*="messageId=${reply.id}"]`),
    });
    await expectPicture(notice, image);
    expect(requests.filter((path) => path.includes("/organization/get-full-organization"))).toEqual(
      [],
    );
    await notice.getByRole("link").click();
    const thread = member.page.getByRole("complementary", { name: "Thread", exact: true });
    await expectPicture(thread.getByRole("article").filter({ hasText: "Picture reply" }), image);
    await visit(member, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
    const properties = member.page.getByRole("combobox", { name: /^Assignee:/ });
    await expectPicture(properties, image);
    await expectPicture(
      member.page.getByRole("listitem").filter({ hasText: "Picture comment" }),
      image,
    );
    await member.page.getByRole("button", { name: "Close task", exact: true }).click();
    await member.page.getByRole("tab", { name: "Discussions", exact: true }).click();
    await expectPicture(
      member.page.getByRole("listitem").filter({ hasText: "Picture reply" }),
      image,
    );
    expect(requests.filter((path) => path === "/api/v1/messaging/profiles")).toEqual([]);
    await member.page.route(`**${image}`, (route) => route.abort());
    await visit(member, undefined, "/notifications");
    await expect(notice.locator('[data-slot="avatar-fallback"]')).toBeVisible();
    await expect(notice.getByRole("link")).toHaveAccessibleName(
      `${actors.sender.name} replied to a thread in ${channel.name}`,
    );
  } finally {
    await actors.sender.request.post("/api/auth/update-user", { data: { image: null } });
  }
});
