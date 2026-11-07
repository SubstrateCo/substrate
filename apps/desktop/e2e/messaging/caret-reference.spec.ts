import { test } from "../test-support/fixture.js";
import { createChannel } from "./test-support.js";
import { expect } from "@playwright/test";

test("reference typing preserves the caret in a restored composer draft", async ({ desktop }) => {
  await desktop.provision();
  const page = desktop.page;
  await createChannel(page, "caret-reference");
  const composer = page.getByRole("textbox", { name: "Message #caret-reference", exact: true });
  const picker = page.getByRole("region", { name: "Insert workspace reference", exact: true });
  await composer.fill("@user:Desktop");
  await picker.getByRole("option", { name: "Desktop Owner", exact: true }).click();
  await createChannel(page, "other-draft");
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name: "caret-reference", exact: true })
    .click();
  await expect(composer.locator("[data-reference-chip]")).toHaveText("Desktop Owner");
  for (let attempt = 0; attempt < 15; attempt++) {
    await composer.fill("before  after");
    await composer.press("Control+Home");
    for (let index = 0; index < "before ".length; index++) await composer.press("ArrowRight");
    await composer.pressSequentially("@user:Desktop");
    await expect(composer).toHaveText("before @user:Desktop after");
    await picker.getByRole("option", { name: "Desktop Owner", exact: true }).click();
    await expect(composer).toHaveText("before Desktop Owner  after");
  }
  await composer.fill("first\nlast");
  await composer.press("Control+Home");
  await composer.press("Control+Shift+End");
  await composer.pressSequentially("replacement");
  await expect(composer).toHaveText("replacement");
  await composer.press("Control+Home");
  await composer.press("Control+End");
  await composer.pressSequentially(" end");
  await expect(composer).toHaveText("replacement end");
  await composer.press("Control+Shift+Home");
  await composer.pressSequentially("start");
  await expect(composer).toHaveText("start");
});
