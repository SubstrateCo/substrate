import { createAgent } from "../test-support/agent-work";
import { conversation, post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

for (const kind of ["channel", "group"] as const) {
  test(`${kind} adds a person and owned agent together through Add people`, async ({
    actors,
    client,
  }) => {
    const agent = await createAgent(actors.sender, `Release assistant ${crypto.randomUUID()}`);
    const otherAgent = await createAgent(actors.member);
    const target =
      kind === "channel"
        ? await conversation(actors.sender)
        : await post<{ id: string }>(actors.sender, "messaging/conversations", {
            kind: "group",
            private: true,
            name: `Launch group ${crypto.randomUUID()}`,
            agentIds: [
              (await createAgent(actors.sender)).id,
              (await createAgent(actors.sender)).id,
            ],
          });
    const user = await client(actors.sender);
    await visit(user, target.id);
    await user.page.getByRole("button", { name: "Add people and agents", exact: true }).click();
    const dialog = user.page.getByRole("dialog");
    const picker = dialog.getByRole("combobox", { name: "People and agents", exact: true });
    await picker.press("ArrowDown");
    await expect(dialog.getByRole("option").filter({ hasText: actors.member.name })).toBeVisible();
    await expect(dialog.getByRole("option").filter({ hasText: agent.name })).toBeVisible();
    await expect(dialog.getByRole("option").filter({ hasText: otherAgent.name })).toHaveCount(0);
    await captureScreenshot(user.page, `unified-${kind}-people-picker`);
    await picker.fill(actors.member.name);
    await dialog.getByRole("option").filter({ hasText: actors.member.email }).click();
    await picker.fill(agent.name);
    const agentOption = dialog.getByRole("option").filter({ hasText: agent.name });
    await expect(agentOption).toHaveAccessibleName(`${agent.name}, Agent`);
    await agentOption.click();
    await dialog.getByRole("button", { name: "Add 2 people", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const count = kind === "channel" ? 3 : 5;
    await user.page.getByRole("button", { name: `Members, ${count} members`, exact: true }).click();
    await expect(
      user.page.getByRole("listitem").filter({ hasText: actors.member.name }),
    ).toBeVisible();
    const row = user.page.getByRole("listitem").filter({ hasText: agent.name });
    await expect(row.locator("[tabindex='0'] .sr-only")).toHaveText(", Agent");
    await user.page.keyboard.press("Escape");
    await user.page.getByRole("button", { name: "Add people and agents", exact: true }).click();
    await picker.fill(agent.name);
    await expect(dialog.getByRole("option").filter({ hasText: agent.name })).toHaveCount(0);
    await picker.fill(actors.member.email);
    await expect(dialog.getByRole("option").filter({ hasText: actors.member.name })).toHaveCount(0);
  });
}

test("new group message picks people and agents in the same field", async ({ actors, client }) => {
  const agent = await createAgent(actors.sender, `Planning assistant ${crypto.randomUUID()}`);
  const user = await client(actors.sender);
  await visit(user);
  await user.page.getByRole("button", { name: "New message", exact: true }).click();
  await user.page.getByRole("option", { name: "New group message", exact: true }).click();
  const dialog = user.page.getByRole("dialog", { name: "New group message", exact: true });
  const picker = dialog.getByRole("combobox", { name: "To", exact: true });
  await picker.fill(actors.member.name);
  await dialog.getByRole("option").filter({ hasText: actors.member.email }).click();
  await picker.fill(agent.name);
  await dialog.getByRole("option").filter({ hasText: agent.name }).click();
  const name = `Planning ${crypto.randomUUID()}`;
  await dialog.getByRole("textbox", { name: "Group name (optional)", exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    user.page.getByRole("textbox", { name: `Message ${name}`, exact: true }),
  ).toBeVisible();
  await user.page.getByRole("button", { name: "Members, 3 members", exact: true }).click();
  const row = user.page.getByRole("listitem").filter({ hasText: agent.name });
  await expect(row.locator("[tabindex='0'] .sr-only")).toHaveText(", Agent");
});

test("a partial add keeps only the failed agent selected and reports the saved person", async ({
  actors,
  client,
}) => {
  const agent = await createAgent(actors.sender);
  const channel = await conversation(actors.sender);
  const user = await client(actors.sender);
  await visit(user, channel.id);
  await user.page.getByRole("button", { name: "Add people and agents", exact: true }).click();
  const dialog = user.page.getByRole("dialog");
  const picker = dialog.getByRole("combobox", { name: "People and agents", exact: true });
  await picker.fill(actors.member.name);
  await dialog.getByRole("option").filter({ hasText: actors.member.email }).click();
  await picker.fill(agent.name);
  await dialog.getByRole("option").filter({ hasText: agent.name }).click();
  const deleted = await actors.sender.request.post("/api/v1/agents/actors/delete", {
    data: { id: agent.id },
  });
  expect(deleted.ok()).toBe(true);
  await dialog.getByRole("button", { name: "Add 2 people", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("1 added.");
  await expect(
    dialog.getByRole("button", { name: `Remove ${actors.member.name}`, exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: `Remove ${agent.name}`, exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await user.page.getByRole("button", { name: "Members, 2 members", exact: true }).click();
  await expect(
    user.page.getByRole("listitem").filter({ hasText: actors.member.name }),
  ).toBeVisible();
  await expect(user.page.getByRole("listitem").filter({ hasText: agent.name })).toHaveCount(0);
});

test("a direct message can choose an agent but does not offer membership changes", async ({
  actors,
  client,
}) => {
  const agent = await createAgent(actors.sender);
  const user = await client(actors.sender);
  await visit(user);
  await user.page.getByRole("button", { name: "New message", exact: true }).click();
  await user.page.getByRole("option", { name: "New direct message", exact: true }).click();
  const dialog = user.page.getByRole("dialog", { name: "New direct message", exact: true });
  await dialog.getByRole("combobox", { name: "To", exact: true }).fill(agent.name);
  await dialog.getByRole("option").filter({ hasText: agent.name }).click();
  await dialog.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    user.page.getByRole("textbox", { name: `Message ${agent.name}`, exact: true }),
  ).toBeVisible();
  await expect(
    user.page.getByRole("button", { name: "Add people and agents", exact: true }),
  ).toHaveCount(0);
});
