import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

for (const [name, marker] of [
  ["Bold text", "**"],
  ["Italic text", "_"],
  ["Code text", "`"],
]) {
  test(`${name} places the shipping textarea caret inside markers and preserves selected text`, async ({
    page,
  }) => {
    await openStory(page, "messaging-production-compositions--composer-destinations");
    const input = page.getByRole("textbox");
    const format = page.getByRole("button", { name, exact: true });
    await format.click();
    await expect(input).toBeFocused();
    await input.pressSequentially("hello");
    await expect(input).toHaveValue(`${marker}hello${marker}`);
    await input.fill("hello world");
    await input.press("Home");
    await input.press("Control+Shift+ArrowRight");
    await format.focus();
    await format.press("Enter");
    await expect(input).toHaveValue(`${marker}hello ${marker}world`);
    await expect(input).toBeFocused();
    await input.pressSequentially("Hi ");
    await expect(input).toHaveValue(`${marker}Hi ${marker}world`);
  });
}

test("shipping textarea opens a keyboard-operable reference picker without sending raw @", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--references-in-channel");
  const input = page.getByRole("textbox", { name: "Message #general", exact: true });
  const before = await page.getByRole("article").count();
  await input.fill("Ask @");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue(/Ask @\[task:[^\]]+\] /);
  await expect(input).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(before);
  await input.fill("Ask @");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Insert workspace reference" })).toHaveCount(0);
  await expect(input).toHaveValue("Ask @");
  await expect(input).toBeFocused();
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("Ask @\n");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(before + 1);
});

test("shipping textarea composition does not open references or send until composition ends", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--references-in-channel");
  const input = page.getByRole("textbox", { name: "Message #general", exact: true });
  const before = await page.getByRole("article").count();
  await input.dispatchEvent("compositionstart");
  await input.fill("@");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await expect(input).toHaveValue("@");
  await expect(page.getByRole("article")).toHaveCount(before);
  await expect(page.getByRole("combobox", { name: "Search references" })).toHaveCount(0);
  await input.dispatchEvent("compositionend");
  await expect(page.getByRole("combobox", { name: "Search references" })).toBeFocused();
});

test("shipping inline references keep message context and controls usable at 800x420", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await openStory(page, "messaging-scenes-workspace--references-in-channel");
  const input = page.getByRole("textbox", { name: "Message #general", exact: true });
  await input.fill("@");
  const picker = page.getByRole("region", { name: "Insert workspace reference" });
  await expect(picker).toBeVisible();
  expect((await picker.boundingBox())!.height).toBeLessThanOrEqual(150);
  expect((await page.getByRole("log").boundingBox())!.height).toBeGreaterThanOrEqual(90);
  for (const name of ["Tasks", "Projects", "People", "Close references"]) {
    await expect(picker.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
  }
  await picker.getByRole("button", { name: "Projects", exact: true }).click();
  await picker.getByRole("option").first().click();
  await expect(input).toHaveValue(/@\[project:/);
  await input.fill("@");
  await page.getByRole("button", { name: "Close references", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(input).toHaveValue("@");
});

for (const kind of ["messages", "replies"]) {
  test(`background ${kind} refresh has one generic status and no false navigation progress`, async ({
    page,
  }) => {
    await openStory(page, `messaging-production-compositions--refreshing-${kind}-history`);
    await expect(page.getByRole("status")).toHaveText(`Refreshing ${kind}…`);
    await expect(page.getByRole("button", { name: /^Loading/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Older ${kind}`, exact: true })).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: kind === "replies" ? "Latest replies" : "Back to latest",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.getByText("Current launch discussion", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Complete history request", exact: true }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Older ${kind}`, exact: true })).toBeEnabled();
  });
}
