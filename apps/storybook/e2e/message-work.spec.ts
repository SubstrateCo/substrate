import { expect, test } from "@playwright/test";

test("task content does not highlight; only action controls do", async ({ page }) => {
  await page.goto("/iframe.html?id=messaging-components-linked-work--created-task&viewMode=story");
  const title = page.getByText("Review the onboarding flow", { exact: true });
  const content = title.locator("../..");
  const background = () => content.evaluate((node) => getComputedStyle(node).backgroundColor);
  const initialBackground = await background();
  await title.hover();
  await expect.poll(background).toBe(initialBackground);
  const open = page.getByRole("link", { name: "Open Review the onboarding flow", exact: true });
  const initialActionBackground = await open.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  await open.hover();
  await expect
    .poll(() => open.evaluate((node) => getComputedStyle(node).backgroundColor))
    .not.toBe(initialActionBackground);
  await expect.poll(background).toBe(initialBackground);
});

for (const story of ["task-in-channel", "task-in-thread"]) {
  test(`${story} shows navigable task context and keeps unlink separate`, async ({ page }) => {
    await page.goto(`/iframe.html?id=messaging-scenes-workspace--${story}&viewMode=story`);
    const context = page.getByRole("region", { name: "Linked work" }).last();
    await expect(context.getByRole("link", { name: /Review the onboarding flow/ })).toBeVisible();
    await expect(context.getByText("In progress", { exact: true })).toBeVisible();
    await expect(context.getByText("Created here", { exact: true })).toBeVisible();
    await context
      .getByRole("button", { name: "Unlink Review the onboarding flow", exact: true })
      .click();
    await expect(context.getByRole("link", { name: /Review the onboarding flow/ })).toHaveCount(0);
    await expect(
      page.getByRole("textbox", {
        name: story === "task-in-thread" ? "Reply in thread…" : "Message #general",
        exact: true,
      }),
    ).toBeVisible();
  });
}
