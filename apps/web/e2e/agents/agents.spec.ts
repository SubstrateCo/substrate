import { callTool, claimTurn, createAgent as createHomedAgent } from "../test-support/agent-work";
import { conversation, post, test, visit, type Client } from "../test-support/fixtures";
import { expect, type Page } from "@playwright/test";
import { z } from "zod";

const settings = (page: Page) => page.getByRole("dialog", { name: "Agent settings", exact: true });

const openSettings = (page: Page) =>
  page.getByRole("button", { name: "Settings", exact: true }).click();

const closeSettings = (page: Page) =>
  settings(page).getByRole("button", { name: "Close agent settings", exact: true }).click();

const instructions = (page: Page) =>
  page.getByRole("textbox", { name: "Additional instructions (optional)", exact: true });

/** Creates an agent from the Agents app, then opens its settings. */
async function createAgent(user: Client, name: string) {
  await visit(user, undefined, "/agents");
  await user.page.getByLabel("New agent", { exact: true }).first().click();
  await user.page.getByLabel("Agent name", { exact: true }).fill(name);
  await user.page
    .getByRole("textbox", { name: "What should it help with? (optional)", exact: true })
    .fill("Review release tasks. Do not contact external services.");
  await user.page
    .getByRole("dialog")
    .getByRole("button", { name: "Create agent", exact: true })
    .click();
  await expect(user.page.getByRole("dialog")).toHaveCount(0);
  await openSettings(user.page);
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(name);
}

test("selecting an agent opens its existing messages and settings keep the conversation intact", async ({
  account,
  client,
}) => {
  const agent = await createHomedAgent(account);
  const dm = await post<{ id: string }>(account, "messaging/conversations", {
    kind: "agent_dm",
    private: true,
    agentIds: [agent.id],
  });
  const root = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: dm.id,
    body: "Prepare the launch review",
  });
  const turn = await claimTurn(account, agent, {
    id: root.id,
    conversationId: dm.id,
    threadId: null,
  });
  await callTool(account, turn, "reply", {
    body: "The launch summary is ready",
    to: { conversationId: dm.id },
  });
  const user = await client(account);
  await visit(user, undefined, "/agents");
  // The link's name also carries the agent's status, such as "Working on Laptop".
  await user.page.getByRole("link", { name: agent.name }).click();
  await expect(user.page.getByRole("radio", { name: "Messages", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    user.page.getByRole("article").filter({ hasText: "Prepare the launch review" }),
  ).toBeVisible();
  const reply = user.page.getByRole("article").filter({ hasText: "The launch summary is ready" });
  await expect(reply.getByText(agent.name, { exact: true })).toBeVisible();
  const editor = user.page.getByRole("textbox", { name: `Message ${agent.name}`, exact: true });
  await editor.fill("Review the checklist next");
  await openSettings(user.page);
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(agent.name);
  await closeSettings(user.page);
  await expect(settings(user.page)).toHaveCount(0);
  await expect(editor).toHaveText("Review the checklist next");
  await editor.press("Enter");
  await expect(
    user.page.getByRole("article").filter({ hasText: "Review the checklist next" }),
  ).toBeVisible();
  const original = user.page.getByRole("article").filter({ hasText: "Prepare the launch review" });
  await original.hover();
  await original.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = user.page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread).toBeVisible();
  expect(new URL(user.page.url()).pathname).toBe("/agents");
  expect(new URL(user.page.url()).searchParams.get("messageId")).toBe(root.id);
  await user.page.reload();
  await expect(thread).toBeVisible();
  await visit(user, dm.id);
  await expect(user.page.getByText("Agent DM", { exact: true })).toBeVisible();
  await expect(
    user.page.getByRole("button", { name: "Add people and agents", exact: true }),
  ).toHaveCount(0);
  await expect(
    user.page.getByRole("article").filter({ hasText: "Review the checklist next" }),
  ).toBeVisible();
});

test("an agent without a DM waits for Start conversation and then reuses it", async ({
  account,
  client,
}) => {
  const agent = await createHomedAgent(account);
  const user = await client(account);
  await visit(user, undefined, "/agents", { agentId: agent.id });
  const list = async () => {
    const response = await account.request.get("/api/v1/messaging/conversations", {
      params: { organizationId: account.organizationId },
    });
    expect(response.ok()).toBe(true);
    const { data } = z
      .object({
        data: z.array(z.object({ id: z.uuid(), kind: z.string() })),
      })
      .parse(await response.json());
    return data.filter((item) => item.kind === "agent_dm");
  };
  const start = user.page.getByRole("button", { name: "Start conversation", exact: true });
  await expect(start).toBeVisible();
  expect(await list()).toHaveLength(0);
  await openSettings(user.page);
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(agent.name);
  await closeSettings(user.page);
  await expect(start).toBeVisible();
  await user.page.reload();
  await expect(start).toBeVisible();
  expect(await list()).toHaveLength(0);
  await start.click();
  const editor = user.page.getByRole("textbox", { name: `Message ${agent.name}`, exact: true });
  await expect(editor).toBeVisible();
  await expect(user.page.getByRole("article")).toHaveCount(0);
  const created = await list();
  expect(created).toHaveLength(1);
  await user.page.reload();
  await expect(editor).toBeVisible();
  expect(await list()).toEqual(created);
});

