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
  await expect(
    page.getByRole("heading", { name: `Welcome, ${userName}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: `${name} ▾`, exact: true })).toBeVisible();
  await expect(page.getByText(`Your role: ${role}.`, { exact: true })).toBeVisible();
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
