import { createContextService, createFeedService } from "@startup-os/database/context";
import type { z } from "zod";
import { auth } from "./server";
import { db } from "./database";
import { authEnvironment } from "./environment";
import { requireMessagingOrigin, requireMessagingWorkspace } from "./messaging-policy";
import {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextTarget,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
} from "./context-contract";

const { baseURL } = authEnvironment();
async function sessionServices(headers: Headers, organizationId: string) {
  const session = await auth.api.getSession({ headers });
  if (!session?.user.emailVerified) throw new Error("Sign in with a verified account to continue.");
  requireMessagingWorkspace(organizationId, session.session.activeOrganizationId);
  await auth.api.getActiveMemberRole({ headers, query: { organizationId } });
  const scope = { organizationId, userId: session.user.id };
  return { context: createContextService(db, scope), feed: createFeedService(db, scope) };
}
async function execute<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && error.name === "AccessDeniedError")
      throw new Error("Item not found or access denied.");
    if (error instanceof Error && ["ValidationError", "ConflictError"].includes(error.name))
      throw new Error(error.message);
    console.error(
      "Workspace context operation failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    throw new Error("Workspace context is unavailable. Please try again.");
  }
}
export async function readMessageLinks(headers: Headers, raw: z.input<typeof contextMessage>) {
  const input = contextMessage.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.messageLinks(input.messageId));
}
export async function readMessagePeople(headers: Headers, raw: z.input<typeof contextMessage>) {
  const input = contextMessage.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.messagePeople(input.messageId));
}
export async function readRelatedContext(headers: Headers, raw: z.input<typeof contextEntity>) {
  const input = contextEntity.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.related(input.entityId));
}
export async function readMessageTarget(headers: Headers, raw: z.input<typeof contextTarget>) {
  const input = contextTarget.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.messageTarget(input.conversationId, input.messageId));
}
export async function searchWorkspace(headers: Headers, raw: z.input<typeof contextSearch>) {
  const input = contextSearch.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.search(input));
}
export async function createSourceTask(headers: Headers, raw: z.input<typeof contextSourceTask>) {
  requireMessagingOrigin(headers.get("origin"), baseURL);
  const input = contextSourceTask.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.createTaskFromMessage(input));
}
export async function attachMessageWork(headers: Headers, raw: z.input<typeof contextLink>) {
  requireMessagingOrigin(headers.get("origin"), baseURL);
  const input = contextLink.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.attach(input.messageId, input.entityId));
}
export async function detachMessageWork(headers: Headers, raw: z.input<typeof contextLink>) {
  requireMessagingOrigin(headers.get("origin"), baseURL);
  const input = contextLink.parse(raw);
  const { context } = await sessionServices(headers, input.organizationId);
  return execute(() => context.detach(input.messageId, input.entityId));
}
export async function readActivity(headers: Headers, raw: z.input<typeof contextEntity>) {
  const input = contextEntity.parse(raw);
  const { feed } = await sessionServices(headers, input.organizationId);
  return execute(() => feed.activity(input.entityId));
}
export async function readNotifications(headers: Headers, raw: z.input<typeof contextWorkspace>) {
  const input = contextWorkspace.parse(raw);
  const { feed } = await sessionServices(headers, input.organizationId);
  return execute(() => feed.list());
}
export async function markNotificationRead(
  headers: Headers,
  raw: z.input<typeof contextNotification>,
) {
  requireMessagingOrigin(headers.get("origin"), baseURL);
  const input = contextNotification.parse(raw);
  const { feed } = await sessionServices(headers, input.organizationId);
  return execute(() => feed.markRead(input.id));
}
