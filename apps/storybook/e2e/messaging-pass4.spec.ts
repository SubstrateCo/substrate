import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

for (const empty of [true, false]) {
  for (const kind of ["channel", "dm", "group"]) {
    for (const exit of ["button", "keyboard", "escape"]) {
      test(`${empty ? "empty" : "populated"} ${kind} creation cancels by ${exit} and restores context and focus`, async ({
        page,
      }) => {
        await openStory(
          page,
          `messaging-scenes-workspace--${empty ? "empty-workspace" : "public-channel"}`,
        );
        const input = page.getByRole("textbox", { name: "Message #general", exact: true });
        if (!empty) await input.fill("Keep this conversation draft");
        const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
        let trigger = sidebar.getByRole("button", { name: "New message", exact: true });
        if (kind === "channel") {
          trigger = sidebar.getByRole("button", { name: "Create channel", exact: true });
          if (empty)
            trigger = page.getByRole("button", { name: "Create channel", exact: true }).last();
        }
        await trigger.click();
        if (kind !== "channel")
          await page
            .getByRole("menuitem", {
              name: kind === "dm" ? "New direct message" : "New group message",
              exact: true,
            })
            .click();
        await expect(page.getByRole("textbox").first()).toBeFocused();
        if (!empty) {
          await expect(input).toHaveCount(0);
          await expect(page.getByRole("log")).toHaveCount(0);
        }
        if (kind !== "dm")
          await page
            .getByLabel(kind === "channel" ? "Channel name" : "Group name (optional)", {
              exact: true,
            })
            .fill("Do not create this");
        await page
          .getByLabel(kind === "channel" ? "Add people (optional)" : "To", { exact: true })
          .fill("alex@example.test, sam@example.test");
        const cancel = page.getByRole("button", { name: "Cancel", exact: true });
        if (exit === "escape") await page.keyboard.press("Escape");
        else if (exit === "keyboard") {
          await cancel.focus();
          await cancel.press("Enter");
        } else await cancel.click();
        await expect(cancel).toHaveCount(0);
        await expect(trigger).toBeFocused();
        if (empty)
          await expect(
            page.getByRole("heading", { name: "Your conversations start here", exact: true }),
          ).toBeVisible();
        else {
          await expect(input).toHaveValue("Keep this conversation draft");
          await expect(page.getByRole("heading", { name: "general", exact: true })).toBeVisible();
        }
        await expect(
          sidebar.getByRole("button", { name: "Do not create this", exact: true }),
        ).toHaveCount(0);
      });
    }
  }
}

test("empty direct-message action restores its remounted trigger", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--empty-workspace");
  const trigger = page.getByRole("button", { name: "New direct message", exact: true });
  await trigger.click();
  await expect(page.getByRole("textbox", { name: "To", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Your conversations start here", exact: true }),
  ).toBeVisible();
});

test("mobile menu cancellation restores the sidebar trigger and previous draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const input = page.getByRole("textbox", { name: "Message #general", exact: true });
  await input.fill("Keep my mobile draft");
  await page.getByRole("button", { name: "Show conversations", exact: true }).click();
  const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
  const trigger = sidebar.getByRole("button", { name: "New message", exact: true });
  await trigger.click();
  await page.getByRole("menuitem", { name: "New group message", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Group name (optional)", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("button", { name: "general", exact: true }).click();
  await expect(input).toHaveValue("Keep my mobile draft");
});

test("a nested select owns its first Escape without cancelling creation", async ({ page }) => {
  await openStory(page, "messaging-components-create-conversation--nested-control-escape");
  const select = page.getByRole("combobox", { name: "Review label", exact: true });
  await select.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Create a channel", exact: true })).toBeVisible();
  await expect(select).toBeFocused();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toHaveText("Creation cancelled without submitting");
});

test("pending creation cannot duplicate or discard the request and keeps fields for retry", async ({
  page,
}) => {
  await openStory(page, "messaging-components-create-conversation--pending-creation-retry");
  const name = page.getByRole("textbox", { name: "Channel name", exact: true });
  const people = page.getByRole("textbox", { name: "Add people (optional)", exact: true });
  const privacy = page.getByRole("checkbox", { name: "Make this channel private", exact: true });
  await name.fill("Launch review");
  await people.fill("alex@example.test, sam@example.test");
  await privacy.check();
  const create = page.getByRole("button", { name: "Create channel", exact: true });
  const bounds = await create.boundingBox();
  await create.click();
  const pending = page.getByRole("button", { name: "Creating…", exact: true });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute("aria-busy", "true");
  expect(await pending.boundingBox()).toEqual(bounds);
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  for (const field of [name, people, privacy]) await expect(field).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Creation attempts: 1");
  await expect(page.getByRole("heading", { name: "Create a channel", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fail creation", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn’t create this conversation");
  await expect(name).toHaveValue("Launch review");
  await expect(people).toHaveValue("alex@example.test, sam@example.test");
  await expect(privacy).toBeChecked();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
  await create.click();
  await expect(pending).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Creation attempts: 2");
});

for (const theme of ["light", "dark"]) {
  for (const width of [1440, 320]) {
    test(`ordinary prose has a readable measure without constraining code or tables at ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/iframe.html?id=messaging-scenes-workspace--reading-measure&viewMode=story&globals=theme:${theme}`,
      );
      const article = page.getByRole("article").first();
      await expect(article).toBeVisible();
      const paragraph = article
        .getByRole("paragraph")
        .filter({ hasText: /^Launch planning/ })
        .first();
      for (const block of [
        paragraph,
        article.locator("ul").first(),
        article.locator("blockquote").first(),
      ]) {
        const measure = await block.evaluate((node) => {
          const probe = document.createElement("span");
          probe.style.cssText = "display:block;width:1ch;height:0";
          node.append(probe);
          const ch = probe.getBoundingClientRect().width;
          probe.remove();
          return { width: node.getBoundingClientRect().width, ch };
        });
        expect(measure.width / measure.ch).toBeLessThanOrEqual(81);
        if (width === 1440) expect(measure.width / measure.ch).toBeGreaterThanOrEqual(70);
      }
      for (const wide of [article.locator("pre"), article.getByRole("table")]) {
        const dimensions = await wide.evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          content: node.scrollWidth,
          viewport: node.clientWidth,
        }));
        expect(dimensions.content).toBeGreaterThan(dimensions.viewport);
        if (width === 1440)
          expect(dimensions.width).toBeGreaterThan((await paragraph.boundingBox())!.width * 1.25);
        await wide.evaluate((node) => {
          node.scrollLeft = 100;
        });
        expect(await wide.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}
