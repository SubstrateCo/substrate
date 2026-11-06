import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { desktopLink, desktopOrigin } from "@startup-os/contracts/desktop/links";
import { Mailpit } from "../../web/e2e/mailpit.js";
import { signup as browserSignup, verifyEmail } from "../../web/e2e/auth.js";
import { authorizationCallback, requestBrowserSignIn } from "./auth.js";
import { applicationURL } from "../src/navigation.js";

const execFileAsync = promisify(execFile);

test("bundled app preserves connected work and auth through OS links, invitations, and recovery", async ({
  request,
  page: browser,
}) => {
  test.setTimeout(180_000);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
  }
  env.STARTUP_OS_TEST_ID = randomUUID();
  const source = fileURLToPath(new URL("../src/main.js", import.meta.url));
  const packaged = Boolean(process.env.DESKTOP_EXECUTABLE_PATH);
  if (packaged) {
    delete env.STARTUP_OS_API_URL;
    delete env.STARTUP_OS_WEB_URL;
  }
  const bundled = packaged || Boolean(process.env.DESKTOP_BUNDLED_RENDERER);
  const rendererOrigin = bundled ? desktopOrigin : applicationURL;
  const launchOptions = {
    executablePath: process.env.DESKTOP_EXECUTABLE_PATH,
    args: [
      ...(packaged ? [] : [source, ...(bundled ? ["--bundled-renderer"] : [])]),
      "--desktop-smoke-test",
      desktopLink("/signup"),
    ],
    env,
  };
  let desktop = await electron.launch(launchOptions);
  const mailpit = new Mailpit(request);
  const suffix = randomUUID();
  const owner = {
    name: "Desktop Owner",
    email: `desktop-owner-${suffix}@example.test`,
    password: `Initial-${randomUUID()}!`,
  };
  const member = {
    name: "Desktop Member",
    email: `desktop-member-${suffix}@example.test`,
    password: `Initial-${randomUUID()}!`,
  };
  const workspace = `Desktop ${suffix.slice(0, 8)}`;

  async function openLink(link: string) {
    const executable = await desktop.evaluate(() => process.execPath);
    try {
      await execFileAsync(
        executable,
        [
          ...(packaged ? [] : [source, ...(bundled ? ["--bundled-renderer"] : [])]),
          "--desktop-smoke-test",
          link,
        ],
        { env, timeout: 15_000 },
      );
    } catch {
      // Child-process errors include argv. Never expose credential-bearing links.
      throw new Error("The desktop deep-link process failed.");
    }
  }

  const openPath = (path: string) => openLink(desktopLink(path));

  async function openMail(email: string, subject: string) {
    const landing = new URL(await mailpit.link(email, subject, "/desktop/open"));
    expect(landing.origin).not.toBe(desktopOrigin);
    const path = landing.searchParams.get("path");
    if (!path) throw new Error("Desktop email is missing its destination.");
    // Check the real backend landing page without using the renderer's cookie jar.
    const response = await request.get(landing.href);
    expect(response.ok(), "The external email landing page loads").toBe(true);
    await openPath(path);
  }

  async function signup(page: Page, account: typeof owner) {
    await requestBrowserSignIn(desktop, page, browser);
    await browser.getByRole("link", { name: "Create account", exact: true }).click();
    expect(new URL(browser.url()).searchParams.get("code_challenge")).toBeTruthy();
    await browserSignup(browser, account);
    await verifyEmail(browser, mailpit, account.email);
  }

  async function login(page: Page, account: typeof owner) {
    const callback = await authorizationCallback(browser, async () => {
      await browser.getByLabel("Email", { exact: true }).fill(account.email);
      await browser.getByLabel("Password", { exact: true }).fill(account.password);
      await browser.getByRole("button", { name: "Sign in", exact: true }).click();
    });
    await openLink(callback);
    await expect(
      page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeHidden();
    const session = await page.evaluate(async () => (await fetch("/api/v1/session")).json());
    expect(session.data.user.email).toBe(account.email);
    expect(session.data.session.token).toBeUndefined();
    const authSession = await page.evaluate(async () =>
      (await fetch("/api/auth/get-session")).json(),
    );
    expect(authSession.session.id).toBe(session.data.session.id);
    expect(authSession.session.token).toBeUndefined();
    const cookies = await desktop.evaluate(
      async ({ session }, origin) =>
        session.fromPartition("startup-os-smoke-test").cookies.get({ url: origin }),
      rendererOrigin,
    );
    expect(cookies.some((cookie) => cookie.name.includes("session_token"))).toBe(false);
    expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");
  }

  async function signout(page: Page) {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Signed in as / }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  }

  try {
    let page = await desktop.firstWindow();
    let pageErrors = 0;
    page.on("pageerror", () => {
      pageErrors++;
    });
    await expect(page).toHaveURL(
      (url) => url.origin === rendererOrigin && url.pathname === "/signup",
    );
    await signup(page, owner);
    await login(page, owner);
    await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
    await page.getByLabel("Workspace name", { exact: true }).fill(workspace);
    await page.getByLabel("Workspace slug", { exact: true }).fill(`desktop-${suffix}`);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Signed in as / })).toBeVisible();
    const sessionBefore = await page.evaluate(
      async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
    );
    await openPath("/dashboard");
    await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
      ),
      "OS navigation preserves the main-owned session",
    ).toBe(sessionBefore);
    await test.step("existing browser sessions transfer without another password and replay errors stay recoverable", async () => {
      await signout(page);
      expect(
        await page.evaluate(async () => (await (await fetch("/api/v1/session")).json()).data),
      ).toBeNull();
      await requestBrowserSignIn(desktop, page, browser);
      await expect(browser.getByText("Return to Startup OS", { exact: true })).toBeVisible();
      const callback = await authorizationCallback(browser, () =>
        browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
      );
      await openLink(callback);
      await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
      await signout(page);
      await openLink(callback);
      await expect(
        page.getByText("Could not complete sign-in. Please try again.", { exact: true }),
      ).toBeVisible();
      await requestBrowserSignIn(desktop, page, browser);
      const retry = await authorizationCallback(browser, () =>
        browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
      );
      await openLink(retry);
      await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    });
    await test.step("messages create linked tasks with navigable source context in the packaged app", async () => {
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
      await expect(
        page
          .getByRole("region", { name: "Task details", exact: true })
          .getByRole("heading", { name: task, exact: true }),
      ).toBeVisible();
      const target = new URL(page.url());
      await openPath(`${target.pathname}${target.search}`);
      const details = page.getByRole("region", { name: "Task details", exact: true });
      await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
      await expect(details.getByText(source, { exact: true }).first()).toBeVisible();
      const related = page.getByRole("region", { name: "Related context", exact: true });
      await related
        .getByRole("link", { name: `Created from a discussion · ${channel}`, exact: true })
        .click();
      await expect(message).toBeVisible();
    });
    await page.getByRole("button", { name: /^Signed in as / }).click();
    await page.getByRole("button", { name: "Organization settings", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(member.email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText("Invitation email sent.", { exact: true })).toBeVisible();
    await signout(page);
    await openMail(member.email, `Join ${workspace} on Startup OS`);
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        new URL(page.url()).searchParams.get("redirect")?.startsWith("/accept-invitation/"),
      )
      .toBe(true);
    await browser.context().clearCookies();
    await signup(page, member);
    await login(page, member);
    await openMail(member.email, `Join ${workspace} on Startup OS`);
    await expect(page.getByText(`Invited email: ${member.email}`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    await signout(page);
    await browser.context().clearCookies();
    await requestBrowserSignIn(desktop, page, browser);
    await browser.getByRole("link", { name: "Forgot password?", exact: true }).click();
    await browser.getByLabel("Email", { exact: true }).fill(member.email);
    await browser.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(
      browser.getByText("Check your inbox for a password reset link.", { exact: true }),
    ).toBeVisible();
    await browser.goto(
      await mailpit.link(
        member.email,
        "Reset your Startup OS password",
        "/api/auth/reset-password",
      ),
    );
    await expect(browser.getByText("Choose a new password", { exact: true })).toBeVisible();
    member.password = `Recovered-${randomUUID()}!`;
    await browser.getByLabel("New password", { exact: true }).fill(member.password);
    await browser.getByLabel("Confirm password", { exact: true }).fill(member.password);
    await browser.getByRole("button", { name: "Save new password", exact: true }).click();
    await expect(
      browser.getByText("Your password was changed. You can now sign in.", { exact: true }),
    ).toBeVisible();
    await browser.getByRole("link", { name: "Sign in", exact: true }).click();
    await login(page, member);
    await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    await test.step("encrypted main-owned sessions survive a full app restart", async () => {
      const id = await page.evaluate(
        async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
      );
      await desktop.close();
      desktop = await electron.launch({
        ...launchOptions,
        args: [...launchOptions.args.slice(0, -1), desktopLink("/dashboard")],
      });
      page = await desktop.firstWindow();
      page.on("pageerror", () => {
        pageErrors++;
      });
      await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
        ),
      ).toBe(id);
    });
    await desktop.evaluate(
      async ({ BrowserWindow }, path) => {
        await BrowserWindow.getAllWindows()[0]!.loadFile(path);
      },
      fileURLToPath(new URL("../src/offline.html", import.meta.url)),
    );
    await expect(
      page.getByRole("heading", { name: "Cannot connect to Startup OS", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    expect(desktop.windows()).toHaveLength(1);
    expect(await page.evaluate("typeof require")).toBe("undefined");
    expect(pageErrors, "The packaged workflow has no uncaught renderer errors").toBe(0);
  } finally {
    await desktop.close();
  }
});
