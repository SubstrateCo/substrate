import { post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("project downloads include project details and tasks in CSV and JSON", async ({
  account,
  client,
}) => {
  const project = await post<{ id: string }>(account, "tasks/mutations", {
    organizationId: account.organizationId,
    action: "createProject",
    name: "Launch plan",
    description: "Prepare the next release.",
  });
  const task = await post<{ id: string }>(account, "tasks/mutations", {
    organizationId: account.organizationId,
    action: "createTask",
    projectEntityId: project.id,
    title: "Review launch checklist",
    description: "Check the release notes and customer updates.",
    priority: "high",
    dueDate: "2026-12-01",
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
    const text = await readFile(await download.path(), "utf8");
    if (format === "JSON") {
      expect(JSON.parse(text)).toEqual([
        expect.objectContaining({
          recordType: "project",
          entityId: project.id,
          name: "Launch plan",
        }),
        expect.objectContaining({
          recordType: "task",
          entityId: task.id,
          projectEntityId: project.id,
          title: "Review launch checklist",
          priority: "high",
          dueDate: "2026-12-01",
        }),
      ]);
    } else {
      expect(text).toContain('"recordType","entityId","projectEntityId"');
      expect(text).toContain('"Launch plan"');
      expect(text).toContain(`"task","${task.id}","${project.id}"`);
      expect(text).toContain('"Check the release notes and customer updates."');
    }
    await expect(page.getByRole("heading", { name: "Launch plan", exact: true })).toBeVisible();
  }
});
