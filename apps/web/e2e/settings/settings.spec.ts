import { provisionVerifiedAccount, type TestAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionWorkspace } from "../test-support/organizations";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("personal invitations show loading, recover from errors, and disable expired invitations", async ({
  page,
  request,
}) => {
  const suffix = randomUUID();
  await provisionVerifiedAccount(page, new Mailpit(request), {
    name: `Invitations ${suffix}`,
    email: `invitations-${suffix}@example.test`,
    password: `Password-${randomUUID()}!`,
  });
  const loading = Promise.withResolvers<void>();
  let failed = true;
  await page.route("**/api/auth/organization/list-user-invitations*", async (route) => {
    await loading.promise;
    await route.fulfill(
      failed
        ? {
            status: 400,
            json: { message: "Could not load your invitations." },
          }
        : {
            json: [
              {
                id: "available",
                organizationName: "Available team",
                role: "member",
                status: "pending",
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
              {
                id: "expired",
                organizationName: "Expired team",
                role: "admin",
                status: "pending",
                expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
              },
            ],
          },
    );
  });
  await page.goto("/settings/user/invitations");
  await expect(page.getByRole("status")).toHaveText("Loading your invitations…");
  loading.resolve();
  await expect(page.getByRole("heading", { name: "Couldn’t load your invitations" })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const available = page.getByRole("row").filter({ hasText: "Available team" });
  const expired = page.getByRole("row").filter({ hasText: "Expired team" });
  await expect(
    available.getByRole("link", { name: "Review invitation", exact: true }),
  ).toBeVisible();
  await expect(expired).toContainText("expired");
  await expect(expired.getByRole("link")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  const mobileInvitations = page.getByRole("list", { name: "Your invitations", exact: true });
  const mobileAvailable = mobileInvitations
    .getByRole("listitem")
    .filter({ hasText: "Available team" });
  const mobileReview = mobileAvailable.getByRole("link", {
    name: "Review invitation",
    exact: true,
  });
  await mobileReview.scrollIntoViewIfNeeded();
  await expect(mobileReview).toBeInViewport({ ratio: 1 });
  const mobileExpired = mobileInvitations.getByRole("listitem").filter({ hasText: "Expired team" });
  await expect(mobileExpired).toContainText("expired");
  await expect(mobileExpired.getByRole("link")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("personal invitations work without a workspace and organization settings enforce roles", async ({
  page,
  browser,
  request,
}) => {
  const suffix = randomUUID();
  const account = (kind: string): TestAccount => ({
    name: `${kind} ${suffix}`,
    email: `${kind}-${suffix}@example.test`,
    password: `Password-${randomUUID()}!`,
  });
  const owner = account("owner");
  const recipient = account("recipient");
  const mailpit = new Mailpit(request);
  const organizationName = `Settings ${suffix}`;
  await provisionVerifiedAccount(page, mailpit, owner);
  await provisionWorkspace(page, organizationName, `settings-${suffix}`);
  const organizationResponse = await page.request.get(
    "/api/auth/organization/get-full-organization",
  );
  expect(organizationResponse.ok()).toBe(true);
  const organization: { id: string } = await organizationResponse.json();
  const headers = { Origin: new URL(page.url()).origin };
  let recipientInvitationId = "";
  for (const email of [recipient.email, `unrelated-${suffix}@example.test`]) {
    const invitation = await page.request.post("/api/auth/organization/invite-member", {
      headers,
      data: { organizationId: organization.id, email, role: "member" },
    });
    expect(invitation.ok(), await invitation.text()).toBe(true);
    if (email === recipient.email) {
      const created: { id: string } = await invitation.json();
      recipientInvitationId = created.id;
    }
  }
  await page.goto("/settings/organization");
  await expect(
    page.getByRole("heading", { name: "Organization settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: recipient.email })).toContainText("pending");
  await page.goto("/settings/user/invitations");
  await expect(
    page.getByRole("heading", { name: "You have no pending invitations.", exact: true }),
  ).toBeVisible();

  const context = await browser.newContext();
  try {
    const memberPage = await context.newPage();
    await provisionVerifiedAccount(memberPage, mailpit, recipient);
    await memberPage.goto("/organizations");
    await memberPage.getByRole("link", { name: "Your invitations", exact: true }).click();
    await expect(
      memberPage.getByRole("heading", { name: "User settings", exact: true }),
    ).toBeVisible();
    const invitations = memberPage.getByRole("table", { name: "Your invitations" });
    await expect(invitations.getByRole("row")).toHaveCount(2);
    await expect(invitations).toContainText(organizationName);
    const review = invitations.getByRole("link", { name: "Review invitation", exact: true });
    await expect(review).toHaveCount(1);
    await expect(review).toHaveAttribute("href", `/accept-invitation/${recipientInvitationId}`);
    await memberPage.getByRole("link", { name: "Profile and appearance", exact: true }).click();
    const theme = memberPage.getByRole("switch", { name: "Dark mode", exact: true });
    await theme.check();
    await memberPage.reload();
    await expect(theme).toBeChecked();
    await memberPage.getByRole("link", { name: "Invitations", exact: true }).click();
    await memberPage.getByRole("link", { name: "Review invitation", exact: true }).click();
    await memberPage.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await memberPage.getByRole("button", { name: /^Signed in as / }).click();
    await expect(
      memberPage.getByRole("button", { name: "User settings", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: "Organization settings", exact: true }),
    ).toHaveCount(0);
    await memberPage.keyboard.press("Escape");
    await memberPage.goto("/settings/organization");
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await expect(
      memberPage.getByRole("heading", { name: "Organization settings", exact: true }),
    ).toHaveCount(0);
    await memberPage.goto("/settings/user/invitations");
    await expect(
      memberPage.getByRole("heading", { name: "You have no pending invitations.", exact: true }),
    ).toBeVisible();

    const detail = await page.request.get("/api/auth/organization/get-full-organization");
    const members: { members: { id: string; user: { email: string } }[] } = await detail.json();
    const memberId = members.members.find((member) => member.user.email === recipient.email)?.id;
    expect(memberId).toBeTruthy();
    const promote = await page.request.post("/api/auth/organization/update-member-role", {
      headers,
      data: { organizationId: organization.id, memberId, role: "admin" },
    });
    expect(promote.ok()).toBe(true);
    await memberPage.goto("/settings/organization");
    await expect(
      memberPage.getByRole("heading", { name: "Organization settings", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByText("Only organization owners can send and manage invitations.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: "Send invitation", exact: true }),
    ).toHaveCount(0);
    const denied = await memberPage.request.post("/api/auth/organization/invite-member", {
      headers,
      data: {
        organizationId: organization.id,
        email: `denied-${suffix}@example.test`,
        role: "member",
      },
    });
    expect(denied.status()).toBe(403);
    const demote = await page.request.post("/api/auth/organization/update-member-role", {
      headers,
      data: { organizationId: organization.id, memberId, role: "member" },
    });
    expect(demote.ok()).toBe(true);
    await memberPage.reload();
    await expect(memberPage).toHaveURL(/\/dashboard$/);
  } finally {
    await context.close();
  }
});
