import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("workspace frame stays cohesive across apps and color themes", async ({ desktop }) => {
  await desktop.provision();
  const page = desktop.page;
  const rail = page.getByRole("navigation", { name: "Apps", exact: true });
  const titleBar = page.getByRole("banner", { name: "Window title bar" });
  const workspace = page.locator("[data-workspace-shell]");
  const content = workspace.locator(":scope > div");
  const search = titleBar.getByRole("combobox", { name: "Search workspace", exact: true });

  await rail.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Workspace appearance");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace appearance", exact: true }),
  ).toBeVisible();

  for (const dark of [false, true]) {
    await page.getByRole("button", { name: /^Signed in as / }).click();
    await page.getByRole("switch", { name: "Dark mode", exact: true }).setChecked(dark);
    await page.keyboard.press("Escape");
    await expect(rail).toHaveCSS(
      "background-color",
      dark ? "oklch(0.155 0.017 275)" : "oklch(0.94 0.012 275)",
    );
    await expect(rail).toHaveCSS("color", dark ? "oklch(0.94 0.014 280)" : "oklch(0.38 0.025 275)");
    const frameColor = await rail.evaluate((element) => getComputedStyle(element).backgroundColor);
    await expect(titleBar).toHaveCSS("background-color", frameColor);
    await expect(workspace).toHaveCSS("background-color", frameColor);
    await expect(titleBar).toHaveCSS("border-bottom-width", "0px");
    await expect(rail).toHaveCSS("border-right-width", "0px");
    await expect(content).toHaveCSS("border-top-left-radius", "14.4px");
    await expect(content).toHaveCSS("overflow", "hidden");
    await expect(search).toBeVisible();
    const searchColor = await search.evaluate(
      (element) =>
        getComputedStyle(element.closest("[data-slot=command-input-wrapper]")!).backgroundColor,
    );
    expect(searchColor).not.toBe(frameColor);
    await expect(titleBar.locator("[data-slot=command]")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );

    for (const app of ["Tasks", "Messages"]) {
      const button = rail.getByRole("button", { name: app, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-current", "page");
      await expect(button).toHaveCSS(
        "color",
        dark ? "oklch(0.96 0.015 280)" : "oklch(0.42 0.15 280)",
      );
      await expect(button).toHaveCSS(
        "background-color",
        dark ? "oklch(0.305 0.035 280)" : "oklch(0.95 0.018 280)",
      );
      await expect(content).toHaveCSS("border-top-left-radius", "14.4px");
      await expect(
        app === "Tasks"
          ? page.getByRole("heading", { name: "Workspace appearance", exact: true })
          : page.getByRole("complementary", { name: "Conversations", exact: true }),
      ).toBeVisible();
    }
  }
});
