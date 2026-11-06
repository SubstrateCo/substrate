import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { desktopLink, desktopOrigin } from "@startup-os/contracts/desktop/links";
import { Mailpit } from "../../web/e2e/mailpit.js";

const execFileAsync = promisify(execFile);

test("bundled app preserves connected work and auth through OS links, invitations, and recovery", async ({
  request,
}) => {
  test.skip(
    !process.env.DESKTOP_EXECUTABLE_PATH && !process.env.DESKTOP_BUNDLED_RENDERER,
    "Set DESKTOP_EXECUTABLE_PATH to the unpacked app, or DESKTOP_BUNDLED_RENDERER=1 after building Vite.",
  );
  test.setTimeout(180_000);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
  }
  const source = fileURLToPath(new URL("../src/main.js", import.meta.url));
  const packaged = Boolean(process.env.DESKTOP_EXECUTABLE_PATH);
  const desktop = await electron.launch({
    executablePath: process.env.DESKTOP_EXECUTABLE_PATH,
    args: [
      ...(packaged ? [] : [source, "--bundled-renderer"]),
      "--desktop-smoke-test",
      desktopLink("/signup"),
    ],
    env,
  });
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

  async function openPath(path: string) {
    const executable = await desktop.evaluate(() => process.execPath);
    try {
      await execFileAsync(
        executable,
        [
          ...(packaged ? [] : [source, "--bundled-renderer"]),
          "--desktop-smoke-test",
          desktopLink(path),
        ],
        { env, timeout: 15_000 },
      );
    } catch {
      // Child-process errors include argv. Never expose credential-bearing links.
      throw new Error("The desktop deep-link process failed.");
    }
  }

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
    await page.getByLabel("Name", { exact: true }).fill(account.name);
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    const created = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/sign-up/email",
    );
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    const response = await created;
    if (!response.ok()) {
      const result: { code?: string; message?: string } = await response.json();
      throw new Error(
        `Desktop signup failed (${response.status()}): ${result.code ?? "UNKNOWN"}: ${result.message ?? "Unknown error"}`,
      );
    }
    await expect(page.getByText("Verify your email", { exact: true })).toBeVisible();
    await openMail(account.email, "Verify your Startup OS email");
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  }

  async function login(page: Page, account: typeof owner) {
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    const signedIn = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/sign-in/email",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    expect(
      (await signedIn).ok(),
      "The packaged renderer can sign in through its native API proxy",
    ).toBe(true);
    expect(
      await desktop.evaluate(async ({ session }) => {
        const cookies = await session
          .fromPartition("startup-os-smoke-test")
          .cookies.get({ url: "https://desktop.startup-os.local" });
        return cookies.some((cookie) => cookie.httpOnly && cookie.name.includes("session_token"));
      }),
      "Sign-in stores its HttpOnly cookie in the native app session",
    ).toBe(true);
  }

  async function signout(page: Page) {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Signed in as / }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  }

  try {
    const page = await desktop.firstWindow();
    let pageErrors = 0;
    page.on("pageerror", () => {
      pageErrors++;
    });
    await expect(page).toHaveURL(
      (url) => url.origin === desktopOrigin && url.pathname === "/signup",
    );
    await signup(page, owner);
    await login(page, owner);
    await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
    await page.getByLabel("Workspace name", { exact: true }).fill(workspace);
    await page.getByLabel("Workspace slug", { exact: true }).fill(`desktop-${suffix}`);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Signed in as / })).toBeVisible();
    const cookiesBefore = await desktop.evaluate(({ session }) =>
      session
        .fromPartition("startup-os-smoke-test")
        .cookies.get({ url: "https://desktop.startup-os.local" }),
    );
    expect(
      cookiesBefore.some((cookie) => cookie.httpOnly && cookie.name.includes("session_token")),
      "Real Electron stores the backend session cookie",
    ).toBe(true);
    await openPath("/dashboard");
    await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    const cookiesAfter = await desktop.evaluate(({ session }) =>
      session
        .fromPartition("startup-os-smoke-test")
        .cookies.get({ url: "https://desktop.startup-os.local" }),
    );
    expect(
      cookiesAfter.find((cookie) => cookie.name.includes("session_token"))?.value ===
        cookiesBefore.find((cookie) => cookie.name.includes("session_token"))?.value,
      "OS navigation preserves the existing session token",
    ).toBe(true);
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
    expect(
      new URL(page.url()).searchParams.get("redirect")?.startsWith("/accept-invitation/"),
    ).toBe(true);
    await page.getByRole("link", { name: /create.*account/i }).click();
    await signup(page, member);
    await login(page, member);
    await openMail(member.email, `Join ${workspace} on Startup OS`);
    await expect(page.getByText(`Invited email: ${member.email}`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    await signout(page);
    await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(member.email);
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(
      page.getByText("Check your inbox for a password reset link.", { exact: true }),
    ).toBeVisible();
    await openMail(member.email, "Reset your Startup OS password");
    await expect(page.getByText("Choose a new password", { exact: true })).toBeVisible();
    member.password = `Recovered-${randomUUID()}!`;
    await page.getByLabel("New password", { exact: true }).fill(member.password);
    await page.getByLabel("Confirm password", { exact: true }).fill(member.password);
    await page.getByRole("button", { name: "Save new password", exact: true }).click();
    await expect(
      page.getByText("Your password was changed. You can now sign in.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await login(page, member);
    await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
    await desktop.evaluate(async ({ app, BrowserWindow }) => {
      await BrowserWindow.getAllWindows()[0]!.loadFile(`${app.getAppPath()}/offline.html`);
    });
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
