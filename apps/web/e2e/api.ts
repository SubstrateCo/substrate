import type { Page } from "@playwright/test";
import type { ServiceResult } from "@startup-os/contracts/result";

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
      const response = await fetch("/api/v1/session", { credentials: "same-origin" });
      const session: ServiceResult<{ session: { activeOrganizationId?: string | null } } | null> =
        await response.json();
      if (!session.success)
        return { data: null, error: session.error.message, errorCode: session.error.code };
      const organizationId =
        data?.organizationId ?? session.data?.session.activeOrganizationId ?? "no-workspace";
      try {
        const endpoints = {
          listConversations: ["GET", "conversations"],
          listMessages: ["GET", "messages"],
          createConversation: ["POST", "conversations"],
          sendMessage: ["POST", "messages"],
          toggleReaction: ["POST", "reactions"],
          addMembers: ["POST", "members"],
        } as const;
        const [method, endpoint] = endpoints[name];
        const input: MessagingInput = { ...data, organizationId };
        const query = new URLSearchParams();
        if (method === "GET") {
          for (const [key, value] of Object.entries(input)) {
            if (value !== undefined) query.set(key, String(value));
          }
        }
        const options: RequestInit = { method, credentials: "same-origin" };
        if (method === "POST") {
          options.headers = { "Content-Type": "application/json" };
          options.body = JSON.stringify(input);
        }
        const result: ServiceResult<T> = await (
          await fetch(
            `/api/v1/messaging/${endpoint}${method === "GET" ? `?${query}` : ""}`,
            options,
          )
        ).json();
        return result.success
          ? { data: result.data, error: null, errorCode: null }
          : { data: null, error: result.error.message, errorCode: result.error.code };
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error.message : String(error),
          errorCode: null,
        };
      }
    },
    { name, data },
  );
}
