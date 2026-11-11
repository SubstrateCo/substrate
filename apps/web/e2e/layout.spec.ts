import { conversation, post, send, test, visit } from "./test-support/fixtures";
import { expect, type Page } from "@playwright/test";

async function dragBy(page: Page, separator: string, distance: number) {
  const handle = page.getByRole("separator", { name: separator, exact: true });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`${separator} is not visible.`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + distance, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
}

const width = async (page: Page, sidebar: string) =>
  Math.round(
    (await page.getByRole("complementary", { name: sidebar, exact: true }).boundingBox())?.width ??
      0,
  );

// Every app uses the same PageSidebar, so one sidebar covers resizing and its saved width.
test("a resized sidebar keeps its width after reload", async ({ actors, client }) => {
  const sender = await client(actors.sender);
  await visit(sender);
  await expect.poll(() => width(sender.page, "Conversations")).toBe(240);
  await dragBy(sender.page, "Resize conversations sidebar", 60);
  await expect.poll(() => width(sender.page, "Conversations")).toBe(300);
  await visit(sender);
  await expect.poll(() => width(sender.page, "Conversations")).toBe(300);
});

test("every settings section uses the same content column and heading", async ({
  actors,
  client,
}) => {
  const sender = await client(actors.sender);
  const columns: { x: number; width: number }[] = [];
  const headings: { y: number; fontSize: string }[] = [];
  const sections = sender.page.getByRole("navigation", { name: "Settings sections", exact: true });
  await visit(sender, undefined, "/settings/user");
  for (const [path, title] of [
    ["/settings/user", "Profile"],
    ["/settings/user/preferences", "Preferences"],
    ["/settings/user/invitations", "Your invitations"],
    ["/settings/organization", "General"],
    ["/settings/organization/members", "Members"],
    ["/settings/organization/invitations", "Invitations"],
    ["/settings/organization/conversations", "Conversations"],
    ["/settings/organization/sharing", "External collaboration"],
  ]) {
    await sections.getByRole("link", { name: title, exact: true }).click();
    await expect.poll(() => new URL(sender.page.url()).pathname).toBe(path);
    await expect(
      sender.page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible();
    headings.push(
      await sender.page
        .getByRole("heading", { level: 1, name: title, exact: true })
        .evaluate((heading) => ({
          y: Math.round(heading.getBoundingClientRect().y),
          fontSize: getComputedStyle(heading).fontSize,
        })),
    );
    columns.push(
      await sender.page
        .locator("[data-slot='page-header']")
        .first()
        .evaluate((header) => {
          const { x, width } = header.getBoundingClientRect();
          return { x: Math.round(x), width: Math.round(width) };
        }),
    );
  }
  expect(new Set(columns.map(({ x }) => x)).size).toBe(1);
  expect(new Set(columns.map(({ width }) => width)).size).toBe(1);
  expect(new Set(headings.map(({ y }) => y)).size).toBe(1);
  expect(new Set(headings.map(({ fontSize }) => fontSize)).size).toBe(1);
});

test("discard clears name validation in profile and organization settings", async ({
  actors,
  client,
}) => {
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/settings/user");
  for (const [section, label] of [
    ["Profile", "Full name"],
    ["General", "Organization name"],
  ]) {
    await sender.page
      .getByRole("navigation", { name: "Settings sections", exact: true })
      .getByRole("link", { name: section, exact: true })
      .click();
    await expect(
      sender.page.getByRole("heading", { level: 1, name: section, exact: true }),
    ).toBeVisible();
    const field = sender.page.getByLabel(label, { exact: true });
    const original = await field.inputValue();
    for (const invalid of ["", "   "]) {
      await field.fill(invalid);
      await sender.page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await sender.page.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(field).toHaveValue(original);
      await expect(field).not.toHaveAttribute("aria-invalid", "true");
    }
  }
});

test("messages and thread controls remain usable at 640px", async ({ actors, client }) => {
  const channel = await conversation(actors.sender);
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: `Layout root ${channel.id}`,
  });
  const sender = await client(actors.sender);
  await sender.page.setViewportSize({ width: 640, height: 900 });
  await visit(sender, channel.id);
  const editor = sender.page.getByRole("textbox", { name: /^Message / });
  await expect(editor).toBeInViewport();
  await sender.page.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const reply = `Layout reply ${channel.id}`;
  await expect(
    sender.page.getByRole("textbox", { name: "Reply in thread…", exact: true }),
  ).toBeInViewport();
  await send(sender.page, reply, "Reply in thread…");
  await expect(
    sender.page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByText(reply, { exact: true }),
  ).toBeVisible();
  await sender.page.getByRole("button", { name: "Close thread", exact: true }).click();
  await expect(editor).toBeInViewport();
  await sender.page.getByRole("button", { name: "Show conversations", exact: true }).click();
  await sender.page.getByRole("button", { name: channel.name, exact: true }).click();
  await expect(editor).toBeInViewport();
  expect(
    await sender.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
