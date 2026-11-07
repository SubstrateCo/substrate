import { provisionVerifiedAccount } from "../../../web/e2e/auth.js";
import { Mailpit } from "../../../web/e2e/mailpit.js";
import { choose } from "../test-support/controls.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

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

test("Electron invitation pagination supports keyboard and pointer without changing the route", async ({
  desktop,
  playwright,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.goto(new URL("/settings/organization", desktop.rendererOrigin).href);
  const email = page.getByLabel("Email", { exact: true });
  await email.fill(desktop.member.email);
  await choose(page, "Role", "Admin");
  const invitation = page.getByRole("row").filter({ hasText: desktop.member.email });
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(invitation).toContainText("admin");
  await expect(invitation).toContainText("pending");
  // A duplicate invitation exercises a real server rejection through native auth transport.
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(
    page.getByText("We couldn’t update this invitation. Check the email and try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(email).toHaveValue(desktop.member.email);
  await expect(page.getByRole("combobox", { name: "Role", exact: true })).toHaveText("Admin");
  await invitation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(invitation).toContainText("canceled");
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  const pending = invitation.filter({ hasText: "pending" });
  await expect(pending).toHaveCount(1);
  await expect(pending).toContainText("admin");

  const inviter = await playwright.request.newContext({ baseURL: desktop.rendererOrigin });
  try {
    await provisionVerifiedAccount({ request: inviter }, new Mailpit(inviter), desktop.member);
    for (let index = 1; index <= 11; index++) {
      const created = await inviter.post("/api/auth/organization/create", {
        headers: { origin: desktop.rendererOrigin },
        data: {
          name: `Pagination workspace ${index}`,
          slug: `pagination-${desktop.suffix}-${index}`,
        },
      });
      expect(created.ok(), `Create invitation workspace ${index}`).toBe(true);
      const organization: { id: string } = await created.json();
      const invited = await inviter.post("/api/auth/organization/invite-member", {
        headers: { origin: desktop.rendererOrigin },
        data: { organizationId: organization.id, email: desktop.owner.email, role: "member" },
      });
      expect(invited.ok(), `Invite the desktop user to workspace ${index}`).toBe(true);
    }
  } finally {
    await inviter.dispose();
  }

  await page.goto(new URL("/settings/user/invitations", desktop.rendererOrigin).href);
  const route = page.url();
  const table = page.getByRole("table", { name: "Your invitations", exact: true });
  const rows = table
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: "Review invitation", exact: true }) });
  await expect(rows).toHaveCount(10);
  const firstPage = await rows.allTextContents();
  const pagination = page.getByRole("navigation", {
    name: "Your invitations pagination",
    exact: true,
  });
  const previous = pagination.getByRole("button", { name: "Go to previous page", exact: true });
  const next = pagination.getByRole("button", { name: "Go to next page", exact: true });
  const first = pagination.getByRole("button", { name: "Go to page 1", exact: true });
  const second = pagination.getByRole("button", { name: "Go to page 2", exact: true });
  await expect(previous).toBeDisabled();
  await expect(first).toHaveAttribute("aria-current", "page");
  await next.focus();
  await next.press("Enter");
  await expect(rows).toHaveCount(1);
  expect(firstPage).not.toContain(await rows.first().textContent());
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await expect(second).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(route);
  await previous.click();
  await expect(rows).toHaveCount(10);
  await expect(first).toHaveAttribute("aria-current", "page");
  await second.focus();
  await second.press("Space");
  await expect(rows).toHaveCount(1);
  await expect(second).toHaveAttribute("aria-current", "page");
  await first.click();
  await expect(rows).toHaveCount(10);
  expect(await rows.allTextContents()).toEqual(firstPage);
  await expect(previous).toBeDisabled();
  await expect(page).toHaveURL(route);
});
