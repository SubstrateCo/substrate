import {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextTarget,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
} from "@startup-os/contracts/context/input";
import { createContextService, createFeedService } from "@startup-os/database/context";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import type { z } from "zod";

async function sessionServices(headers: Headers, organizationId: string) {
  const { session } = await workspaceSession(headers, organizationId);
  const scope = { organizationId, userId: session.user.id };
  return { context: createContextService(db, scope), feed: createFeedService(db, scope) };
}
export function getMessageLinks(headers: Headers, raw: z.input<typeof contextMessage>) {
  return serviceResult(async () => {
    const input = contextMessage.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    return context.messageLinks(input.messageId);
  });
}
export function getMessagePeople(headers: Headers, raw: z.input<typeof contextMessage>) {
  return serviceResult(async () => {
    const input = contextMessage.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    return context.messagePeople(input.messageId);
  });
}
export function getRelatedContext(headers: Headers, raw: z.input<typeof contextEntity>) {
  return serviceResult(async () => {
    const input = contextEntity.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    return context.related(input.entityId);
  });
}
export function getMessageTarget(headers: Headers, raw: z.input<typeof contextTarget>) {
  return serviceResult(async () => {
    const input = contextTarget.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    return context.messageTarget(input.conversationId, input.messageId);
  });
}
export function searchContext(headers: Headers, raw: z.input<typeof contextSearch>) {
  return serviceResult(async () => {
    const input = contextSearch.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    return context.search(input);
  });
}
export function createTaskFromMessage(headers: Headers, raw: z.input<typeof contextSourceTask>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = contextSourceTask.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    return context.createTaskFromMessage(input);
  });
}
export function attachWork(headers: Headers, raw: z.input<typeof contextLink>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = contextLink.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    await context.attach(input.messageId, input.entityId);
    return null;
  });
}
export function detachWork(headers: Headers, raw: z.input<typeof contextLink>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = contextLink.parse(raw);
    const { context } = await sessionServices(headers, input.organizationId);
    await context.detach(input.messageId, input.entityId);
    return null;
  });
}
export function getActivity(headers: Headers, raw: z.input<typeof contextEntity>) {
  return serviceResult(async () => {
    const input = contextEntity.parse(raw);
    const { feed } = await sessionServices(headers, input.organizationId);
    return feed.activity(input.entityId);
  });
}
export function getNotifications(headers: Headers, raw: z.input<typeof contextWorkspace>) {
  return serviceResult(async () => {
    const input = contextWorkspace.parse(raw);
    const { feed } = await sessionServices(headers, input.organizationId);
    return feed.list();
  });
}
export function markRead(headers: Headers, raw: z.input<typeof contextNotification>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = contextNotification.parse(raw);
    const { feed } = await sessionServices(headers, input.organizationId);
    await feed.markRead(input.id);
    return null;
  });
}
