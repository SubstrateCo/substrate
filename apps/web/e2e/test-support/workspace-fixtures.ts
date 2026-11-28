import { provisionWorkspaceSession } from "../../../server/integration/test-support/organizations";
import { test as base } from "./fixtures";
import { randomUUID } from "node:crypto";

export const test = base.extend({
  account: async ({ playwright, workspaceIdentity }, use) => {
    const request = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_API_URL,
      storageState: workspaceIdentity.state,
      extraHTTPHeaders: { origin: process.env.PLAYWRIGHT_BASE_URL! },
    });
    try {
      const id = randomUUID();
      const name = `Workspace ${id}`;
      const organization = await provisionWorkspaceSession(request, name, `workspace-${id}`);
      await use({
        ...workspaceIdentity,
        request,
        organizationId: organization.id,
        organizationName: name,
        state: await request.storageState(),
      });
    } finally {
      await request.dispose();
    }
  },
});
