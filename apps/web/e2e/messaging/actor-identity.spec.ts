import { provisionVerifiedAccount } from "../../../server/integration/test-support/auth";
import { Mailpit } from "../../../server/integration/test-support/mailpit";
import { callTool, createAgent, startTurn } from "../test-support/agent-work";
import { inviteMember, post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { project } from "../test-support/tasks";
import { expect, type Locator } from "@playwright/test";

async function expectIdentity(container: Locator, agent: boolean, letters?: string) {
  const avatar = container.locator("[data-slot=avatar]");
  const fallback = avatar.locator("[data-slot=avatar-fallback]");
  await expect(avatar).toHaveAttribute("data-variant", agent ? "agent" : "default");
  if (agent) {
    await expect(fallback.locator("svg.lucide-bot")).toBeVisible();
  } else {
    await expect(fallback).toHaveText(letters!);
  }
  for (const surface of [avatar, fallback]) {
    await expect
      .poll(() =>
        surface.evaluate((element) => {
          const style = getComputedStyle(element);
          return parseFloat(style.borderTopLeftRadius) >= element.getBoundingClientRect().width / 2;
        }),
      )
      .toBe(!agent);
  }
}

test("missing photos keep humans and agents distinct in search, selections, members, and replies", async ({
  actors,
  client,
  request,
}) => {
  test.setTimeout(60_000);
  const originalName = actors.sender.name;
  try {
    expect(
      (
        await actors.sender.request.post("/api/auth/update-user", { data: { name: "Alex Morgan" } })
      ).ok(),
    ).toBe(true);
    actors.sender.name = "Alex Morgan";
    const person = {
      name: "Maya Chen",
      email: `maya.chen+${crypto.randomUUID().slice(0, 6)}@example.test`,
      password: `Identity-${crypto.randomUUID()}!`,
    };
    await provisionVerifiedAccount({ request }, new Mailpit(request), person);
    const invitation = await inviteMember(actors.sender, person.email);
    expect(
      (
        await request.post("/api/auth/organization/accept-invitation", {
          data: { invitationId: invitation.id },
        })
      ).ok(),
    ).toBe(true);
    const agent = await createAgent(actors.sender, "Maya Assistant");
    const channel = await post<{ id: string }>(actors.sender, "messaging/conversations", {
      kind: "channel",
      name: "launch-review",
      private: true,
    });
    const user = await client(actors.sender);
    const { page } = user;
    await page.emulateMedia({ colorScheme: "dark" });
    await visit(user, channel.id);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Add people and agents", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const picker = dialog.getByRole("combobox", { name: "People", exact: true });
    await picker.fill("Maya");
    const personOption = dialog.getByRole("option").filter({ hasText: "Maya Chen" });
    const agentOption = dialog.getByRole("option").filter({ hasText: agent.name });
    await expectIdentity(personOption, false, "MC");
    await expectIdentity(agentOption, true);
    await expect(agentOption).toHaveAccessibleName(`${agent.name}, Agent`);
    await captureScreenshot(page, "actor-identity-dark-search");
    await personOption.click();
    await picker.fill(agent.name);
    await agentOption.click();
    for (const [name, isAgent, letters] of [
      ["Maya Chen", false, "MC"],
      [agent.name, true, undefined],
    ] as const) {
      const chip = dialog.locator("[data-slot=people-picker] > span").filter({ hasText: name });
      await expectIdentity(chip, isAgent, letters);
      if (isAgent) await expect(chip.locator(".sr-only")).toHaveText(", Agent");
    }
    await captureScreenshot(page, "actor-identity-dark-selected");
    await dialog.getByRole("button", { name: "Add 2 people", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Members, 3 members", exact: true }).click();
    await expectIdentity(page.getByRole("listitem").filter({ hasText: "Maya Chen" }), false, "MC");
    const agentMember = page.getByRole("listitem").filter({ hasText: agent.name });
    await expectIdentity(agentMember, true);
    await expect(agentMember.locator("[tabindex='0'] .sr-only")).toHaveText(", Agent");
    await captureScreenshot(page, "actor-identity-dark-members");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "New message", exact: true }).click();
    await page.getByRole("combobox", { name: "Search people", exact: true }).fill("Maya");
    const directAgent = page.getByRole("option", { name: `${agent.name}, Agent`, exact: true });
    await expectIdentity(page.getByRole("option", { name: "Maya Chen", exact: true }), false, "MC");
    await expectIdentity(directAgent, true);
    await captureScreenshot(page, "actor-identity-dark-new-message");
    await page.keyboard.press("Escape");

    const body = "Please check the launch plan.";
    const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body,
    });
    const replyBody = "The launch plan is ready for review.";
    await callTool(
      actors.sender,
      await startTurn(actors.sender, agent, channel.id, root),
      "reply",
      { body: replyBody, to: { conversationId: channel.id } },
    );
    await expectIdentity(page.getByRole("article").filter({ hasText: body }), false, "AM");
    const reply = page.getByRole("article").filter({ hasText: replyBody });
    await expectIdentity(reply, true);
    await expect(reply.getByText("Agent", { exact: true })).toBeVisible();
    await captureScreenshot(page, "actor-identity-dark-messages");
    await reply.getByRole("button", { name: agent.name, exact: true }).click();
    const profile = page.getByRole("dialog", { name: `${agent.name} profile`, exact: true });
    await expectIdentity(profile, true);
    const badge = profile.getByText("Agent", { exact: true });
    await expect(badge).toBeVisible();
    await expect(profile.getByText("Owned by Alex Morgan", { exact: true })).toBeVisible();
    const expectHeaderBadge = async () => {
      await expect
        .poll(async () => {
          const name = await profile.getByText(agent.name, { exact: true }).boundingBox();
          const tag = await badge.boundingBox();
          const avatar = await profile.locator("[data-slot=avatar]").boundingBox();
          const card = await profile.boundingBox();
          return {
            alignedToHeader: !!tag && !!avatar && Math.abs(tag.y - avatar.y) < 1,
            rightOfName: !!tag && !!name && tag.x >= name.x + name.width,
            insideCard: !!tag && !!card && tag.x + tag.width <= card.x + card.width,
          };
        })
        .toEqual({ alignedToHeader: true, rightOfName: true, insideCard: true });
    };
    await expectHeaderBadge();
    await captureScreenshot(page, "actor-identity-dark-profile");
    await page.setViewportSize({ width: 360, height: 800 });
    await expectHeaderBadge();
    await expectIdentity(profile, true);
  } finally {
    expect(
      (
        await actors.sender.request.post("/api/auth/update-user", { data: { name: originalName } })
      ).ok(),
    ).toBe(true);
    actors.sender.name = originalName;
  }
});

test("a task can be assigned to an agent and keeps its identity after reload", async ({
  actors,
  client,
}) => {
  const agent = await createAgent(actors.sender, "Task Assistant");
  const created = await project(actors.sender);
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Review actor identity",
  });
  const user = await client(actors.sender);
  await user.page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const assignee = user.page.getByRole("combobox", { name: /^Assignee:/ });
  await assignee.click();
  const option = user.page.getByRole("option", { name: agent.name, exact: true });
  await expectIdentity(option, true);
  await option.click();
  await expect(assignee).toHaveAccessibleName(`Assignee: ${agent.name}, Agent`);
  await expectIdentity(assignee, true);
  await expect(assignee.locator(".sr-only")).toHaveText(", Agent");
  await captureScreenshot(user.page, "actor-identity-dark-task-assignee");
  await user.page.reload();
  await expect(assignee).toHaveAccessibleName(`Assignee: ${agent.name}, Agent`);
});
