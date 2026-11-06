import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { provisionVerifiedAccount, type TestAccount } from "./auth";
import { Mailpit } from "./mailpit";
import { provisionMember, provisionWorkspace } from "./organizations";

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
    .getByRole("button", { name: new RegExp(`^${title} `) })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

test("explicit project grants control inherited task, subtask, and comment access", async ({
  browser,
  request,
}) => {
  test.setTimeout(360_000);
  const suffix = randomUUID();
  const account = (label: string): TestAccount => ({
    name: `${label} ${suffix}`,
    email: `${label.toLowerCase()}-${suffix}@example.test`,
    password: `Sharing-${randomUUID()}!`,
  });
  const owner = account("ProjectOwner");
  const member = account("ProjectAdmin");
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [ownerPage, memberPage] = await Promise.all(contexts.map((context) => context.newPage()));
  const mailpit = new Mailpit(request);
  const workspace = `Sharing ${suffix}`;
  const project = `Private project ${suffix}`;
  const parent = `Parent ${suffix}`;
  const child = `Child ${suffix}`;
  const sibling = `Sibling ${suffix}`;
  try {
    await test.step("create fresh verified users and invite the second user as organization admin", async () => {
      await memberPage.clock.install();
      await Promise.all([
        provisionVerifiedAccount(ownerPage, mailpit, owner),
        provisionVerifiedAccount(memberPage, mailpit, member),
      ]);
      await provisionWorkspace(ownerPage, workspace, `sharing-${suffix}`);
      await provisionMember(ownerPage, memberPage, member.email, "admin");
      await expect(
        memberPage.getByRole("button", { name: `${workspace} ▾`, exact: true }),
      ).toBeVisible();
      await ownerPage.getByRole("button", { name: "Tasks", exact: true }).click();
      await memberPage.getByRole("button", { name: "Tasks", exact: true }).click();
    });

    await test.step("create a private project with two root tasks, a subtask, and comments", async () => {
      await ownerPage.getByRole("button", { name: "New project", exact: true }).click();
      await ownerPage.getByLabel("Project name", { exact: true }).fill(project);
      await ownerPage.getByRole("button", { name: "Create project", exact: true }).click();
      await expect(ownerPage.getByRole("heading", { name: project, exact: true })).toBeVisible();
      await ownerPage.getByRole("button", { name: "New task", exact: true }).click();
      await ownerPage.getByLabel("Task title", { exact: true }).fill(parent);
      await ownerPage.getByRole("button", { name: "Create task", exact: true }).click();
      await comment(ownerPage, "Parent private comment");
      await ownerPage.getByRole("button", { name: "Add subtask", exact: true }).click();
      await ownerPage.getByLabel("Task title", { exact: true }).fill(child);
      await ownerPage.getByRole("button", { name: "Create subtask", exact: true }).click();
      await comment(ownerPage, "Child private comment");
      await ownerPage.getByRole("button", { name: "New task", exact: true }).click();
      await ownerPage.getByLabel("Task title", { exact: true }).fill(sibling);
      await ownerPage.getByRole("button", { name: "Create task", exact: true }).click();
      await memberPage.reload();
      await expect(
        memberPage
          .getByRole("complementary", { name: "Projects", exact: true })
          .getByRole("button", { name: project, exact: true }),
      ).toHaveCount(0);
      await expect(memberPage.getByText("Parent private comment", { exact: true })).toHaveCount(0);
    });

    await ownerPage.getByRole("button", { name: "Project settings", exact: true }).click();
    const sharing = ownerPage.getByRole("region", { name: "Project sharing", exact: true });
    await test.step("the last owner cannot remove self and gets a clear error", async () => {
      await sharing.getByRole("button", { name: `Remove ${owner.name}`, exact: true }).click();
      await expect
        .soft(sharing.getByRole("alert"))
        .toContainText("Cannot remove or downgrade the last owner.");
      await expect(sharing.getByText(`${owner.name} · owner`, { exact: true })).toBeVisible();
    });

    for (const permission of ["View", "Comment", "Edit", "View"] as const) {
      await test.step(`${permission} grant reaches every task and controls match the permission`, async () => {
        await select(ownerPage, "Person or agent", member.name);
        await select(ownerPage, "Permission", permission);
        await sharing.getByRole("button", { name: "Update access", exact: true }).click();
        await expect(
          sharing.getByText(`${member.name} · ${permission.toLowerCase()}`, { exact: true }),
        ).toBeVisible();
        await memberPage.clock.fastForward(5000);
        await expect(
          memberPage
            .getByRole("complementary", { name: "Projects", exact: true })
            .getByRole("button", { name: project, exact: true }),
        ).toBeVisible({ timeout: 20_000 });
        await memberPage
          .getByRole("complementary", { name: "Projects", exact: true })
          .getByRole("button", { name: project, exact: true })
          .click();
        for (const title of [parent, child, sibling]) {
          await expect(
            memberPage
              .getByRole("region", { name: "Project tasks", exact: true })
              .getByRole("button", { name: new RegExp(`^${title} `) }),
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
          await expect(
            memberPage.getByText("Edited by shared admin", { exact: true }),
          ).toBeVisible();
        }
        await memberPage.getByRole("button", { name: "Project settings", exact: true }).click();
        const memberSharing = memberPage.getByRole("region", {
          name: "Project sharing",
          exact: true,
        });
        await expect(
          memberSharing.getByRole("combobox", { name: "Permission", exact: true }),
        ).toHaveCount(0);
        await expect(memberSharing.getByRole("button", { name: /^Remove / })).toHaveCount(0);
        const editProject = memberPage.getByRole("button", { name: "Edit project", exact: true });
        if (permission === "Edit") await expect(editProject).toBeVisible();
        else await expect(editProject).toHaveCount(0);
        await memberPage.getByRole("button", { name: "Back to tasks", exact: true }).click();
        await openTask(memberPage, parent);
      });
    }

    await test.step("revocation removes an open task and its comments through polling without reload", async () => {
      await sharing.getByRole("button", { name: `Remove ${member.name}`, exact: true }).click();
      await expect(sharing.getByText(`${member.name} · view`, { exact: true })).toHaveCount(0);
      await memberPage.clock.fastForward(5000);
      await expect(
        memberPage
          .getByRole("complementary", { name: "Projects", exact: true })
          .getByRole("button", { name: project, exact: true }),
      ).toHaveCount(0, { timeout: 20_000 });
      await expect(
        memberPage.getByRole("region", { name: "Task details", exact: true }),
      ).toHaveCount(0);
      await expect(memberPage.getByText("Parent private comment", { exact: true })).toHaveCount(0);
      await expect(
        memberPage.getByRole("region", { name: "Project tasks", exact: true }),
      ).toHaveCount(0);
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
