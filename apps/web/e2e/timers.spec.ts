import { conversation, post, test, visit } from "./test-support/fixtures";
import { pauseClock, searches, visibleWithClock } from "./test-support/search";
import { project } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("search waits for the last input and hides results immediately when the kind changes", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const sender = await client(actors.sender);
  await visit(sender);
  await pauseClock(sender.page);
  const requests = searches(sender.page);
  const input = sender.page.getByRole("combobox", { name: "Search workspace", exact: true });
  await input.fill("discard intermediate query");
  await sender.page.clock.runFor(150);
  await input.fill(created.name);
  await sender.page.clock.runFor(199);
  expect(requests.filter((request) => request.query)).toEqual([]);
  const panel = sender.page.getByRole("region", { name: "Workspace search", exact: true });
  const result = panel.getByRole("link", { name: new RegExp(created.name) });
  await visibleWithClock(sender.page, result);
  expect(requests.filter((request) => request.query).map((request) => request.query)).toEqual([
    created.name,
  ]);

  const settledRequests = requests.length;
  await panel.getByRole("tab", { name: "Messages", exact: true }).click();
  await expect(result).toHaveCount(0);
  await sender.page.clock.runFor(100);
  await panel.getByRole("tab", { name: "Projects", exact: true }).click();
  await expect(result).toHaveCount(0);
  await sender.page.clock.runFor(199);
  await expect(result).toHaveCount(0);
  expect(requests).toHaveLength(settledRequests);
  await visibleWithClock(sender.page, result);
});

test("scrolling one message pane extends only its own scrollbar visibility", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: `Timer root ${channel.id}`,
  });
  const sender = await client(actors.sender);
  await visit(sender, channel.id);
  await sender.page.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const messages = sender.page.getByRole("log", { name: "Messages", exact: true }).first();
  const replies = sender.page
    .getByRole("complementary", { name: "Thread", exact: true })
    .getByRole("log", { name: "Messages", exact: true });
  await expect(replies).toBeVisible();
  await pauseClock(sender.page);
  await messages.dispatchEvent("scroll");
  await sender.page.clock.runFor(300);
  await replies.dispatchEvent("scroll");
  await sender.page.clock.runFor(300);
  await messages.dispatchEvent("scroll");
  await sender.page.clock.runFor(401);
  await expect(replies).not.toHaveAttribute("data-scrolling");
  await expect(messages).toHaveAttribute("data-scrolling", "");
  await sender.page.clock.runFor(300);
  await expect(messages).not.toHaveAttribute("data-scrolling");
});

test("switching conversations cancels reference search and does not reuse the previous audience", async ({
  actors,
  client,
}) => {
  const [first, second] = await Promise.all([
    conversation(actors.sender, [actors.member.email]),
    conversation(actors.sender),
  ]);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, first.id);
  await pauseClock(page);
  const requests = searches(page);
  const editor = page.getByRole("textbox", { name: /^Message / });
  const input = page.getByRole("combobox", { name: "Search references" });
  const member = page.getByRole("option", { name: actors.member.name, exact: true });
  await editor.fill("@");
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await input.fill(actors.member.name);
  await visibleWithClock(page, member);
  await input.fill("discard on conversation switch");
  await page.getByRole("button", { name: second.name, exact: true }).click();
  await expect(editor).toBeEmpty();
  await expect(member).toHaveCount(0);
  await page.clock.runFor(300);
  expect(requests.some((request) => request.query === "discard on conversation switch")).toBe(
    false,
  );

  await editor.fill("@");
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await input.fill(actors.member.name);
  const response = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/v1/context/search") return false;
    const body = response.request().postDataJSON();
    return body.conversationId === second.id && body.query === actors.member.name;
  });
  await expect(member).toHaveCount(0);
  await page.clock.runFor(199);
  await expect(member).toHaveCount(0);
  await page.clock.runFor(1);
  expect((await response).ok()).toBe(true);
  await visibleWithClock(page, page.getByText("No accessible references found.", { exact: true }));
  await expect(member).toHaveCount(0);
});
