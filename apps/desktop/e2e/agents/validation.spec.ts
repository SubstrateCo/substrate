import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("Electron agent creation explains invalid names and saves a corrected name", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  const agents = page.getByRole("region", { name: "Agent actors", exact: true });
  await expect(agents.getByText("No agents yet.", { exact: true })).toBeVisible();
  await agents.getByRole("button", { name: "Create agent", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create agent", exact: true });
  const name = dialog.getByLabel("Agent name", { exact: true });
  const error = dialog.getByRole("alert").filter({ hasText: /name/i });
  const submit = dialog.getByRole("button", { name: "Save agent", exact: true });

  await submit.click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(error).toBeVisible();
  await expect(error).toContainText(/required|enter|provide|empty|blank/i);

  await name.fill("Draft reviewer");
  await name.blur();
  await expect(error).toBeHidden();
  await name.fill("   ");
  await name.blur();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(error).toBeVisible();
  await submit.click();
  await expect(dialog).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(error).toContainText(/required|enter|provide|empty|blank/i);
  const errorId = await error.getAttribute("id");
  expect(errorId, "The inline error has an accessible description target").toBeTruthy();
  expect((await name.getAttribute("aria-describedby"))?.split(/\s+/)).toContain(errorId);
  await expect(name).toHaveAccessibleDescription(/name/i);
  const controlBox = await name.boundingBox();
  const errorBox = await error.boundingBox();
  expect(controlBox).not.toBeNull();
  expect(errorBox).not.toBeNull();
  expect(errorBox!.y, "The readable name error is below its control").toBeGreaterThanOrEqual(
    controlBox!.y + controlBox!.height,
  );
  await expect(
    page
      .getByRole("region", { name: "Agent actors", exact: true, includeHidden: true })
      .getByRole("listitem", { includeHidden: true }),
  ).toHaveCount(0);

  await name.fill("Launch reviewer");
  await name.blur();
  await expect(error).toBeHidden();
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await submit.click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(
    agents.getByRole("button", { name: "Edit Launch reviewer", exact: true }),
  ).toBeVisible();
  await expect(agents.getByRole("listitem")).toHaveCount(1);
});
