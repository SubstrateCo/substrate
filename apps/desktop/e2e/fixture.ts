import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { desktopLink, desktopOrigin } from "@startup-os/contracts/desktop/links";
import { Mailpit } from "../../web/e2e/mailpit.js";
import {
  provisionVerifiedAccount,
  signup as browserSignup,
  verifyEmail,
  type TestAccount,
} from "../../web/e2e/auth.js";
import { provisionWorkspaceSession } from "../../web/e2e/organizations.js";
import { authorizationCallback, requestBrowserSignIn } from "./auth.js";
import { applicationURL } from "../src/navigation.js";

const execFileAsync = promisify(execFile);

class DesktopFixture {
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
    await requestBrowserSignIn(this.app, this.page, this.browser);
    await this.openLink(
      await authorizationCallback(this.browser, () =>
        this.browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
      ),
    );
    await expect(
      this.page.getByRole("button", { name: `${this.workspace} ▾`, exact: true }),
    ).toBeVisible();
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

export const test = base.extend<{ desktop: DesktopFixture }>({
  desktop: async ({ page: browser, request }, use) => {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
    }
    env.STARTUP_OS_TEST_ID = randomUUID();
    const packaged = Boolean(process.env.DESKTOP_EXECUTABLE_PATH);
    if (packaged) {
      delete env.STARTUP_OS_API_URL;
      delete env.STARTUP_OS_WEB_URL;
    }
    const bundled = packaged || Boolean(process.env.DESKTOP_BUNDLED_RENDERER);
    const launchOptions = {
      executablePath: process.env.DESKTOP_EXECUTABLE_PATH,
      args: [
        ...(packaged
          ? []
          : [
              fileURLToPath(new URL("../src/main.js", import.meta.url)),
              ...(bundled ? ["--bundled-renderer"] : []),
            ]),
        "--desktop-smoke-test",
        desktopLink("/signup"),
      ],
      env,
    };
    const fixture = new DesktopFixture(
      await electron.launch(launchOptions),
      browser,
      new Mailpit(request),
      launchOptions,
      bundled ? desktopOrigin : applicationURL,
    );
    try {
      await fixture.window();
      await use(fixture);
      expect(fixture.pageErrors, "The packaged workflow has no uncaught renderer errors").toBe(0);
    } finally {
      await fixture.app.close();
    }
  },
});
