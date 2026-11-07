import { test } from "../test-support/fixture.js";
import { joinWorkspace } from "../test-support/organizations.js";
import { waitForRealtimeIdle } from "../test-support/realtime.js";
import { callTasks } from "../test-support/tasks.js";
import { expect, type Page } from "@playwright/test";

async function select(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function comment(page: Page, body: string) {
  await page.getByLabel("Add a comment", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: body })).toBeVisible();
}

async function openTask(page: Page, title: string) {
  await page
    .getByRole("region", { name: "Project tasks", exact: true })
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

test("explicit project grants control inherited task, subtask, and comment access", async ({
  desktop,
  desktopPeer,
}) => {
  test.setTimeout(180_000);
  const suffix = desktop.suffix;
  desktopPeer.owner.name = "Project Admin";
  const owner = desktop.owner;
  const member = desktopPeer.owner;
  const ownerPage = desktop.page;
  const memberPage = desktopPeer.page;
  const project = `Private project ${suffix}`;
  const parent = `Parent ${suffix}`;
  const child = `Child ${suffix}`;
  const sibling = `Sibling ${suffix}`;
  await test.step("create fresh verified users and invite the second user as organization admin", async () => {
    await Promise.all([desktop.provision(), desktopPeer.provision()]);
    await joinWorkspace(desktop, desktopPeer, "admin");
    await ownerPage.getByRole("button", { name: "Tasks", exact: true }).click();
    await memberPage.getByRole("button", { name: "Tasks", exact: true }).click();
  });

  await test.step("seed a private project with two root tasks, a subtask, and comments", async () => {
    const { id: projectEntityId } = await callTasks<{ id: string }>(ownerPage, {
      action: "createProject",
      name: project,
    });
    const { id: parentTaskEntityId } = await callTasks<{ id: string }>(ownerPage, {
      action: "createTask",
      projectEntityId,
      title: parent,
    });
    const { id: childTaskEntityId } = await callTasks<{ id: string }>(ownerPage, {
      action: "createTask",
      projectEntityId,
      parentTaskEntityId,
      title: child,
    });
    await callTasks(ownerPage, { action: "createTask", projectEntityId, title: sibling });
    await callTasks(ownerPage, {
      action: "comment",
      projectEntityId,
      taskEntityId: parentTaskEntityId,
      body: "Parent private comment",
    });
    await callTasks(ownerPage, {
      action: "comment",
      projectEntityId,
      taskEntityId: childTaskEntityId,
      body: "Child private comment",
    });
    await desktop.openPath(`/tasks?projectId=${projectEntityId}`);
    await waitForRealtimeIdle(ownerPage);
    await memberPage.reload();
    await expect(
      memberPage.getByRole("heading", { name: "No projects yet", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage
        .getByRole("complementary", { name: "Projects", exact: true })
        .getByRole("button", { name: project, exact: true }),
    ).toHaveCount(0);
    await expect(memberPage.getByText("Parent private comment", { exact: true })).toHaveCount(0);
  });

  await ownerPage.getByRole("tab", { name: "Settings", exact: true }).click();
  const sharing = ownerPage.getByRole("region", { name: "Project sharing", exact: true });
  await test.step("the last owner cannot remove or downgrade self", async () => {
    await expect(
      sharing.getByRole("combobox", { name: `${owner.name} permission`, exact: true }),
    ).toBeDisabled();
    await expect(sharing.getByText("Last owner", { exact: true })).toBeVisible();
  });

  for (const [index, permission] of (["View", "Comment", "Edit", "View"] as const).entries()) {
    await test.step(`${permission} grant reaches every task and controls match the permission`, async () => {
      if (index === 0) {
        await sharing.getByRole("button", { name: "Add access", exact: true }).click();
        await ownerPage.getByRole("option", { name: member.name, exact: true }).click();
        await select(ownerPage, "Permission", permission);
        await ownerPage.getByRole("button", { name: "Review access", exact: true }).click();
      } else {
        await select(ownerPage, `${member.name} permission`, permission);
        await sharing
          .getByRole("listitem")
          .filter({ hasText: member.name })
          .getByRole("button", { name: "Apply", exact: true })
          .click();
      }
      if (index === 0 || permission !== "View") {
        await ownerPage.getByRole("button", { name: "Confirm access", exact: true }).click();
      } else {
        await expect(
          ownerPage.getByRole("button", { name: "Confirm access", exact: true }),
        ).toHaveCount(0);
      }
      await expect(
        sharing
          .getByRole("listitem")
          .filter({ has: ownerPage.getByText(member.name, { exact: true }) })
          .getByRole("combobox", { name: `${member.name} permission`, exact: true }),
      ).toContainText(permission);
      await expect(
        memberPage
          .getByRole("complementary", { name: "Projects", exact: true })
          .getByRole("button", { name: project, exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await waitForRealtimeIdle(memberPage);
      await memberPage
        .getByRole("complementary", { name: "Projects", exact: true })
        .getByRole("button", { name: project, exact: true })
        .click();
      for (const title of [parent, child, sibling]) {
        await expect(
          memberPage
            .getByRole("region", { name: "Project tasks", exact: true })
            .getByRole("button")
            .filter({ has: memberPage.getByText(title, { exact: true }) }),
        ).toBeVisible();
      }
      await openTask(memberPage, child);
      await expect(memberPage.getByText("Child private comment", { exact: true })).toBeVisible();
      if (permission === "View") {
        await expect(memberPage.getByLabel("Add a comment", { exact: true })).toHaveCount(0);
      } else {
        await expect(memberPage.getByLabel("Add a comment", { exact: true })).toBeVisible();
        await comment(memberPage, `${permission} inherited child comment`);
      }
      for (const name of ["New task", "Edit task", "Add subtask"]) {
        const button = memberPage.getByRole("button", { name, exact: true });
        if (permission === "Edit") await expect(button).toBeVisible();
        else await expect(button).toHaveCount(0);
      }
      await openTask(memberPage, parent);
      await expect(memberPage.getByText("Parent private comment", { exact: true })).toBeVisible();
      if (permission === "Edit") {
        await memberPage.getByRole("button", { name: "Edit task", exact: true }).click();
        await memberPage
          .getByLabel("Task description", { exact: true })
          .fill("Edited by shared admin");
        await memberPage.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(memberPage.getByText("Edited by shared admin", { exact: true })).toBeVisible();
      }
      await memberPage.getByRole("tab", { name: "Settings", exact: true }).click();
      const memberSharing = memberPage.getByRole("region", {
        name: "Project sharing",
        exact: true,
      });
      await expect(
        memberSharing.getByRole("listitem").filter({ hasText: member.name }),
      ).toContainText(`${permission.toLowerCase()} access`);
      await expect(
        memberSharing.getByRole("button", { name: "Add access", exact: true }),
      ).toHaveCount(0);
      await expect(memberSharing.getByRole("combobox", { name: / permission$/ })).toHaveCount(0);
      const editProject = memberPage.getByRole("form", { name: "Project details", exact: true });
      if (permission === "Edit") await expect(editProject).toBeVisible();
      else await expect(editProject).toHaveCount(0);
      await memberPage.getByRole("tab", { name: "Tasks", exact: true }).click();
      await openTask(memberPage, parent);
    });
  }

  await test.step("revocation removes an open task and its comments through realtime without reload", async () => {
    await memberPage.getByRole("tab", { name: "Settings", exact: true }).click();
    await waitForRealtimeIdle(memberPage);
    await select(ownerPage, `${member.name} permission`, "No access");
    await sharing
      .getByRole("listitem")
      .filter({ hasText: member.name })
      .getByRole("button", { name: "Apply", exact: true })
      .click();
    await ownerPage.getByRole("button", { name: "Remove access", exact: true }).click();
    await expect(
      sharing
        .getByRole("listitem")
        .filter({ has: ownerPage.getByText(member.name, { exact: true }) }),
    ).toHaveCount(0);
    await expect(
      memberPage
        .getByRole("complementary", { name: "Projects", exact: true })
        .getByRole("button", { name: project, exact: true }),
    ).toHaveCount(0, { timeout: 20_000 });
    await expect(memberPage.getByRole("region", { name: "Task details", exact: true })).toHaveCount(
      0,
    );
    await expect(memberPage.getByText("Parent private comment", { exact: true })).toHaveCount(0);
    await expect(memberPage.getByLabel("Add a comment", { exact: true })).toHaveCount(0);
    await expect(
      memberPage.getByRole("region", { name: "Project tasks", exact: true }),
    ).toHaveCount(0);
  });
});
