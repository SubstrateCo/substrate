import { invalidate, mount, removeInactive, settleInactive, unmount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import type { Conversation, World } from "../world.ts";
import { mountPeople } from "./frame.ts";
import { closeConversation, openConversation, openThread } from "./messaging.ts";

/**
 * Conversation dialogs (components/messaging/conversations/...): create, add or remove members,
 * join, leave, delete. Each write invalidates what its web mutation invalidates
 * (queries/messaging/conversations.ts, management.ts, mutations.ts).
 */

/** Fields of a listed conversation that the dialogs read; the world type keeps only the shared ones. */
export type ListedConversation = Conversation & {
  organizationId: string;
  createdBy: string;
  canManage: boolean;
  canShare: boolean;
  partner: boolean;
};

// SAFETY: messaging.conversations returns these fields; World stores only their common subset.
export const listed = (world: World) => world.conversations as ListedConversation[];

/** The org-wide channel everyone is in. It is never left, removed from, or deleted. */
export const isGeneral = (conversation: Conversation) =>
  conversation.kind === "channel" && conversation.name === "general";

const searches = (org: string) =>
  [keys.search(org), keys.searchPages(org)].map((prefix) => ({ prefix, staleOnly: true as const }));

/** Creates a channel, group or DM (create-conversation-dialog.tsx). Resolves its ID. */
export async function createConversation(
  world: World,
  input: { kind: "dm" | "group" | "channel"; name?: string; private?: boolean; emails: string[] },
) {
  const org = world.organizationId;
  const created = await call<{ id: string }>("messaging.conversations.create", {
    ...input,
    private: input.kind !== "channel" || input.private,
  });
  if (!created) return null;
  await invalidate(
    input.kind === "dm"
      ? [keys.conversations(org), keys.messagingProfiles(org)]
      : [keys.conversations(org)],
    "mutation",
  );
  return created.id;
}

/**
 * Opens the add-members dialog (add-members-dialog.tsx), which mounts the workspace people. The
 * messages screen holds the same query, so the dialog closing leaves it mounted.
 */
export const showAddMembers = (world: World) => mountPeople(world);

/** Adds people from the workspace (add-members-dialog.tsx). */
export async function addMembers(world: World, conversationId: string, emails: string[]) {
  const org = world.organizationId;
  const result = await call("messaging.members.add", {
    conversationId,
    emails,
    shareHistory: true,
  });
  if (result)
    await invalidate(
      [keys.conversations(org), keys.conversationMessages(org, conversationId)],
      "mutation",
    );
  return !!result;
}

export async function removeMember(world: World, conversationId: string, actorId: string) {
  const org = world.organizationId;
  const result = await call("messaging.members.remove", { conversationId, actorId });
  if (result) await invalidate([keys.conversations(org), keys.context(org)], "mutation");
  return !!result;
}

export async function joinConversation(world: World, conversationId: string) {
  const result = await call("messaging.conversations.join", { conversationId });
  if (result) await invalidate([keys.conversations(world.organizationId)], "mutation");
  return !!result;
}

/** invalidateRemovedConversation: the conversation's pages are dropped, lists refresh. */
async function removed(world: World, conversationId: string) {
  const org = world.organizationId;
  world.messages.delete(conversationId);
  world.contextIds.delete(conversationId);
  await invalidate(
    [
      keys.conversations(org),
      keys.related(org),
      keys.activity(org),
      keys.notifications(org),
      ...searches(org),
    ],
    "mutation",
  );
}

export async function leaveConversation(world: World, conversationId: string) {
  return removeConversation(world, conversationId, "messaging.conversations.leave");
}

/** The delete dialog (conversation-actions.tsx) shows the linked-work count first. */
export async function showDeleteImpact(world: World, conversationId: string) {
  const key = keys.deleteImpact(world.organizationId, conversationId);
  const impact = await mount(key, () =>
    call<{ linkedWork: number }>("messaging.conversations.deleteImpact", { conversationId }),
  );
  return { impact, close: () => unmount(key) };
}

export async function deleteConversation(world: World, conversationId: string) {
  return removeConversation(world, conversationId, "messaging.conversations.delete");
}

async function removeConversation(
  world: World,
  conversationId: string,
  endpoint: "messaging.conversations.leave" | "messaging.conversations.delete",
) {
  const previous = { ...world.screen };
  // Leave the route before committing. k6 cannot abort detached HTTP reads, so drain them.
  const prefixes = closeConversation(world, conversationId);
  await settleInactive(prefixes);
  const result = await call(endpoint, { conversationId });
  if (result) {
    removeInactive(prefixes);
    await removed(world, conversationId);
  } else if (previous.conversationId === conversationId) {
    await openConversation(world, conversationId);
    if (previous.threadId) await openThread(world, previous.threadId);
  }
  return !!result;
}
