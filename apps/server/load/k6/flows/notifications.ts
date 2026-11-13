import { unmount } from "../lib/client-cache.ts";
import { config } from "../lib/config.ts";
import { keys } from "../lib/keys.ts";
import { readTime, think } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import { openMessageLink } from "../lib/screens/message-link.ts";
import {
  expandGroup,
  markNotificationsRead,
  showNotifications,
  type NotificationEvent,
  type NotificationFilter,
} from "../lib/screens/notifications.ts";
import { openProject, openTask, showTasks } from "../lib/screens/tasks.ts";
import type { World } from "../lib/world.ts";
import { FlowSkipped, type FlowContext } from "./flow.ts";
import { Counter } from "k6/metrics";

const steps = new Counter("notification_steps");

async function openSource(world: World, item: NotificationEvent) {
  if (item.conversationId && item.messageId) {
    const messages = await openMessageLink(world, item.conversationId, item.messageId);
    await readTime(
      Math.min(8, messages.length),
      messages.slice(-8).reduce((sum, row) => sum + row.body.length, 0),
    );
  } else if (item.projectEntityId && item.entityId) {
    await showTasks(world);
    await openProject(world, item.projectEntityId);
    await openTask(world, item.projectEntityId, item.entityId);
    await think("read");
  }
}

export async function notifications({ world }: FlowContext) {
  // Most checks follow a lit badge; an occasional visit checks old activity without one.
  if (config.mode !== "coverage" && !world.hasUnreadNotifications && !rng.chance(0.3)) {
    steps.add(1, { step: "badge_only" });
    await think("glance");
    throw new FlowSkipped("Notification badge only; feed not opened");
  }
  await think("navigate");
  let filter: NotificationFilter = "all";
  let page = await showNotifications(world);
  steps.add(1, { step: page?.items.length ? "list" : "empty" });
  await readTime(page?.items.length ?? 0);
  if (!page?.items.length) throw new FlowSkipped("No notification groups");
  if (config.mode !== "coverage" && rng.chance(0.22)) {
    await think("decide");
    filter = "unread";
    steps.add(1, { step: "filter_unread" });
    page = await showNotifications(world, filter);
    await readTime(page?.items.length ?? 0);
  }
  if (!page?.items.length) throw new FlowSkipped("No notification groups after filtering");
  if (page.nextCursor && rng.chance(0.2)) {
    await think("decide");
    steps.add(1, { step: "page" });
    page = await showNotifications(world, filter, page.nextCursor);
    await readTime(page?.items.length ?? 0);
  }
  const groups = page?.items ?? [];
  if (!groups.length) throw new FlowSkipped("No notification groups on selected page");
  if (world.hasUnreadNotifications && rng.chance(0.06)) {
    await think("decide");
    steps.add(1, { step: "read_all" });
    await markNotificationsRead(world, null);
  }
  for (const group of groups.slice(0, rng.int(1, 3))) {
    let source: NotificationEvent = group;
    if (rng.chance(group.count > 1 ? 0.55 : 0.25)) {
      await think("glance");
      steps.add(1, { step: "expand" });
      let events = await expandGroup(world, group.groupKey);
      await readTime(events?.items.length ?? 0);
      if (events?.nextCursor && rng.chance(0.15)) {
        await think("decide");
        steps.add(1, { step: "events_page" });
        events = await expandGroup(world, group.groupKey, events.nextCursor);
        await readTime(events?.items.length ?? 0);
      }
      source = rng.pick(events?.items ?? []) ?? group;
    }
    const open = rng.chance(0.65);
    if (group.unreadCount > 0 && (open || rng.chance(0.55))) {
      await think("decide");
      steps.add(1, { step: "read_group" });
      await markNotificationsRead(world, group);
    }
    if (open) {
      await think("navigate");
      steps.add(1, { step: source.conversationId ? "open_message" : "open_task" });
      await openSource(world, source);
      return;
    }
    unmount(keys.notificationEvents(world.organizationId, group.groupKey));
    await think("between");
  }
}
