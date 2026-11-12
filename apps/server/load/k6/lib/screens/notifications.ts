import { cached, invalidate, mount, navigate, unmount } from "../client-cache.ts";
import { trace } from "../debug.ts";
import { call } from "../http.ts";
import { keys, type QueryKey } from "../keys.ts";
import type { World } from "../world.ts";

export interface NotificationEvent {
  id: string;
  title: string;
  excerpt?: string;
  readAt: string | null;
  conversationId: string | null;
  messageId: string | null;
  entityId: string | null;
  projectEntityId: string | null;
  eventCursor: string;
}
export interface NotificationGroup extends NotificationEvent {
  groupKey: string;
  count: number;
  unreadCount: number;
  newestCursor: string;
}
interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export type NotificationFilter = "all" | "unread";
const groupQueries = new Map<string, { key: QueryKey; filter: NotificationFilter }>();
const eventQueries = new Map<string, { key: QueryKey; groupKey: string }>();

export async function showNotifications(
  world: World,
  filter: NotificationFilter = "all",
  after?: string,
) {
  navigate("notifications");
  if (!after) {
    unmount(keys.notificationGroups(world.organizationId, filter === "all" ? "unread" : "all"));
    unmount(keys.notificationEvents(world.organizationId));
  }
  const key = [...keys.notificationGroups(world.organizationId, filter), after ?? "latest"];
  groupQueries.set(key.join(), { key, filter });
  return mount(key, async () => {
    const page = await call<Page<NotificationGroup>>("context.notifications.groups", {
      filter,
      after,
      limit: 20,
    });
    if (page)
      trace("notifications", `${filter}${after ? " next page" : ""}: ${page.items.length} groups`);
    return page;
  });
}

export function expandGroup(world: World, groupKey: string, after?: string) {
  const key = [...keys.notificationEvents(world.organizationId, groupKey), after ?? "latest"];
  eventQueries.set(key.join(), { key, groupKey });
  return mount(
    key,
    () =>
      call<Page<NotificationEvent>>("context.notifications.events", { groupKey, after, limit: 20 }),
    { staleTime: 60_000 },
  );
}

/** Match useReadNotifications: optimistic read state, error invalidation, server hints on success. */
export async function markNotificationsRead(world: World, group: NotificationGroup | null) {
  const org = world.organizationId;
  for (const { key, filter } of groupQueries.values()) {
    if (key[1] !== org) continue;
    // Mutate only loaded rows. A partial feed cannot prove the unread badge is clear.
    const page = cached<Page<NotificationGroup>>(key);
    for (const item of page?.items ?? []) {
      if (
        group &&
        (item.groupKey !== group.groupKey || !atOrBefore(item.newestCursor, group.newestCursor))
      )
        continue;
      item.unreadCount = 0;
      item.readAt ??= new Date().toISOString();
    }
    if (page && filter === "unread") page.items = page.items.filter((item) => item.unreadCount > 0);
  }
  for (const { key, groupKey } of eventQueries.values()) {
    if (key[1] !== org || (group && groupKey !== group.groupKey)) continue;
    for (const item of cached<Page<NotificationEvent>>(key)?.items ?? [])
      if (!group || atOrBefore(item.eventCursor, group.newestCursor))
        item.readAt ??= new Date().toISOString();
  }
  if (!group) {
    world.hasUnreadNotifications = false;
    const badge = cached<{ unread: boolean }>(keys.notificationUnread(org));
    if (badge) badge.unread = false;
  }
  const result = group
    ? await call("context.notifications.readGroup", {
        groupKey: group.groupKey,
        through: group.newestCursor,
      })
    : await call("context.notifications.readAll");
  if (!result) await invalidate([keys.notifications(org)], "mutation");
}

function atOrBefore(cursor: string, through: string) {
  const event: { at: string; id: string } = JSON.parse(cursor);
  const cutoff: { at: string; id: string } = JSON.parse(through);
  return event.at < cutoff.at || (event.at === cutoff.at && event.id <= cutoff.id);
}
