import type {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextMessagePage,
  contextTarget,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
  contextNotificationPage,
} from "@startup-os/contracts/context/input";
import type {
  notificationGroupsInput,
  notificationGroupEventsInput,
  notificationGroupReadInput,
} from "@startup-os/contracts/context/notification-groups";
import { realtimeKeys } from "@startup-os/contracts/realtime";
import type { RealtimeHint } from "@startup-os/contracts/realtime";
import { createContextService, createFeedService } from "@startup-os/database/context";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
import type { z } from "zod";

async function sessionServices(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  const scope = { organizationId, userId: session.user.id };
  return {
    context: createContextService(db, scope),
    feed: createFeedService(db, scope),
    userId: session.user.id,
  };
}
export function getMessageLinks(headers: Headers, input: z.output<typeof contextMessage>) {
  return serviceResult(async () => {
    const { context } = await sessionServices(headers, input.organizationId);
    return context.messageLinks(input.messageId);
  });
}
export function getMessagePage(headers: Headers, input: z.output<typeof contextMessagePage>) {
  return serviceResult(async () => {
    const { context } = await sessionServices(headers, input.organizationId);
    return context.messagePage(input.messageIds);
  });
}
export function getMessagePeople(headers: Headers, input: z.output<typeof contextMessage>) {
  return serviceResult(async () => {
    const { context } = await sessionServices(headers, input.organizationId);
    return context.messagePeople(input.messageId);
  });
}
export function getRelatedContext(headers: Headers, input: z.output<typeof contextEntity>) {
  return serviceResult(async () => {
    const { context } = await sessionServices(headers, input.organizationId);
    return context.related(input.entityId);
  });
}
export function getMessageTarget(headers: Headers, input: z.output<typeof contextTarget>) {
  return serviceResult(async () => {
    const { context } = await sessionServices(headers, input.organizationId);
    return context.messageTarget(input.conversationId, input.messageId);
  });
}
export function searchContext(headers: Headers, input: z.output<typeof contextSearch>) {
  return serviceResult(async () => {
    const { context } = await sessionServices(headers, input.organizationId);
    return context.search(input);
  });
}
export function createTaskFromMessage(headers: Headers, input: z.output<typeof contextSourceTask>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { context } = await sessionServices(headers, input.organizationId);
    const task = await context.createTaskFromMessage(input);
    const hints: RealtimeHint[] = [
      { audience: realtimeKeys.organization(input.organizationId), domain: "tasks" },
      { audience: realtimeKeys.organization(input.organizationId), domain: "context" },
    ];
    if (input.assigneeActorEntityId)
      hints.push({
        audience: realtimeKeys.actor(input.organizationId, input.assigneeActorEntityId),
        domain: "notifications",
      });
    await publishRefresh(hints);
    return task;
  });
}
export function attachWork(headers: Headers, input: z.output<typeof contextLink>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { context } = await sessionServices(headers, input.organizationId);
    await context.attach(input.messageId, input.entityId);
    await publishRefresh([
      { audience: realtimeKeys.organization(input.organizationId), domain: "context" },
    ]);
    return null;
  });
}
export function detachWork(headers: Headers, input: z.output<typeof contextLink>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { context } = await sessionServices(headers, input.organizationId);
    await context.detach(input.messageId, input.entityId);
    await publishRefresh([
      { audience: realtimeKeys.organization(input.organizationId), domain: "context" },
    ]);
    return null;
  });
}
export function getActivity(headers: Headers, input: z.output<typeof contextEntity>) {
  return serviceResult(async () => {
    const { feed } = await sessionServices(headers, input.organizationId);
    return feed.activity(input.entityId);
  });
}
export function getNotifications(headers: Headers, input: z.output<typeof contextWorkspace>) {
  return serviceResult(async () => {
    const { feed } = await sessionServices(headers, input.organizationId);
    return feed.list();
  });
}
export function getNotificationGroups(
  headers: Headers,
  input: z.output<typeof notificationGroupsInput>,
) {
  return serviceResult(async () => {
    const { feed } = await sessionServices(headers, input.organizationId);
    return feed.groups(input);
  });
}
export function getNotificationGroupEvents(
  headers: Headers,
  input: z.output<typeof notificationGroupEventsInput>,
) {
  return serviceResult(async () => {
    const { feed } = await sessionServices(headers, input.organizationId);
    return feed.groupEvents(input);
  });
}
export function getNotificationUnread(headers: Headers, input: z.output<typeof contextWorkspace>) {
  return serviceResult(async () => {
    const { feed } = await sessionServices(headers, input.organizationId);
    return { unread: await feed.hasUnread() };
  });
}
export function markNotificationGroupRead(
  headers: Headers,
  input: z.output<typeof notificationGroupReadInput>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { feed, userId } = await sessionServices(headers, input.organizationId);
    await feed.markGroupRead(input);
    await publishRefresh([{ audience: realtimeKeys.user(userId), domain: "notifications" }]);
    return null;
  });
}
export function getNotificationPage(
  headers: Headers,
  input: z.output<typeof contextNotificationPage>,
) {
  return serviceResult(async () => {
    const { feed } = await sessionServices(headers, input.organizationId);
    const rows = await feed.list(input.after, {
      limit: input.limit + 1,
      unread: input.filter === "unread",
    });
    const items = rows.slice(0, input.limit);
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null };
  });
}
export function markRead(headers: Headers, input: z.output<typeof contextNotification>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { feed, userId } = await sessionServices(headers, input.organizationId);
    await feed.markRead(input.id);
    await publishRefresh([{ audience: realtimeKeys.user(userId), domain: "notifications" }]);
    return null;
  });
}
export function markAllRead(headers: Headers, input: z.output<typeof contextWorkspace>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const { feed, userId } = await sessionServices(headers, input.organizationId);
    await feed.markAllRead();
    await publishRefresh([{ audience: realtimeKeys.user(userId), domain: "notifications" }]);
    return null;
  });
}
