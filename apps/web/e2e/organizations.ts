import { expect, type Page } from "@playwright/test";

export async function expectScopedMembershipAfter(page: Page, action: () => Promise<void>) {
  const [organizationResponse, membershipRequest] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/auth/organization/get-full-organization" &&
        response.ok(),
    ),
    page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === "/api/auth/organization/get-active-member-role",
    ),
    action(),
  ]);
  const organization: { id: string } = await organizationResponse.json();
  const membershipOrganizationId = new URL(membershipRequest.url()).searchParams.get(
    "organizationId",
  );
  expect(
    membershipOrganizationId,
    "The displayed membership is fetched for the displayed workspace",
  ).toBe(organization.id);
}

export async function expectWorkspace(
  page: Page,
  name: string,
  userName: string,
  role: "owner" | "member",
) {
  await expect(page.getByLabel(`Signed in as ${userName}`, { exact: true })).toBeVisible();
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await expect(apps.getByRole("button", { name: `${name} ▾`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Signed in as ${userName}`, exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "User actions" })
      .getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main > header, main > div > header")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Messages", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "User settings", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Organization settings", exact: true }),
  ).toHaveCount(role === "owner" ? 1 : 0);
  await page.keyboard.press("Escape");
}

export async function createWorkspace(page: Page, name: string, slug: string) {
  await page.getByLabel("Workspace name", { exact: true }).fill(name);
  await page.getByLabel("Workspace slug", { exact: true }).fill(slug);
  await expectScopedMembershipAfter(page, () =>
    page.getByRole("button", { name: "Create workspace", exact: true }).click(),
  );
  await expect(page.getByRole("button", { name: `${name} ▾`, exact: true })).toBeVisible();
}

export async function switchWorkspace(page: Page, current: string, next: string) {
  await page.getByRole("button", { name: `${current} ▾`, exact: true }).click();
  await expectScopedMembershipAfter(page, () =>
    page.getByRole("menuitem", { name: next, exact: true }).click(),
  );
  await expect(page.getByRole("button", { name: `${next} ▾`, exact: true })).toBeVisible();
}
