import type { LoadUser } from "../../types.ts";
import { cached } from "../lib/client-cache.ts";
import { config } from "../lib/config.ts";
import { organizations, userOf } from "../lib/data.ts";
import { trace } from "../lib/debug.ts";
import { keys } from "../lib/keys.ts";
import { unreadSharingInvitations } from "../lib/mail.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import { isGeneral, listed, type ListedConversation } from "../lib/screens/conversations.ts";
import { openConversation, sendMessage, showMessaging } from "../lib/screens/messaging.ts";
import {
  accept,
  closeInvitation,
  decline,
  disconnect,
  invite,
  openInvitation,
  openSharingManager,
  removeExternal,
  resend,
  revoke,
  showSharingSettings,
  type Invitation,
} from "../lib/screens/sharing.ts";
import { messageBody } from "../lib/words.ts";
import type { World } from "../lib/world.ts";

/**
 * External collaboration in the rare flow. Owners and admins share channels; the partner's
 * owner or admin approves. Group owners invite single people, who accept themselves. Invitees
 * learn of an invitation from its email and open the accept screen from the link.
 */

const backfill = config.mode === "backfill";

/** Users that some VU of this run signs in as, so an invitation reaches a live person. */
const liveUsers: LoadUser[] = (() => {
  const byEmail = new Map<string, LoadUser>();
  for (let vu = 1; vu <= config.vus; vu++) {
    const user = userOf(vu);
    byEmail.set(user.email, user);
  }
  return [...byEmail.values()];
})();

export const isOwner = (world: World) =>
  organizations.find((org) => org.id === world.organizationId)?.ownerEmail === world.user.email;

// Conversations this VU invited partners to, for resend and revoke.
const invitedTo = new Set<string>();
let invitesSent = 0;

function shareable(world: World) {
  return listed(world).filter(
    (conversation) =>
      conversation.joined &&
      conversation.canShare &&
      conversation.kind !== "dm" &&
      !isGeneral(conversation),
  );
}

export const canInvite = (world: World) => invitesSent < 3 && shareable(world).length > 0;

/** Opens a conversation, then its actions menu and "External collaboration". */
async function openManager(world: World, conversation: ListedConversation) {
  if (!backfill) {
    await showMessaging(world);
    await openConversation(world, conversation.id);
    await think("glance");
  }
  const manager = await openSharingManager(world, conversation.id);
  if (!backfill && manager.details)
    await readTime(manager.details.invitations.length + manager.details.participants.length + 1);
  return manager;
}

/** Invites a person of another organization by email, with the history checkbox ticked. */
export async function inviteExternal(world: World) {
  const conversation = rng.pick(shareable(world));
  if (!conversation) return;
  const members = new Set(conversation.members.map((member) => member.userId));
  const manager = await openManager(world, conversation);
  const pending = new Set(
    (manager.details?.invitations ?? [])
      .filter((row) => row.status === "pending")
      .map((row) => row.email),
  );
  const invitee = rng.pick(
    liveUsers.filter(
      (user) =>
        user.organizationId !== world.organizationId &&
        !members.has(user.userId) &&
        !pending.has(user.email),
    ),
  );
  if (!invitee || !manager.details) return manager.close();
  await think("decide");
  await typeTime(invitee.email);
  await think("glance");
  const sent = await invite(conversation.id, invitee.email);
  if (sent) {
    invitesSent++;
    invitedTo.add(conversation.id);
    trace("sharing", `invited ${invitee.email} to ${conversation.kind} ${conversation.id}`);
  }
  if (!backfill) await think("glance");
  manager.close();
}

/** The inviter resends or revokes a pending invitation; rarely ends a partner's access. */
export async function managePending(world: World) {
  const org = world.organizationId;
  const candidates = shareable(world).filter(
    (conversation) => invitedTo.has(conversation.id) || conversation.partner,
  );
  const conversation = rng.pick(candidates);
  if (!conversation) return;
  const manager = await openManager(world, conversation);
  const details = manager.details;
  if (!details) return manager.close();
  const pending = details.invitations.filter(
    (row) => row.status === "pending" && row.senderOrganizationId === org,
  );
  const invitation = rng.pick(pending);
  await think("decide");
  if (invitation) {
    if (rng.chance(0.5)) await resend(invitation.id);
    else await revoke(invitation.id);
  } else if (details.host && rng.chance(0.3)) {
    // Destructive: a person or a whole partner loses access. Kept rare.
    const external = rng.pick(details.participants.filter((row) => row.organizationId !== org));
    const connection = rng.pick(details.connections.filter((row) => !row.disconnectedAt));
    if (external && rng.chance(0.7)) await removeExternal(world, conversation.id, external.actorId);
    else if (connection) await disconnect(conversation.id, connection.organizationId);
  }
  manager.close();
}

async function verifyListed(world: World, conversationId: string) {
  await showMessaging(world);
  const shared = listed(world).find((conversation) => conversation.id === conversationId);
  trace(
    "sharing",
    `accepted ${conversationId}: listed=${!!shared} joined=${shared?.joined ?? false}`,
  );
  return shared;
}

/** Reviews one invitation on the accept screen: mostly accepts, sometimes declines. */
async function review(world: World, invitationId: string, owner: boolean) {
  const invitation = await openInvitation(invitationId);
  const available =
    invitation?.status === "pending" &&
    Date.parse(invitation.expiresAt) > Date.now() &&
    invitation.hostOrganizationId !== world.organizationId &&
    // A member's request waits for an owner or admin; only they act on it again.
    (owner || !invitation.approvalRequested);
  if (!available) return closeInvitation(invitationId);
  if (!backfill) await readTime(2, 240);
  await think("decide");
  if (rng.chance(0.15)) {
    await decline(invitationId);
    trace("sharing", `declined ${invitationId}`);
    return closeInvitation(invitationId);
  }
  await think("glance");
  // Hints refresh the open screen; a revoked or resent invitation shows as unavailable.
  const shown = cached<Invitation>(keys.sharingInvitation(invitationId));
  if (shown && shown.status !== "pending") return closeInvitation(invitationId);
  const result = await accept(world, invitationId);
  closeInvitation(invitationId);
  trace("sharing", `accept ${invitationId}: ${result?.status ?? "failed"}`);
  if (result?.status !== "accepted" || !result.conversationId) return;
  const shared = await verifyListed(world, result.conversationId);
  if (!shared || backfill || !rng.chance(0.5)) return;
  // Saying hello in the new shared conversation.
  await openConversation(world, shared.id);
  await readTime(5, 600);
  const body = messageBody();
  await think("composeShort");
  await typeTime(body);
  await sendMessage(world, shared.id, body);
}

/**
 * Starts each rare visit: new invitation emails open the accept screen; owners also look at
 * Settings > External collaboration now and then for approval requests.
 */
export async function checkInvitations(world: World) {
  const ids = await unreadSharingInvitations(world.user.email);
  const owner = isOwner(world);
  const settings = owner && (backfill || rng.chance(0.4));
  if (settings) {
    const { inbox } = await showSharingSettings(world);
    if (!backfill) await readTime(inbox.length + 1);
    for (const item of inbox) if (!ids.includes(item.id)) ids.push(item.id);
  }
  if ((ids.length || settings) && !backfill) await think("navigate");
  for (const id of ids.slice(0, 3)) await review(world, id, owner);
}
