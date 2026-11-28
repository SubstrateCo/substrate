import { conversation, conversationButton, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("the reference picker filters with Tab, searches full names, and steps aside for prose", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  await editor.pressSequentially("Ping @");
  await expect(tab("All")).toHaveAttribute("aria-selected", "true");
  await editor.press("Tab");
  await expect(tab("People")).toHaveAttribute("aria-selected", "true");
  await editor.press("Shift+Tab");
  await expect(tab("All")).toHaveAttribute("aria-selected", "true");
  await expect(editor).toBeFocused();
  await editor.pressSequentially(actors.member.name);
  const member = page.getByRole("option", { name: actors.member.name, exact: true });
  await expect(member).toHaveAttribute("aria-selected", "true");
  await editor.press("Enter");
  await expect(member).toHaveCount(0);
  await editor.pressSequentially("about @no such person");
  await expect(page.getByRole("listbox", { name: "References" })).toHaveCount(0);
  await editor.press("Enter");
  const sent = page.getByRole("article").filter({ hasText: "about @no such person" });
  await expect(sent).toContainText(actors.member.name);
});

test("switching conversations does not reuse the previous reference audience", async ({
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
  const editor = page.getByRole("textbox", { name: /^Message / });
  const memberQuery = actors.member.name.split(" ")[1];
  const member = page.getByRole("option", { name: actors.member.name, exact: true });
  await editor.fill("@");
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await editor.fill(`@${memberQuery}`);
  await expect(member).toBeVisible();
  await conversationButton(page, second.name).click();
  await expect(editor).toBeEmpty();
  await expect(member).toHaveCount(0);
  await editor.fill("@");
  await page.getByRole("tab", { name: "People", exact: true }).click();
  const searched = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/v1/context/search") return false;
    const input = response.request().postDataJSON();
    return input.conversationId === second.id && input.query === memberQuery;
  });
  await editor.fill(`@${memberQuery}`);
  expect((await searched).ok()).toBe(true);
  await expect(page.getByText("No accessible references found.", { exact: true })).toBeVisible();
  await expect(member).toHaveCount(0);
});
