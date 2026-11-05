import type { Page } from "@playwright/test";

interface MessagingInput {
  organizationId?: string;
  conversationId?: string;
  threadId?: string;
  messageId?: string;
  body?: string;
  emoji?: string;
  emails?: readonly string[];
  kind?: "dm" | "group" | "channel";
  name?: string;
  private?: boolean;
}

type MessagingFunction =
  | "listConversations"
  | "listMessages"
  | "createConversation"
  | "sendMessage"
  | "toggleReaction"
  | "addMembers";

export async function callMessaging<T>(page: Page, name: MessagingFunction, data?: MessagingInput) {
  return page.evaluate(
    async ({ name, data }) => {
      // Import Vite's client transform. Calls still cross the real server-function boundary.
      const modulePath = "/src/server/messaging.ts";
      const functions: Record<MessagingFunction, (input: { data: MessagingInput }) => Promise<T>> =
        await import(modulePath);
      const response = await fetch("/api/auth/get-session");
      const session: { session?: { activeOrganizationId?: string } } | null = await response.json();
      const organizationId =
        data?.organizationId ?? session?.session?.activeOrganizationId ?? "no-workspace";
      try {
        return { data: await functions[name]({ data: { ...data, organizationId } }), error: null };
      } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) };
      }
    },
    { name, data },
  );
}
