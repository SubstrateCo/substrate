import { Mailpit } from "../../server/integration/test-support/mailpit";
import { signIn, signUp, verifyEmail } from "./test-support/auth";
import { inviteMember, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("workspace creation can be canceled and only asks for a name initially", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await user.page.goto("/onboarding");
  const create = user.page.getByRole("button", { name: "Create a workspace", exact: true });
  await create.click();
  await user.page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(user.page.getByText("Enter a workspace name.")).toBeVisible();
  await expect(user.page.getByText("Workspace slug: —")).toBeVisible();
  await expect(user.page.getByText("Enter a workspace slug.")).toHaveCount(0);
  await user.page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(create).toBeFocused();
  await expect(user.page.getByLabel("Workspace name")).toHaveCount(0);
});

test("login moves from email to password by keyboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});

test("the user menu shows the selected theme", async ({ account, client }) => {
  const user = await client(account);
  await visit(user);
  await user.page.getByRole("button", { name: /^Signed in as / }).click();
  const theme = user.page.locator('[data-slot="toggle-group"][aria-label="Theme"]');
  await theme.getByRole("radio", { name: "Dark" }).click();
  const selected = theme.getByRole("radio", { checked: true });
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute("aria-label", "Dark");
  expect(await selected.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("a visitor creates an organization before installing and can resume setup", async ({
  page,
  request,
}) => {
  const id = crypto.randomUUID();
  const email = `public-setup-${id}@example.test`;
  const password = `Setup-${id}!`;
  await page.goto("/login");
  const loginCard = await page.locator('main [data-slot="card"]').boundingBox();
  expect(loginCard).not.toBeNull();
  await page.goto("/");
  await page.getByRole("link", { name: "Create organization", exact: true }).click();
  await signUp(page, email, password);
  await verifyEmail(page, request, email);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name", { exact: true }).fill(`Public ${id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Workspace slug", { exact: true }).fill(`public-${id}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  const setupCard = await page.locator('main [data-slot="card"]').boundingBox();
  expect(setupCard).not.toBeNull();
  expect(setupCard!.y).toBe(loginCard!.y);
  const navigation = await page.getByRole("navigation", { name: "Account" }).boundingBox();
  expect(navigation).not.toBeNull();
  expect(navigation!.y + navigation!.height).toBeLessThan(setupCard!.y);
  await expect(page.getByRole("heading", { name: "Invite your team", exact: true })).toBeVisible();
  const session = await page.request.get("/api/v1/session");
  const organizationId = (await session.json()).data.session.activeOrganizationId;
  const open = page.getByRole("link", { name: "Open Startup OS", exact: true });
  await expect(open).toHaveAttribute(
    "href",
    `startupos://open/dashboard?workspaceId=${organizationId}`,
  );
  await expect(
    page.getByRole("link", { name: "Download for Windows", exact: true }),
  ).toHaveAttribute("href", "/desktop/download");
  const teammate = `teammate-${id}@example.test`;
  await page.getByLabel("Email", { exact: true }).fill(teammate);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(
    page
      .getByRole("list", { name: "Invitations", exact: true })
      .getByText(teammate, { exact: true }),
  ).toBeVisible();
  const invitation = await new Mailpit(request).link(
    teammate,
    `Join Public ${id} on Startup OS`,
    "/accept-invitation/",
  );
  expect(new URL(invitation).origin).toBe(process.env.PLAYWRIGHT_BASE_URL);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Workspaces", exact: true }).click();
  await expect(page.getByRole("button", { name: `Public ${id}`, exact: true })).toHaveCount(1);
});

test("a desktop-sent teammate invitation can be accepted by a new user in the browser", async ({
  account,
  page,
  request,
}) => {
  const id = crypto.randomUUID();
  const email = `public-invite-${id}@example.test`;
  const password = `Invite-${id}!`;
  await inviteMember(account, email, { origin: "https://desktop.startup-os.local" });
  const invitation = await new Mailpit(request).link(
    email,
    `Join ${account.name} on Startup OS`,
    "/desktop/open",
  );
  await page.goto(invitation);
  await page.getByRole("link", { name: "Continue in browser", exact: true }).click();
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await signUp(page, email, password);
  await verifyEmail(page, request, email);
  await signIn(page, email, password);
  await expect(page.getByText(`Invited email: ${email}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invite your team", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Startup OS", exact: true })).toHaveAttribute(
    "href",
    `startupos://open/dashboard?workspaceId=${account.organizationId}`,
  );
  const memberships = await page.request.get("/api/auth/organization/list");
  expect((await memberships.json()).map((org: { id: string }) => org.id)).toEqual([
    account.organizationId,
  ]);
});

test("public setup remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Create organization", exact: true }),
  ).toBeInViewport();
  await page.goto("/download");
  await expect(
    page.getByRole("link", { name: "Download for Windows", exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("link", { name: "Open Startup OS", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("public downloads preserve a safe destination and do not forward it to the installer host", async ({
  page,
  request,
}) => {
  await page.goto("/download?redirect=%2Faccept-invitation%2Finvite-1");
  await expect(page.getByRole("link", { name: "Open Startup OS", exact: true })).toHaveAttribute(
    "href",
    "startupos://open/accept-invitation/invite-1",
  );
  const download = await request.get("/desktop/download", { maxRedirects: 0 });
  expect(download.status()).toBe(303);
  expect(download.headers().location).toBe("https://downloads.example.test/StartupOS.exe");
  await page.goto("/download?redirect=https%3A%2F%2Fevil.example");
  await expect(page.getByRole("link", { name: "Open Startup OS", exact: true })).toHaveAttribute(
    "href",
    "startupos://open/onboarding",
  );
});

test("retrying activation opens the organization that was already created", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const id = crypto.randomUUID();
  await user.page.goto("/onboarding");
  await user.page.route("**/api/auth/organization/set-active", (route) => route.abort(), {
    times: 1,
  });
  await user.page.getByRole("button", { name: "Create a workspace", exact: true }).click();
  await user.page.getByLabel("Workspace name", { exact: true }).fill(`Retry ${id}`);
  await user.page.getByRole("button", { name: "Edit", exact: true }).click();
  await user.page.getByLabel("Workspace slug", { exact: true }).fill(`retry-${id}`);
  await user.page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(user.page.getByRole("alert")).toBeVisible();
  await user.page.getByRole("button", { name: "Continue setup", exact: true }).click();
  await expect(
    user.page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  const organizations = await user.page.request.get("/api/auth/organization/list");
  expect(
    (await organizations.json()).filter((org: { slug: string }) => org.slug === `retry-${id}`),
  ).toHaveLength(1);
});

test("switching accounts keeps the intended invitation", async ({ account, client }) => {
  const email = `another-person-${crypto.randomUUID()}@example.test`;
  const { id } = await inviteMember(account, email);
  const user = await client(account);
  const destination = `/accept-invitation/${id}`;
  await user.page.goto(destination);
  await expect(
    user.page.getByRole("heading", { name: "This invitation isn’t available" }),
  ).toBeVisible();
  await expect(user.page.getByRole("link", { name: "Go to your workspaces" })).toBeVisible();
  await expect(
    user.page.getByRole("button", { name: "Accept invitation", exact: true }),
  ).toHaveCount(0);
  await user.page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(user.page).toHaveURL(/\/login\?/);
  expect(new URL(user.page.url()).searchParams.get("redirect")).toBe(destination);
  await user.page.getByRole("link", { name: "Create account", exact: true }).click();
  expect(new URL(user.page.url()).searchParams.get("redirect")).toBe(destination);
});

test("a canceled invitation cannot add membership", async ({ account, actors, client }) => {
  const { id } = await inviteMember(actors.sender, account.email);
  const canceled = await actors.sender.request.post("/api/auth/organization/cancel-invitation", {
    data: { invitationId: id },
  });
  expect(canceled.ok()).toBe(true);
  const user = await client(account);
  await user.page.goto(`/accept-invitation/${id}`);
  await expect(
    user.page.getByRole("heading", { name: "This invitation isn’t available" }),
  ).toBeVisible();
  await expect(user.page.getByRole("link", { name: "Go to your workspaces" })).toBeVisible();
  await expect(
    user.page.getByRole("button", { name: "Accept invitation", exact: true }),
  ).toHaveCount(0);
  const memberships = await user.page.request.get("/api/auth/organization/list");
  expect((await memberships.json()).map((org: { id: string }) => org.id)).toEqual([
    account.organizationId,
  ]);
});

test("an accepted invitation can resume when workspace activation fails", async ({
  account,
  actors,
  client,
}) => {
  const { id } = await inviteMember(actors.sender, account.email);
  const user = await client(account);
  await user.page.goto(`/accept-invitation/${id}`);
  await user.page.route("**/api/auth/organization/set-active", (route) => route.abort(), {
    times: 1,
  });
  await user.page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(
    user.page.getByRole("heading", { name: "Invitation accepted", exact: true }),
  ).toBeVisible();
  await expect(user.page.getByRole("alert")).toBeVisible();
  await user.page.getByRole("button", { name: "Continue setup", exact: true }).click();
  await expect(
    user.page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await expect(
    user.page.getByRole("link", { name: "Open Startup OS", exact: true }),
  ).toHaveAttribute(
    "href",
    `startupos://open/dashboard?workspaceId=${actors.sender.organizationId}`,
  );
});

test("browser account switching preserves the desktop authorization and invitation destination", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const destination = `/accept-sharing/${crypto.randomUUID()}`;
  const search = new URLSearchParams({
    redirect: destination,
    client_id: "electron",
    state: "account-switch-state",
    code_challenge: "account-switch-challenge",
  });
  await user.page.goto(`/login?${search}`);
  await expect(user.page.getByText(`Signed in as ${account.email}`, { exact: true })).toBeVisible();
  await user.page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(user.page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(Object.fromEntries(new URL(user.page.url()).searchParams)).toMatchObject(
    Object.fromEntries(search),
  );
});
