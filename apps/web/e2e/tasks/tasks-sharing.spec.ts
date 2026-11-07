import { provisionVerifiedAccount, type TestAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionMember, provisionWorkspace } from "../test-support/organizations";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

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
      await expect(
        ownerPage
          .getByRole("region", { name: "Task details", exact: true })
          .getByRole("heading", { name: parent, exact: true }),
      ).toBeVisible();
      await comment(ownerPage, "Parent private comment");
      await ownerPage.getByRole("button", { name: "Add subtask", exact: true }).click();
      await ownerPage.getByLabel("Task title", { exact: true }).fill(child);
      await ownerPage.getByRole("button", { name: "Create subtask", exact: true }).click();
      await expect(
        ownerPage
          .getByRole("region", { name: "Task details", exact: true })
          .getByRole("heading", { name: child, exact: true }),
      ).toBeVisible();
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
          await expect(
            memberPage.getByText("Edited by shared admin", { exact: true }),
          ).toBeVisible();
        }
        await memberPage.getByRole("tab", { name: "Settings", exact: true }).click();
        const memberSharing = memberPage.getByRole("region", {
          name: "Project sharing",
          exact: true,
        });
        await expect(
          memberSharing.getByRole("combobox", { name: "Permission", exact: true }),
        ).toHaveCount(0);
        await expect(memberSharing.getByRole("button", { name: /^Remove / })).toHaveCount(0);
        const editProject = memberPage.getByRole("form", { name: "Project details", exact: true });
        if (permission === "Edit") await expect(editProject).toBeVisible();
        else await expect(editProject).toHaveCount(0);
        await memberPage.getByRole("tab", { name: "Tasks", exact: true }).click();
        await openTask(memberPage, parent);
      });
    }

    await test.step("revocation removes an open task and its comments through polling without reload", async () => {
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
