import type { Page } from "@playwright/test";

export async function holdIdentityResponse(page: Page, conversationId: string, body: string) {
  return page.evaluateHandle(
    ({ conversationId, body }) => {
      const original = window.fetch;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let captured = false;
      let delivered = false;
      let successful = false;
      let containsPrivateBody = false;
      window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
        const input = args[0];
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const hold =
          !captured &&
          url.pathname === "/api/v1/messaging/messages" &&
          url.searchParams.get("conversationId") === conversationId;
        const response = await original(...args);
        if (hold) {
          const result = await response.clone().json();
          const includesPrivateBody = result.data?.some(
            (message: { body: string }) => message.body === body,
          );
          if (!captured && response.ok && result.success === true && includesPrivateBody) {
            captured = true;
            successful = true;
            containsPrivateBody = true;
            await gate;
            delivered = true;
          }
        }
        return response;
      }, original);
      return {
        state: () => ({ successful, containsPrivateBody, delivered }),
        restore: () => {
          release();
          window.fetch = original;
        },
      };
    },
    { conversationId, body },
  );
}

export async function nativeIdentity(page: Page) {
  return page.evaluate(async () => {
    const result: {
      data: { session: { id: string; activeOrganizationId: string }; user: { id: string } } | null;
    } = await (await fetch("/api/v1/session")).json();
    return result.data
      ? {
          sessionId: result.data.session.id,
          userId: result.data.user.id,
          organizationId: result.data.session.activeOrganizationId,
        }
      : null;
  });
}

export async function openIdentityChannel(page: Page, name: string) {
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}

export async function identityProject(page: Page, projectEntityId: string, organizationId: string) {
  return page.evaluate(
    async (query) => {
      const response = await fetch(`/api/v1/tasks/project?${new URLSearchParams(query)}`);
      const result = await response.json();
      return { success: result.success === true, hasData: result.data != null };
    },
    { organizationId, projectEntityId },
  );
}

export async function notificationIds(page: Page, organizationId: string) {
  return page.evaluate(async (organizationId) => {
    const result: { success: boolean; data: { id: string }[] } = await (
      await fetch(`/api/v1/context/notifications?${new URLSearchParams({ organizationId })}`)
    ).json();
    if (!result.success) throw new Error("The native notification query failed.");
    return result.data.map((item) => item.id);
  }, organizationId);
}
