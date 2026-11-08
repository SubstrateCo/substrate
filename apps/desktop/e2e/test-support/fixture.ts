import { desktopLink, desktopOrigin } from "@startup-os/contracts/desktop/links";

import {
  provisionVerifiedAccount,
  signup as browserSignup,
  verifyEmail,
  type TestAccount,
} from "../../../web/e2e/test-support/auth.js";
import { Mailpit } from "../../../web/e2e/test-support/mailpit.js";
import { provisionWorkspaceSession } from "../../../web/e2e/test-support/organizations.js";
import { applicationURL } from "../../src/shell/navigation.js";
import { authorizationCallback, requestBrowserSignIn } from "./auth.js";
import { waitForRealtimeIdle } from "./realtime.js";
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class DesktopFixture {
  readonly suffix = randomUUID();
  readonly workspace = `Desktop ${this.suffix.slice(0, 8)}`;
  readonly owner = this.account("Owner");
  readonly member = this.account("Member");
  page!: Page;
  pageErrors = 0;

  constructor(
    public app: ElectronApplication,
    readonly browser: Page,
    readonly mailpit: Mailpit,
    readonly launchOptions: NonNullable<Parameters<typeof electron.launch>[0]> & { args: string[] },
    readonly rendererOrigin: string,
  ) {}

  private account(kind: string): TestAccount {
    return {
      name: `Desktop ${kind}`,
      email: `desktop-${kind.toLowerCase()}-${this.suffix}@example.test`,
      password: `Initial-${randomUUID()}!`,
    };
  }

  async window() {
    this.page = await this.app.firstWindow();
    await this.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setContentSize(1024, 768);
      window.webContents.setBackgroundThrottling(false);
    });
    // Keep renderer focus local to each test instead of following shared OS focus.
    const session = await this.page.context().newCDPSession(this.page);
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    this.page.on("pageerror", () => this.pageErrors++);
    return this.page;
  }

  async openLink(link: string) {
    const executable = await this.app.evaluate(() => process.execPath);
    try {
      await execFileAsync(executable, [...this.launchOptions.args.slice(0, -1), link], {
        env: this.launchOptions.env,
        timeout: 15_000,
      });
    } catch {
      // Child-process errors include argv. Never expose credential-bearing links.
      throw new Error("The desktop deep-link process failed.");
    }
  }

  openPath(path: string) {
    return this.openLink(desktopLink(path));
  }

  async openMail(email: string, subject: string) {
    const landing = new URL(await this.mailpit.link(email, subject, "/desktop/open"));
    expect(landing.origin).not.toBe(desktopOrigin);
    const path = landing.searchParams.get("path");
    if (!path) throw new Error("Desktop email is missing its destination.");
    const response = await this.browser.request.get(landing.href);
    expect(response.ok(), "The external email landing page loads").toBe(true);
    await this.openPath(path);
  }

  async signup(account: TestAccount) {
    await requestBrowserSignIn(this.app, this.page, this.browser);
    await this.browser.getByRole("link", { name: "Create account", exact: true }).click();
    expect(new URL(this.browser.url()).searchParams.get("code_challenge")).toBeTruthy();
    await browserSignup(this.browser, account);
    await verifyEmail(this.browser, this.mailpit, account.email);
  }

  async login(account: TestAccount) {
    const callback = await authorizationCallback(this.browser, async () => {
      await this.browser.getByLabel("Email", { exact: true }).fill(account.email);
      await this.browser.getByLabel("Password", { exact: true }).fill(account.password);
      await this.browser.getByRole("button", { name: "Sign in", exact: true }).click();
    });
    await this.openLink(callback);
    await expect(
      this.page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeHidden();
    const session = await this.page.evaluate(async () => (await fetch("/api/v1/session")).json());
    expect(session.data.user.email).toBe(account.email);
    expect(session.data.session.token).toBeUndefined();
    const authSession = await this.page.evaluate(async () =>
      (await fetch("/api/auth/get-session")).json(),
    );
    expect(authSession.session.id).toBe(session.data.session.id);
    expect(authSession.session.token).toBeUndefined();
    const cookies = await this.app.evaluate(
      async ({ session }, origin) =>
        session.fromPartition("startup-os-smoke-test").cookies.get({ url: origin }),
      this.rendererOrigin,
    );
    expect(cookies.some((cookie) => cookie.name.includes("session_token"))).toBe(false);
    expect(await this.page.evaluate(() => document.cookie)).not.toContain("session_token");
  }

  async signout() {
    await this.page.keyboard.press("Escape");
    await this.page.getByRole("button", { name: /^Signed in as / }).click();
    await this.page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(this.page.getByText("Welcome back", { exact: true })).toBeVisible();
  }

  async provision() {
    await provisionVerifiedAccount(this.browser, this.mailpit, this.owner);
    await provisionWorkspaceSession(this.browser.request, this.workspace, `desktop-${this.suffix}`);
    await this.authorize();
    await expect(
      this.page.getByRole("button", { name: `${this.workspace} ▾`, exact: true }),
    ).toBeVisible();
    await waitForRealtimeIdle(this.page);
  }

  async authorize() {
    await requestBrowserSignIn(this.app, this.page, this.browser);
    await this.openLink(
      await authorizationCallback(this.browser, () =>
        this.browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
      ),
    );
    await expect(
      this.page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeHidden();
  }

  async restart() {
    await this.app.close();
    this.app = await electron.launch({
      ...this.launchOptions,
      args: [...this.launchOptions.args.slice(0, -1), desktopLink("/dashboard")],
    });
    await this.window();
  }
}

async function launchDesktop(browser: Page, mailpit: Mailpit, environment: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
  }
  Object.assign(env, environment);
  env.STARTUP_OS_TEST_ID = randomUUID();
  const packaged = Boolean(process.env.DESKTOP_EXECUTABLE_PATH);
  if (packaged) {
    delete env.STARTUP_OS_API_URL;
    delete env.STARTUP_OS_WEB_URL;
  } else {
    env.STARTUP_OS_STORAGE_ORIGINS =
      process.env.STARTUP_OS_STORAGE_ORIGINS ??
      new URL(process.env.S3_ENDPOINT ?? "http://localhost:4566").origin;
  }
  const bundled = packaged || Boolean(process.env.DESKTOP_BUNDLED_RENDERER);
  const launchOptions = {
    executablePath: process.env.DESKTOP_EXECUTABLE_PATH,
    args: [
      ...(packaged
        ? []
        : [
            fileURLToPath(new URL("../../src/main.js", import.meta.url)),
            ...(bundled ? ["--bundled-renderer"] : []),
          ]),
      "--desktop-smoke-test",
      "--no-error-dialogs",
      desktopLink("/signup"),
    ],
    env,
  };
  const fixture = new DesktopFixture(
    await electron.launch(launchOptions),
    browser,
    mailpit,
    launchOptions,
    bundled ? desktopOrigin : new URL(env.STARTUP_OS_WEB_URL || applicationURL).origin,
  );
  try {
    await fixture.window();
    return fixture;
  } catch (error) {
    await fixture.app.close();
    throw error;
  }
}

