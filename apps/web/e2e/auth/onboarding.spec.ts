import { Mailpit } from "../../../server/integration/test-support/mailpit";
import { signIn, signUp, verifyEmail } from "../test-support/auth";
import { inviteMember, test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("a visitor creates an organization before installing and can resume setup", async ({
  page,
  request,
}) => {
  const id = crypto.randomUUID();
  const email = `public-setup-${id}@example.test`;
  const password = `Setup-${id}!`;
  await page.goto("/");
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await signUp(page, email, password);
  await verifyEmail(page, request, email);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByText("Enter a workspace name.")).toBeVisible();
  const before = await page.request.get("/api/auth/organization/list");
  expect(await before.json()).toEqual([]);
  await page.getByLabel("Workspace name", { exact: true }).fill(`Public ${id}`);
  await expect(page.getByLabel("Workspace name", { exact: true })).toHaveValue(`Public ${id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Workspace slug", { exact: true }).fill(`public-${id}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invite your team", exact: true })).toBeVisible();
  const session = await page.request.get("/api/auth/get-session");
  const organizationId = (await session.json()).session.activeOrganizationId;
  const open = page.getByRole("link", { name: "Open Substrate", exact: true });
  await expect(open).toHaveAttribute(
    "href",
    `substrate-dev://open/dashboard?workspaceId=${organizationId}`,
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
    `Join Public ${id} on Substrate`,
    "/accept-invitation/",
  );
  expect(new URL(invitation).origin).toBe(process.env.PLAYWRIGHT_BASE_URL);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Workspaces", exact: true }).click();
  await expect(page.getByRole("button", { name: `Public ${id}`, exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Create a workspace", exact: true }).click();
  await page.getByLabel("Workspace name", { exact: true }).fill("Canceled workspace");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  const after = await page.request.get("/api/auth/organization/list");
  expect((await after.json()).map((org: { id: string }) => org.id)).toEqual([organizationId]);
});

test("a desktop-sent teammate invitation can be accepted by a new user in the browser", async ({
  actors,
  page,
  request,
}) => {
  const owner = actors.sender;
  const id = crypto.randomUUID();
  const email = `public-invite-${id}@example.test`;
  const password = `Invite-${id}!`;
  await inviteMember(owner, email, { origin: "https://desktop.substrate.local" });
  const invitation = await new Mailpit(request).link(
    email,
    `Join ${owner.organizationName} on Substrate`,
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
  await expect(page.getByRole("link", { name: "Open Substrate", exact: true })).toHaveAttribute(
    "href",
    `substrate-dev://open/dashboard?workspaceId=${owner.organizationId}`,
  );
  const memberships = await page.request.get("/api/auth/organization/list");
  expect((await memberships.json()).map((org: { id: string }) => org.id)).toEqual([
    owner.organizationId,
  ]);
});

test("public setup remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create account", exact: true })).toBeInViewport();
  await page.goto("/download");
  await expect(
    page.getByRole("link", { name: "Download for Windows", exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("link", { name: "Open Substrate", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("public downloads preserve a safe destination and do not forward it to the installer host", async ({
  page,
}) => {
  await page.goto("/download?redirect=%2Faccept-invitation%2Finvite-1");
  await expect(page.getByRole("link", { name: "Open Substrate", exact: true })).toHaveAttribute(
    "href",
    "substrate-dev://open/accept-invitation/invite-1",
  );
  // The server's installer redirect is unit-tested; the page must not pass the destination on.
  await expect(
    page.getByRole("link", { name: "Download for Windows", exact: true }),
  ).toHaveAttribute("href", "/desktop/download");
  await page.goto("/download?redirect=https%3A%2F%2Fevil.example");
  await expect(page.getByRole("link", { name: "Open Substrate", exact: true })).toHaveAttribute(
    "href",
    "substrate-dev://open/onboarding",
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

test("switching accounts keeps the intended invitation", async ({
  actors,
  client,
  freshSession,
}) => {
  const owner = await freshSession(actors.partner);
  const email = `another-person-${crypto.randomUUID()}@example.test`;
  const { id } = await inviteMember(owner, email);
  const user = await client(owner);
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
    user.page.getByRole("link", { name: "Open Substrate", exact: true }),
  ).toHaveAttribute(
    "href",
    `substrate-dev://open/dashboard?workspaceId=${actors.sender.organizationId}`,
  );
});

test("browser account switching preserves the desktop authorization and invitation destination", async ({
  actors,
  client,
  freshSession,
}) => {
  const account = await freshSession(actors.partner);
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
