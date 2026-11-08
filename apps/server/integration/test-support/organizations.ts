import { expect, type APIRequestContext } from "@playwright/test";

/** A signed-in request context with its active workspace. */
export type WorkspaceAccount = {
  request: APIRequestContext;
  organizationId: string;
  email: string;
};

export async function provisionWorkspaceSession(
  request: APIRequestContext,
  name: string,
  slug: string,
) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;
  const created = await request.post("/api/auth/organization/create", {
    headers: { origin },
    data: { name, slug },
  });
  expect(created.ok(), "The fixture workspace is created").toBe(true);
  const organization: { id: string } = await created.json();
  const activated = await request.post("/api/auth/organization/set-active", {
    headers: { origin },
    data: { organizationId: organization.id },
  });
  expect(activated.ok(), "The fixture workspace is active").toBe(true);
  return organization;
}
