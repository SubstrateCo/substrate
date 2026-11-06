import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { authorizationCallback, requestBrowserSignIn } from "./auth.js";
import { test } from "./fixture.js";

test("desktop signup creates a workspace and OS navigation preserves the session", async ({
  desktop,
}) => {
  const { page, owner, workspace } = desktop;
  await expect(page).toHaveURL(
    (url) => url.origin === desktop.rendererOrigin && url.pathname === "/signup",
  );
  await desktop.signup(owner);
  await desktop.login(owner);
  await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
  await page.getByLabel("Workspace name", { exact: true }).fill(workspace);
  await page.getByLabel("Workspace slug", { exact: true }).fill(`desktop-${desktop.suffix}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Signed in as / })).toBeVisible();
  const sessionBefore = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
  );
  await desktop.openPath("/dashboard");
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
    ),
    "OS navigation preserves the main-owned session",
  ).toBe(sessionBefore);
});

test("desktop session transfer recovers from replay, restart, and offline navigation", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, browser, workspace } = desktop;
  await desktop.signout();
  expect(
    await page.evaluate(async () => (await (await fetch("/api/v1/session")).json()).data),
  ).toBeNull();
  await requestBrowserSignIn(desktop.app, page, browser);
  await expect(browser.getByText("Return to Startup OS", { exact: true })).toBeVisible();
  const callback = await authorizationCallback(browser, () =>
    browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
  );
  await desktop.openLink(callback);
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
  await desktop.signout();
  await desktop.openLink(callback);
  await expect(
    page.getByText("Could not complete sign-in. Please try again.", { exact: true }),
  ).toBeVisible();
  await requestBrowserSignIn(desktop.app, page, browser);
  const retry = await authorizationCallback(browser, () =>
    browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
  );
  await desktop.openLink(retry);
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
  const id = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
  );
  await desktop.restart();
  const restarted = desktop.page;
  await expect(
    restarted.getByRole("button", { name: `${workspace} ▾`, exact: true }),
  ).toBeVisible();
  expect(
    await restarted.evaluate(
      async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
    ),
  ).toBe(id);
  await desktop.app.evaluate(
    async ({ BrowserWindow }, path) => {
      await BrowserWindow.getAllWindows()[0]!.loadFile(path);
    },
    fileURLToPath(new URL("../src/offline.html", import.meta.url)),
  );
  await expect(
    restarted.getByRole("heading", { name: "Cannot connect to Startup OS", exact: true }),
  ).toBeVisible();
  await restarted.getByRole("link", { name: "Try again", exact: true }).click();
  await expect(
    restarted.getByRole("button", { name: `${workspace} ▾`, exact: true }),
  ).toBeVisible();
  expect(desktop.app.windows()).toHaveLength(1);
  expect(await restarted.evaluate("typeof require")).toBe("undefined");
});

test("desktop messages create linked tasks with OS navigation and source context", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, suffix } = desktop;
  const project = `Desktop project ${suffix.slice(0, 8)}`;
  const channel = `desktop-${suffix.slice(0, 8)}`;
  const task = `Desktop follow-up ${suffix.slice(0, 8)}`;
  const source = `Prepare the desktop launch checklist ${suffix}.`;
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill(project);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: project, exact: true })).toBeVisible();
  await apps.getByRole("button", { name: "Messages", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Conversations" })
    .getByRole("button", { name: "Create channel", exact: true })
    .click();
  await page.getByLabel("Channel name", { exact: true }).fill(channel);
  await page.getByRole("button", { name: "Create channel", exact: true }).last().click();
  const composer = page.getByRole("textbox", { name: `Message #${channel}`, exact: true });
  await composer.fill(source);
  await composer.press("Enter");
  const message = page
    .getByRole("region", { name: channel, exact: true })
    .getByRole("article")
    .filter({ hasText: source });
  await expect(message).toBeVisible();
  await message.hover();
  await message.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("combobox", { name: "Destination project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  const form = page.getByRole("form", { name: "New task", exact: true });
  await form.getByLabel("Task title", { exact: true }).fill(task);
  await form
    .getByRole("button", { name: "Copy source text into description", exact: true })
    .click();
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("link", { name: "Open created task", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
  const target = new URL(page.url());
  await desktop.openPath(`${target.pathname}${target.search}`);
  await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
  await expect(details.getByText(source, { exact: true }).first()).toBeVisible();
  await page
    .getByRole("region", { name: "Related context", exact: true })
    .getByRole("link", { name: `Created from a discussion · ${channel}`, exact: true })
    .click();
  await expect(message).toBeVisible();
});

test("desktop invitation email returns a new member to the invited workspace", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, browser, member, workspace } = desktop;
  await page.getByRole("button", { name: /^Signed in as / }).click();
  await page.getByRole("button", { name: "Organization settings", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(member.email);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(page.getByText("Invitation email sent.", { exact: true })).toBeVisible();
  await desktop.signout();
  await desktop.openMail(member.email, `Join ${workspace} on Startup OS`);
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("redirect")?.startsWith("/accept-invitation/"))
    .toBe(true);
  await browser.context().clearCookies();
  await desktop.signup(member);
  await desktop.login(member);
  await desktop.openMail(member.email, `Join ${workspace} on Startup OS`);
  await expect(page.getByText(`Invited email: ${member.email}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
});

test("desktop password recovery returns to browser sign-in and the existing workspace", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, browser, owner, workspace } = desktop;
  await desktop.signout();
  await browser.context().clearCookies();
  await requestBrowserSignIn(desktop.app, page, browser);
  await browser.getByRole("link", { name: "Forgot password?", exact: true }).click();
  await browser.getByLabel("Email", { exact: true }).fill(owner.email);
  await browser.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(
    browser.getByText("Check your inbox for a password reset link.", { exact: true }),
  ).toBeVisible();
  await browser.goto(
    await desktop.mailpit.link(
      owner.email,
      "Reset your Startup OS password",
      "/api/auth/reset-password",
    ),
  );
  await expect(browser.getByText("Choose a new password", { exact: true })).toBeVisible();
  owner.password = `Recovered-${randomUUID()}!`;
  await browser.getByLabel("New password", { exact: true }).fill(owner.password);
  await browser.getByLabel("Confirm password", { exact: true }).fill(owner.password);
  await browser.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(
    browser.getByText("Your password was changed. You can now sign in.", { exact: true }),
  ).toBeVisible();
  await browser.getByRole("link", { name: "Sign in", exact: true }).click();
  await desktop.login(owner);
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
});