async function useDesktop(
  browser: Page,
  mailpit: Mailpit,
  use: (fixture: DesktopFixture) => Promise<void>,
  environment: Record<string, string>,
) {
  const fixture = await launchDesktop(browser, mailpit, environment);
  try {
    await use(fixture);
    expect(fixture.pageErrors, "The desktop workflow has no uncaught renderer errors").toBe(0);
  } finally {
    if (base.info().status !== base.info().expectedStatus) {
      await writeFile(
        base.info().outputPath("desktop-failure-state.json"),
        JSON.stringify({
          path: new URL(fixture.page.url()).pathname,
          text: await fixture.page
            .locator("body")
            .innerText({ timeout: 1_000 })
            .catch(() => "unavailable"),
          browserPath: new URL(browser.url()).pathname,
        }),
      );
    }
    await fixture.app.close();
  }
}

export const test = base.extend<{
  desktop: DesktopFixture;
  desktopPeer: DesktopFixture;
  desktopEnvironment: Record<string, string>;
  createDesktop: () => Promise<DesktopFixture>;
}>({
  desktopEnvironment: [{}, { option: true }],
  desktop: async ({ page, request, desktopEnvironment }, use) => {
    await useDesktop(page, new Mailpit(request), use, desktopEnvironment);
  },
  desktopPeer: async ({ browser, request, baseURL, desktopEnvironment }, use) => {
    const context = await browser.newContext({ baseURL });
    try {
      await useDesktop(await context.newPage(), new Mailpit(request), use, desktopEnvironment);
    } finally {
      await context.close();
    }
  },
  createDesktop: async ({ browser, request, baseURL, desktopEnvironment }, use) => {
    const fixtures: DesktopFixture[] = [];
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    try {
      await use(async () => {
        const context = await browser.newContext({ baseURL });
        contexts.push(context);
        const fixture = await launchDesktop(
          await context.newPage(),
          new Mailpit(request),
          desktopEnvironment,
        );
        fixtures.push(fixture);
        return fixture;
      });
      for (const fixture of fixtures)
        expect(fixture.pageErrors, "The desktop workflow has no uncaught renderer errors").toBe(0);
    } finally {
      try {
        await Promise.all(fixtures.map((fixture) => fixture.app.close()));
      } finally {
        await Promise.all(contexts.map((context) => context.close()));
      }
    }
  },
});
