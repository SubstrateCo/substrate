import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { invalidate, mount, navigate, unmount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import type { World } from "../world.ts";

/**
 * External collaboration (components/messaging/sharing/...): the sharing manager of one
 * conversation, the organization's sharing settings (owners and admins), and the accept screen
 * that the invitation email opens. Most writes send an access hint that resets private data, so
 * the web invalidates nothing itself (sharing-mutations.ts); remove is the exception.
 */

export interface SharingDetails {
  host: boolean;
  kind: ConversationKind;
  connections: { organizationId: string; disconnectedAt: string | null }[];
  invitations: { id: string; email: string; status: string; senderOrganizationId: string }[];
  participants: { actorId: string; organizationId: string }[];
}

export interface InboxItem {
  id: string;
  conversationId: string;
  email: string;
  purpose: "organization" | "person";
  name: string | null;
}

export interface Invitation {
  id: string;
  status: string;
  purpose: "organization" | "person";
  expiresAt: string;
  hostOrganizationId: string;
  targetOrganizationId: string | null;
  approvalRequested: boolean;
}

export interface AcceptResult {
  status: "accepted" | "approval-required";
  organizationId: string;
  conversationId: string | null;
}

/** Opens "External collaboration" from a conversation's actions (sharing-manager.tsx). */
export async function openSharingManager(world: World, conversationId: string) {
  const key = keys.conversationSharing(world.organizationId, conversationId);
  const details = await mount(key, () =>
    call<SharingDetails>("messaging.sharing.details", { conversationId }),
  );
  return { details, close: () => unmount(key) };
}

export const invite = (conversationId: string, email: string) =>
  call<{ id: string }>("messaging.sharing.invite", { conversationId, email, shareHistory: true });

export const revoke = (invitationId: string) => call("messaging.sharing.revoke", { invitationId });
export const resend = (invitationId: string) =>
  call<{ id: string }>("messaging.sharing.resend", { invitationId });
export const disconnect = (conversationId: string, partnerOrganizationId: string) =>
  call("messaging.sharing.disconnect", { conversationId, partnerOrganizationId });

export async function removeExternal(world: World, conversationId: string, actorId: string) {
  const result = await call("messaging.sharing.remove", { conversationId, actorId });
  if (result)
    await invalidate(
      [keys.organization(world.organizationId), ["sharing-invitations"]],
      "mutation",
    );
  return !!result;
}

/** Settings > External collaboration (sharing-settings.tsx): shared conversations and requests. */
export async function showSharingSettings(world: World) {
  navigate("settings");
  const org = world.organizationId;
  const [conversations, inbox] = await Promise.all([
    mount(keys.conversationSharing(org), () =>
      call<{ id: string; kind: string; hostOrganizationId: string }[]>(
        "messaging.sharing.conversations",
      ),
    ),
    mount(keys.sharingInbox(org), () => call<InboxItem[]>("messaging.sharing.inbox")),
  ]);
  return { conversations: conversations ?? [], inbox: inbox ?? [] };
}

/** The accept screen (accept-sharing-screen.tsx): the invitation and the person's organizations. */
export async function openInvitation(invitationId: string) {
  const [invitation] = await Promise.all([
    mount(keys.sharingInvitation(invitationId), () =>
      call<Invitation>("messaging.sharing.invitation", { invitationId }),
    ),
    mount(keys.organizations, () => call("auth.organizations")),
  ]);
  return invitation;
}

export function closeInvitation(invitationId: string) {
  unmount(keys.sharingInvitation(invitationId));
  unmount(keys.organizations);
}

/**
 * Accepts into the person's own organization. On "accepted" the screen activates that
 * organization and returns to the workspace, where the access hint refreshes the lists.
 */
export async function accept(world: World, invitationId: string) {
  const result = await call<AcceptResult>("messaging.sharing.accept", {
    invitationId,
    organizationId: world.organizationId,
    shareHistory: true,
  });
  if (result?.status === "accepted") {
    await call("auth.setActive", { organizationId: world.organizationId });
    await invalidate([keys.conversations(world.organizationId)], "mutation");
  }
  return result;
}

export const decline = (invitationId: string) =>
  call("messaging.sharing.decline", { invitationId });
