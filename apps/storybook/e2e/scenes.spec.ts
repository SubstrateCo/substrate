import { expect, test, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator("#storybook-root > *")).toBeVisible();
}

test("every story renders without app services or runtime errors", async ({ page, request }) => {
  const response = await request.get("/index.json");
  const index: { entries: Record<string, { id: string; type: string }> } = await response.json();
  const stories = Object.values(index.entries).filter((entry) => entry.type === "story");
  const errors: string[] = [];
  const serviceRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith("/api/") ||
      request.method() === "POST" ||
      url.origin !== "http://127.0.0.1:6007"
    )
      serviceRequests.push(request.url());
  });
  expect(stories.length).toBeGreaterThan(0);
  for (const story of stories) {
    await test.step(story.id, async () => {
      await openStory(page, story.id);
      await expect(page.locator(".sb-errordisplay")).not.toBeVisible();
      expect(errors, story.id).toEqual([]);
    });
  }
  expect(serviceRequests).toEqual([]);
});

test("isolated button and picker previews are centered, while scenes keep their app layout", async ({
  page,
}) => {
  for (const [id, name] of [
    ["components-button--default", "Button"],
    ["components-messaging--emoji", "Add emoji"],
  ]) {
    await openStory(page, id);
    const control = page.getByRole("button", { name, exact: true });
    await expect(control).toBeVisible();
    await expect
      .poll(async () => {
        const box = await control.boundingBox();
        if (!box) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(box.x + box.width / 2 - 720),
          Math.abs(box.y + box.height / 2 - 450),
        );
      })
      .toBeLessThan(2);
  }
  await openStory(page, "scenes-messaging--public-channel");
  const rail = await page.getByRole("navigation", { name: "Apps" }).boundingBox();
  expect(rail?.x).toBe(0);
  expect(rail?.height).toBe(900);
});

test("message drafts, emoji, reactions, and threads work without a backend", async ({ page }) => {
  await openStory(page, "scenes-messaging--public-channel");
  const input = page.getByRole("textbox", { name: "Message #general", exact: true });
  await input.fill("A preview message ");
  await page.getByRole("button", { name: "Add emoji", exact: true }).click();
  await page.getByRole("button", { name: "🚀", exact: true }).click();
  await expect(input).toHaveValue("A preview message 🚀");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  const message = page.getByRole("article").filter({ hasText: "A preview message 🚀" });
  await expect(message).toBeVisible();
  await message.getByRole("button", { name: "React to message" }).click();
  await page.getByRole("button", { name: "👍", exact: true }).click();
  await expect(message.getByRole("button", { name: "👍, 1 reactions" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await message.getByRole("button", { name: "👍, 1 reactions" }).click();
  await expect(message.getByRole("button", { name: "👍, 1 reactions" })).toHaveCount(0);
  await message.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread).toContainText("A preview message 🚀");
  await page
    .getByRole("textbox", { name: "Reply in thread…", exact: true })
    .fill("A preview reply");
  await page.getByRole("textbox", { name: "Reply in thread…", exact: true }).press("Enter");
  await expect(thread.getByRole("log")).toContainText("A preview reply");
  await expect(
    page.getByRole("region", { name: "general", exact: true }).getByRole("log"),
  ).not.toContainText("A preview reply");
  await page.getByRole("button", { name: "Close thread" }).click();
  await expect(thread).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`mobile scene navigation and composer remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
    await openStory(page, "scenes-messaging--public-channel");
    const sidebar = page.getByRole("complementary", { name: "Conversations" });
    const input = page.getByRole("textbox", { name: "Message #general" });
    await expect(sidebar).toBeHidden();
    for (const name of ["Bold text", "Italic text", "Code text", "Send"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    await page.getByRole("button", { name: "Show conversations" }).click();
    await expect(sidebar).toBeVisible();
    await expect(input).toBeHidden();
    await sidebar.getByRole("button", { name: "Alex Morgan", exact: true }).click();
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message Alex Morgan" })).toBeVisible();
  });
}

test("permission and access-loss scenes hide restricted controls and content", async ({ page }) => {
  await openStory(page, "scenes-messaging--member-workspace");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await openStory(page, "scenes-settings--admin");
  await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toHaveCount(0);
  for (const scene of ["stale-workspace-tab", "revoked-membership"]) {
    await openStory(page, `scenes-messaging--${scene}`);
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("log")).toHaveCount(0);
    await expect(page.getByText("The launch plan is ready.", { exact: false })).toHaveCount(0);
  }
  await openStory(page, "scenes-workspaces--expired-invitation");
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("This invitation is no longer available.");
});

test("owner invitation previews can send, resend, and cancel", async ({ page }) => {
  await openStory(page, "scenes-settings--owner");
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  const invitation = page.getByRole("listitem").filter({ hasText: "new@example.com" });
  await expect(invitation).toContainText("pending");
  await invitation.getByRole("button", { name: "Resend", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Invitation email sent.");
  await invitation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(invitation).toContainText("canceled");
  await expect(invitation.getByRole("button", { name: "Resend", exact: true })).toHaveCount(0);
});

test("dark previews apply their theme to picker portals too", async ({ page }) => {
  await page.goto("/iframe.html?id=components-messaging--emoji&viewMode=story&globals=theme:dark");
  await page.getByRole("button", { name: "Add emoji" }).click();
  const picker = page.locator('[data-slot="popover-content"]');
  await expect(picker).toBeVisible();
  const previewPopoverColor = await page
    .locator(".bg-background")
    .first()
    .evaluate((node) => getComputedStyle(node).getPropertyValue("--popover").trim());
  await expect
    .poll(() =>
      picker.evaluate((node) => getComputedStyle(node).getPropertyValue("--popover").trim()),
    )
    .toBe(previewPopoverColor);
});
