import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionMember } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { callTasks } from "../test-support/tasks.js";

for (const size of [
  { width: 1024, height: 768 },
  { width: 320, height: 568 },
]) {
  test(
    `task editors, details and sharing controls fit ${size.width}x${size.height}`,
    { tag: "@layout" },
    async ({ desktop, browser }) => {
      desktop.owner.name = `Owner ${"longname".repeat(15)}`;
      await desktop.provision();
      const member = await browser.newContext({ baseURL: desktop.rendererOrigin });
      try {
        const memberPage = await member.newPage();
        await provisionVerifiedAccount(memberPage, desktop.mailpit, desktop.member);
        await provisionMember(desktop.browser, memberPage, desktop.member.email);
      } finally {
        await member.close();
      }
      const { page } = desktop;
      const projectName = `Launch ${"p".repeat(150)}`;
      const { id: projectEntityId } = await callTasks<{ id: string }>(page, {
        action: "createProject",
        name: projectName,
      });
      const taskTitle = `Checklist ${"t".repeat(200)}`;
      const { id: taskEntityId } = await callTasks<{ id: string }>(page, {
        action: "createTask",
        projectEntityId,
        title: taskTitle,
        description: "description".repeat(100),
      });
      await desktop.openPath(`/tasks?projectId=${projectEntityId}&taskId=${taskEntityId}`);
      await resize(desktop, size.width, size.height);
      const detail = page.getByRole("region", { name: "Task details", exact: true });
      for (const name of ["Close task", "Add subtask", "Edit task"])
        await fitsWindow(detail.getByRole("button", { name, exact: true }));
      await detail.getByRole("button", { name: "Edit task", exact: true }).click();
      const form = page.getByRole("form", { name: "Edit task", exact: true });
      await fitsWindow(form.getByLabel("Task title", { exact: true }));
      for (const name of ["Status", "Priority", "Assignee"]) {
        await form.getByRole("combobox", { name, exact: true }).click();
        await fitsWindow(page.getByRole("listbox"));
        await page.keyboard.press("Escape");
      }
      for (const name of ["Save task", "Cancel"])
        await fitsWindow(form.getByRole("button", { name, exact: true }));
      await form.getByRole("button", { name: "Cancel", exact: true }).click();
      await detail.getByLabel("Add a comment", { exact: true }).fill("comment".repeat(100));
      await fitsWindow(detail.getByRole("button", { name: "Post comment", exact: true }));
      await detail.getByRole("button", { name: "Add subtask", exact: true }).click();
      await fitsWindow(page.getByRole("button", { name: "Create subtask", exact: true }));
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("tab", { name: "Settings", exact: true }).click();
      await fitsWindow(page.getByLabel("Project name", { exact: true }));
      const sharing = page.getByRole("region", { name: "Project sharing", exact: true });
      await fitsWindow(sharing.getByRole("button", { name: "Add access", exact: true }));
      await sharing.getByRole("button", { name: "Add access", exact: true }).click();
      const add = page.getByRole("dialog", { name: "Add project access", exact: true });
      await add
        .getByRole("combobox", { name: "Search people", exact: true })
        .fill(desktop.member.name);
      await fitsWindow(add);
      await add.getByRole("option", { name: desktop.member.name, exact: true }).click();
      await add.getByRole("button", { name: "Review access", exact: true }).click();
      const review = page.getByRole("dialog", { name: "Review access change", exact: true });
      for (const name of ["Confirm access", "Cancel access change"])
        await fitsWindow(review.getByRole("button", { name, exact: true }));
      await review.getByRole("button", { name: "Cancel access change", exact: true }).click();
      await page.getByRole("tab", { name: "Tasks", exact: true }).click();
      await detail.getByRole("button", { name: "Close task", exact: true }).click();
      await fitsWindow(page.getByRole("region", { name: "Project tasks", exact: true }));
      await page.getByRole("button", { name: "New task", exact: true }).click();
      await fitsWindow(page.getByRole("button", { name: "Create task", exact: true }));
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "New project", exact: true }).click();
      await page.getByLabel("Project name", { exact: true }).fill(projectName);
      await fitsWindow(page.getByRole("button", { name: "Create project", exact: true }));
    },
  );
}
