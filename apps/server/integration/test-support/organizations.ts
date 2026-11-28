import { appOrigin } from "./environment";
import { expect, type APIRequestContext } from "@playwright/test";

export type WorkspaceAccount = {
  request: APIRequestContext;
  organizationId: string;
  email: string;
};

export async function provisionWorkspaceSession(
  request: APIRequestContext,
  name: string,
  slug: string,
  options: { enableOptionalApps?: boolean } = {},
) {
  const origin = appOrigin;
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
  if (options.enableOptionalApps !== false) {
    const apps = await request.patch("/api/v1/organizations/apps", {
      headers: { origin },
      data: {
        organizationId: organization.id,
        enabledApps: ["messages", "agents", "tasks", "crm"],
      },
    });
    expect(apps.ok(), "The domain fixture enables optional apps").toBe(true);
  }
  return organization;
}
