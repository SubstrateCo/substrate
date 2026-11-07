import { test } from "../test-support/fixture.js";
import { createChannel } from "./test-support.js";
import { expect } from "@playwright/test";

test("typed reference prefixes insert persistent chips in the actual composer", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  const seeded = await page.evaluate(async () => {
    const session = await (await fetch("/api/v1/session")).json();
    const organizationId = session.data.session.activeOrganizationId;
    const mutate = async (
      data: { organizationId: string } & (
        | { action: "createProject"; name: string }
        | { action: "createTask"; projectEntityId: string; title: string }
      ),
    ) =>
      (
        await fetch("/api/v1/tasks/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      ).json();
    const project = await mutate({
      organizationId,
      action: "createProject",
      name: "Prefix project",
    });
    const task = await mutate({
      action: "createTask",
      organizationId,
      projectEntityId: project.data.id,
      title: "Prefix task",
    });
    return project.success && task.success;
  });
  expect(seeded).toBe(true);
  await createChannel(page, "reference-chips");
  const composer = page.getByRole("textbox", { name: "Message #reference-chips", exact: true });
  const picker = page.getByRole("region", { name: "Insert workspace reference", exact: true });
  await composer.fill("@user:Desktop");
  await expect(picker.getByRole("tab", { name: "People", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(picker.getByRole("combobox")).toHaveValue("Desktop");
  for (const tab of await picker.getByRole("tab").all()) {
    const panelId = await tab.getAttribute("aria-controls");
    const panel = picker.locator(`[id="${panelId}"]`);
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
  }
  await expect(
    picker
      .getByRole("tabpanel", { name: "People", exact: true })
      .getByRole("option", { name: "Desktop Owner", exact: true }),
  ).toBeVisible();
  await picker.getByRole("option", { name: "Desktop Owner", exact: true }).click();
  const chip = composer.locator("[data-reference-chip]");
  await expect(chip).toHaveText("Desktop Owner");
  await chip.click();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("Desktop Owner");
  await composer.pressSequentially(" hello");
  await page.getByRole("button", { name: "Bold text", exact: true }).click();
  await expect(chip).toBeVisible();
  await expect(composer).toContainText("hello****");
  await createChannel(page, "reference-chip-draft");
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name: "reference-chips", exact: true })
    .click();
  await expect(chip).toHaveText("Desktop Owner");
  await expect(composer).toContainText("hello****");
  await expect(
    page.getByText("References don’t grant access; mentions notify members.", { exact: true }),
  ).toHaveCount(0);
  await composer.fill("before  after");
  await composer.press("Control+Home");
  for (let index = 0; index < "before ".length; index++) await composer.press("ArrowRight");
  await composer.pressSequentially("@user:Desktop");
  await picker.getByRole("option", { name: "Desktop Owner", exact: true }).click();
  await expect(composer).toHaveText("before Desktop Owner  after");
  await composer.pressSequentially("here");
  await expect(composer).toHaveText("before Desktop Owner here after");
  await composer.fill("@task:");
  await expect(picker.getByRole("tab", { name: "Tasks", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(picker.getByRole("combobox")).toHaveValue("");
  await picker.getByRole("option", { name: "Prefix task", exact: true }).click();
  await expect(chip).toHaveText("Prefix task");
  for (const prefix of ["@project:", "@projects:", "@projects:Prefix"]) {
    await composer.fill(prefix);
    await expect(picker.getByRole("tab", { name: "Projects", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(picker.getByRole("combobox")).toHaveValue(prefix.split(":")[1]!);
    await picker.getByRole("option", { name: "Prefix project", exact: true }).click();
    await expect(chip).toHaveText("Prefix project");
  }
  await chip.click();
  await expect(chip).toBeVisible();
  await composer.press("End");
  await composer.press("Enter");
  await expect(
    page
      .getByRole("article")
      .locator(".message-markdown")
      .getByText("Prefix project", { exact: true }),
  ).toBeVisible();
});

test("mention typing keeps composer focus and the selected reference type", async ({ desktop }) => {
  await desktop.provision();
  const page = desktop.page;
  await createChannel(page, "reference-typing");
  const composer = page.getByRole("textbox", { name: "Message #reference-typing", exact: true });
  const picker = page.getByRole("region", { name: "Insert workspace reference", exact: true });
  const search = picker.getByRole("combobox", { name: "Search references", exact: true });

  await expect(composer).toBeEnabled();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(composer.locator("xpath=..")).toHaveCSS("opacity", "1");
  const composerBox = (await composer.boundingBox())!;
  await composer.fill("@");
  await expect(picker).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Workspace references", exact: true }),
  ).toBeVisible();
  expect((await composer.boundingBox())!.height).toBeCloseTo(composerBox.height, 0);
  await expect(composer).toBeFocused();
  await picker.getByRole("tab", { name: "People", exact: true }).click();
  await composer.focus();
  await composer.pressSequentially("Desktop");
  await expect(composer).toHaveText("@Desktop");
  await expect(composer).toBeFocused();
  await expect(picker.getByRole("tab", { name: "People", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(search).toHaveValue("Desktop");
  await composer.press("ArrowDown");
  await expect(search).toBeFocused();
  await search.fill("Desktop Owner");
  const owner = picker.getByRole("option", { name: "Desktop Owner", exact: true });
  await expect(owner).toBeVisible();
  await expect(search).toHaveAttribute("aria-activedescendant", (await owner.getAttribute("id"))!);
  await search.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(composer).toBeFocused();
  await expect(composer).toHaveText("@Desktop");

  await composer.fill("@");
  const workspaceSearch = page.getByRole("combobox", { name: "Search workspace", exact: true });
  await workspaceSearch.click();
  await expect(picker).toHaveCount(0);
  await expect(workspaceSearch).toBeFocused();
  await workspaceSearch.press("Escape");
  await composer.fill("@D");
  await picker.getByRole("tab", { name: "People", exact: true }).click();
  await composer.press("ArrowDown");
  await search.fill("Desktop Owner");
  await expect(owner).toBeVisible();
  await search.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(composer).toBeFocused();
  await expect(composer.locator("[data-reference-chip]")).toHaveText("Desktop Owner");
  await composer.press("Enter");
  await expect(
    page
      .getByRole("article")
      .locator(".message-markdown")
      .getByText("Desktop Owner", { exact: true }),
  ).toBeVisible();
});

test("reference results scroll the active option into view after an async search", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  const created = await page.evaluate(async () => {
    const session = await (await fetch("/api/v1/session")).json();
    const results = [];
    for (let index = 0; index < 12; index++) {
      results.push(
        await (
          await fetch("/api/v1/tasks/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "createProject",
              organizationId: session.data.session.activeOrganizationId,
              name: `Reference project ${String(index).padStart(2, "0")}`,
            }),
          })
        ).json(),
      );
    }
    return results.map((result) => result.success);
  });
  expect(created).toEqual(Array(12).fill(true));
  await createChannel(page, "reference-scrolling");
  const composer = page.getByRole("textbox", { name: "Message #reference-scrolling", exact: true });
  await composer.fill("@");
  const picker = page.getByRole("region", { name: "Insert workspace reference", exact: true });
  await picker.getByRole("tab", { name: "Projects", exact: true }).click();
  const search = picker.getByRole("combobox", { name: "Search references", exact: true });
  const options = picker.getByRole("option");
  await search.fill("Reference project");
  await expect(options).toHaveCount(12);
  for (let index = 0; index < 11; index++) await search.press("ArrowDown");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await expect(options.last()).toBeInViewport({ ratio: 1 });
  for (let index = 0; index < 11; index++) await search.press("ArrowUp");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");

  await page.evaluate(() => {
    const original = window.fetch;
    const pending = new Promise<void>((resolve) => {
      window.addEventListener("release-reference-search", () => resolve(), { once: true });
    });
    window.fetch = Object.assign(async (...args: Parameters<typeof window.fetch>) => {
      const input = args[0];
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url, location.href).pathname === "/api/v1/context/search") {
        window.fetch = original;
        await pending;
      }
      return original(...args);
    }, original);
  });
  try {
    await search.fill("Reference project 0");
    await expect(picker.getByText("Searching references", { exact: false })).toBeVisible();
    await picker.getByRole("listbox").evaluate((element) => {
      const viewport = element.parentElement!;
      viewport.scrollTop = viewport.scrollHeight;
    });
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event("release-reference-search")));
  }
  await expect(options).toHaveCount(10);
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await expect(options.first()).toBeInViewport({ ratio: 1 });
  await expect(search).toBeFocused();
});

for (const size of [
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
  { width: 320, height: 568 },
]) {
  test(`reference popover fits ${size.width}x${size.height} without moving or dimming the composer`, async ({
    desktop,
  }) => {
    await desktop.provision();
    const page = desktop.page;
    await createChannel(page, "reference-layout");
    await desktop.app.evaluate(({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(320, 200);
      window.setContentSize(size.width, size.height);
    }, size);
    await page.getByRole("button", { name: /^Signed in as / }).click();
    await page.getByRole("switch", { name: "Dark mode", exact: true }).setChecked(true);
    await page.keyboard.press("Escape");
    const composer = page.getByRole("textbox", { name: "Message #reference-layout", exact: true });
    await expect(composer).toBeEnabled();
    await expect(composer.locator("xpath=..")).toHaveCSS("opacity", "1");
    const before = (await composer.boundingBox())!;
    await composer.fill("@");
    const popover = page.getByRole("dialog", { name: "Workspace references", exact: true });
    await expect(popover).toBeVisible();
    await expect(popover).toBeInViewport({ ratio: 1 });
    const after = (await composer.boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
    const box = (await popover.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(size.width - 24);
    await expect(composer).toBeFocused();
    await popover.getByRole("tab", { name: "People", exact: true }).click();
    const owner = popover.getByRole("option", { name: "Desktop Owner", exact: true });
    await expect(owner).toBeVisible();
    await expect(owner).toBeInViewport({ ratio: 1 });
    await owner.click();
    await expect(popover).toHaveCount(0);
    await expect(composer).toBeFocused();
    await expect(composer.locator("[data-reference-chip]")).toHaveText("Desktop Owner");
    await composer.fill("@");
    await composer.press("ArrowDown");
    const search = popover.getByRole("combobox", { name: "Search references", exact: true });
    await search.fill("no-such-reference-xyz");
    await expect(
      popover.getByText("No accessible references found.", { exact: true }),
    ).toBeVisible();
    await search.press("Enter");
    await expect(popover).toBeVisible();
    await expect(composer).toHaveText("@");
    await search.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(composer).toBeFocused();
  });
}
