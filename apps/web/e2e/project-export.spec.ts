import { post, visit } from "./test-support/fixtures";
import { test } from "./test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("project downloads save CSV and JSON files", async ({ account, client }) => {
  const project = await post<{ id: string }>(account, "tasks/mutations", {
    organizationId: account.organizationId,
    action: "createProject",
    name: "Launch plan",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/tasks", { projectId: project.id });
  for (const format of ["CSV", "JSON"]) {
    await page.getByRole("button", { name: "Download project", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: `Download ${format}`, exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`project-${project.id}.${format.toLowerCase()}`);
    expect(await download.failure()).toBeNull();
    await expect(page.getByRole("heading", { name: "Launch plan", exact: true })).toBeVisible();
  }
});