test("a disabled agent directs the owner to enable it before starting a conversation", async ({
  account,
  client,
}) => {
  const name = `Disabled helper ${crypto.randomUUID()}`;
  const saved = await account.request.post("/api/v1/agents/actors/save", {
    data: { name, instructions: "", harness: "opencode", enabled: false },
  });
  expect(saved.ok()).toBe(true);
  const { data: agent } = z.object({ data: z.object({ id: z.uuid() }) }).parse(await saved.json());
  const user = await client(account);
  await visit(user, undefined, "/agents", { agentId: agent.id });
  await expect(
    user.page.getByRole("heading", { name: "Agent is disabled", exact: true }),
  ).toBeVisible();
  await expect(
    user.page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toHaveCount(0);
  await user.page.getByRole("button", { name: "Open settings", exact: true }).click();
  const enabled = user.page.getByRole("switch", { name: "Enabled", exact: true });
  await expect(enabled).not.toBeChecked();
  // The switch saves at once; there is no Save step for it.
  await Promise.all([
    user.page.waitForResponse(
      (response) => response.url().endsWith("/actors/save") && response.ok(),
    ),
    enabled.click(),
  ]);
  await expect(enabled).toBeChecked();
  await closeSettings(user.page);
  await user.page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(
    user.page.getByRole("textbox", { name: `Message ${name}`, exact: true }),
  ).toBeVisible();
  await user.page.reload();
  await expect(
    user.page.getByRole("textbox", { name: `Message ${name}`, exact: true }),
  ).toBeVisible();
});

test("agent definitions and run settings can be created, edited, persisted and deleted", async ({
  account,
  client,
}) => {
  test.setTimeout(30_000);
  const user = await client(account);
  const name = `Release helper ${crypto.randomUUID()}`;
  await createAgent(user, name);
  const save = user.page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await user.page.getByLabel("Agent name", { exact: true }).fill("");
  await save.click();
  await expect(user.page.getByText("Enter an agent name.", { exact: true })).toBeVisible();
  await user.page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(name);
  await expect(save).toBeDisabled();
  // Name, model, and instructions are one card on one page, saved together.
  await expect(instructions(user.page)).toHaveValue(
    "Review release tasks. Do not contact external services.",
  );
  await instructions(user.page).fill("Summarize release risks only.");
  const updatedName = `${name} updated`;
  await user.page.getByLabel("Agent name", { exact: true }).fill(updatedName);
  await Promise.all([
    user.page.waitForResponse(
      (response) => response.url().endsWith("/actors/save") && response.ok(),
    ),
    save.click(),
  ]);
  const sidebar = user.page.getByRole("region", { name: "Your agents", exact: true });
  await expect(sidebar.getByRole("link", { name: updatedName, exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name, exact: true })).toHaveCount(0);
  // The open sheet is part of the URL, so it survives a reload.
  await user.page.reload();
  await expect(instructions(user.page)).toHaveValue("Summarize release risks only.");

  // A trigger switch saves at once, with no Save button.
  const directMessage = user.page.getByRole("switch", { name: "Direct message", exact: true });
  const enabled = await directMessage.isChecked();
  await Promise.all([
    user.page.waitForResponse(
      (response) => response.url().endsWith("/actors/triggers") && response.ok(),
    ),
    directMessage.click(),
  ]);
  await user.page.reload();
  await expect(directMessage).toBeChecked({ checked: !enabled });

  // Closing the sheet with a draft asks first.
  await instructions(user.page).fill("Unsaved draft");
  await closeSettings(user.page);
  const discard = user.page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true });
  await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(instructions(user.page)).toHaveValue("Unsaved draft");
  await closeSettings(user.page);
  await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(settings(user.page)).toHaveCount(0);
  await openSettings(user.page);
  await expect(instructions(user.page)).toHaveValue("Summarize release risks only.");

  await user.page.getByRole("button", { name: `Delete ${updatedName}`, exact: true }).click();
  await user.page
    .getByRole("dialog", { name: `Delete ${updatedName}?`, exact: true })
    .getByRole("button", { name: "Delete agent", exact: true })
    .click();
  await expect(sidebar.getByRole("link", { name: updatedName, exact: true })).toHaveCount(0);
  // Without agents, the Agents app explains how to start instead of an empty Needs you list.
  const firstAgent = user.page.getByRole("heading", {
    name: "Create your first agent",
    exact: true,
  });
  await expect(firstAgent).toBeVisible();
  await user.page.reload();
  await expect(sidebar.getByText("No agents yet", { exact: true })).toBeVisible();
  await expect(firstAgent).toBeVisible();
});

test("a member adds and removes their own agent through people and members", async ({
  actors,
  client,
}) => {
  const user = await client(actors.member);
  const agent = await createHomedAgent(user.actor);
  const channel = await conversation(actors.sender, [actors.member.email]);
  await visit(user, channel.id);
  await user.page.getByRole("button", { name: "Add people and agents", exact: true }).click();
  const dialog = user.page.getByRole("dialog");
  const picker = dialog.getByRole("combobox", { name: "People", exact: true });
  await picker.fill(actors.sender.name);
  await expect(dialog.getByRole("option").filter({ hasText: actors.sender.name })).toHaveCount(0);
  await expect(picker).toHaveAttribute("placeholder", "Search your agents");
  await picker.fill(agent.name);
  await dialog.getByRole("option").filter({ hasText: agent.name }).click();
  await dialog.getByRole("button", { name: "Add people", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await user.page.getByRole("button", { name: "Members, 3 members", exact: true }).click();
  const row = user.page.getByRole("listitem").filter({ hasText: agent.name });
  await expect(row.locator("[tabindex='0'] .sr-only")).toHaveText(", Agent");
  await row.getByRole("button", { name: `Remove ${agent.name}`, exact: true }).click();
  await user.page
    .getByRole("dialog", { name: `Remove ${agent.name}?`, exact: true })
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  await expect(
    user.page.getByRole("button", { name: "Members, 2 members", exact: true }),
  ).toBeVisible();
});
