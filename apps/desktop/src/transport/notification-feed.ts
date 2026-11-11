import { z } from "zod";

const feed = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.uuid(),
      createdAt: z.iso.datetime({ offset: true }),
      readAt: z.iso.datetime({ offset: true }).nullable(),
      kind: z.enum(["message", "mention", "reply", "assignment"]),
      conversationId: z.uuid().nullable(),
      messageId: z.uuid().nullable(),
    }),
  ),
});

export async function readNotificationFeed(
  options: {
    backend: string;
    fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  },
  organizationId: string,
) {
  const url = new URL("/api/v1/context/notifications", options.backend);
  url.searchParams.set("organizationId", organizationId);
  const response = await options.fetchAPI(url.href, { method: "GET", redirect: "error" });
  if (!response.ok) throw new Error("Notifications unavailable.");
  return feed.parse(await response.json()).data;
}
