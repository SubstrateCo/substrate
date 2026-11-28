import { accountNotificationPreferences } from "@substrate/contracts/notifications/preferences";
import { utcTimestamp } from "@substrate/contracts/timestamps";

import type { AlertPreferences, MessageNotice } from "./message-notifications.ts";
import { z } from "zod";

const feed = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.uuid(),
      createdAt: utcTimestamp,
      readAt: utcTimestamp.nullable(),
      kind: z.enum(["message", "mention", "reply", "assignment"]),
      alert: z.boolean().default(true),
      conversationId: z.uuid().nullable(),
      messageId: z.uuid().nullable(),
      entityId: z.uuid().nullable().default(null),
      projectEntityId: z.uuid().nullable().default(null),
      title: z.string().max(500).default("New message"),
      actorName: z.string().max(500).nullable().default(null),
      excerpt: z.string().max(2000).nullable().default(null),
      source: z
        .object({ name: z.string().max(500) })
        .nullable()
        .default(null),
    }),
  ),
});

type FeedOptions = {
  backend: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
};

export async function readNotificationFeed(
  options: FeedOptions,
  organizationId: string,
): Promise<MessageNotice[]> {
  const url = new URL("/api/v1/context/notifications", options.backend);
  url.searchParams.set("organizationId", organizationId);
  const response = await options.fetchAPI(url.href, { method: "GET", redirect: "error" });
  if (!response.ok) throw new Error("Notifications unavailable.");
  return feed
    .parse(await response.json())
    .data.map(({ source, ...row }) => ({ ...row, sourceName: source?.name ?? null }));
}

const preferences = z.object({ success: z.literal(true), data: accountNotificationPreferences });

export async function readAlertPreferences(options: FeedOptions): Promise<AlertPreferences> {
  const url = new URL("/api/v1/notifications/preferences", options.backend);
  const response = await options.fetchAPI(url.href, { method: "GET", redirect: "error" });
  if (!response.ok) throw new Error("Notification settings unavailable.");
  const { preview, sound, flash } = preferences.parse(await response.json()).data;
  return { preview, sound, flash };
}
