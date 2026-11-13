import { cached, invalidate } from "../lib/client-cache.ts";
import { config } from "../lib/config.ts";
import { organizations, users } from "../lib/data.ts";
import { call } from "../lib/http.ts";
import { keys } from "../lib/keys.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import { createConversation, isGeneral, listed } from "../lib/screens/conversations.ts";
import type { FullOrganization } from "../lib/screens/frame.ts";
import { openConversation, showMessaging } from "../lib/screens/messaging.ts";
import { changeAvatar } from "../lib/screens/pictures.ts";
import { showSettings } from "../lib/screens/settings.ts";
import { word } from "../lib/words.ts";
import type { World } from "../lib/world.ts";
import { coverageChannel, coverageHelpers } from "./coverage-fixtures.ts";
import { isOwner } from "./rare-sharing.ts";

const coverage = config.mode === "coverage";
const helpers = coverage ? coverageHelpers([...users], config.vus) : [];
const helperPeer = (userId: string | null) =>
  !coverage || helpers.some((helper) => helper.userId === userId);

/**
 * Organization administration, conversation ownership and the profile picture in the rare flow.
 * Admin changes undo themselves within the same visit, so other VUs keep their organization,
 * roles and names. Members are never removed.
 */

/**
 * queries/organizations/mutations.ts: names and roles show in the switcher and the frame. The
 * detail prefix also covers the frame's summary and the people pickers.
 */
const refreshOrganization = (world: World) =>
  invalidate([keys.organizations, keys.organizationDetail(world.organizationId)], "mutation");

/** Renames the organization to fix a "typo", then sets the name back. */
async function renameOrganization(world: World) {
  const name = organizations.find((org) => org.id === world.organizationId)?.name;
  if (!name) return;
  await showSettings(world, "organization");
  await think("decide");
  for (const next of [`${name} ${word()}`, name]) {
    await typeTime(next.slice(name.length) || name.slice(-4));
    const saved = await call("auth.updateOrganization", {
      organizationId: world.organizationId,
      data: { name: next },
    });
    if (!saved) return;
    await refreshOrganization(world);
    await think("glance");
  }
}

/** Invites an address from the invitations page, then cancels it as a mistake. */
async function inviteAndCancel(world: World) {
  const org = world.organizationId;
  await showSettings(world, "invitations");
  await think("decide");
  const email = `invitee-${crypto.randomUUID().slice(0, 8)}@load.test`;
  await typeTime(email);
  const invitation = await call<{ id: string }>("auth.inviteMember", {
    organizationId: org,
    email,
    role: "member",
    resend: false,
  });
  if (!invitation?.id) return;
  await invalidate([keys.organizationInvitations(org)], "mutation");
  await showSettings(world, "invitations");
  await think("decide");
  if (await call("auth.cancelInvitation", { invitationId: invitation.id }))
    await invalidate([keys.organizationInvitations(org)], "mutation");
}

/** Makes a member an admin from the members page, then changes the role back. */
async function changeRoleAndBack(world: World) {
  const rows = await showSettings(world, "members");
  await readTime(Math.min(rows, 20));
  // The members page lists the full organization, which holds member IDs and roles.
  const detail = cached<FullOrganization>(keys.organizationDetail(world.organizationId));
  const member = rng.pick(
    (detail?.members ?? []).filter(
      (row) => row.userId !== world.userId && row.role === "member" && helperPeer(row.userId),
    ),
  );
  if (!member) return;
  await think("decide");
  for (const role of ["admin", "member"]) {
    const changed = await call("auth.updateMemberRole", {
      organizationId: world.organizationId,
      memberId: member.id,
      role,
    });
    if (!changed) return;
    await refreshOrganization(world);
    await think("glance");
  }
}

export const canAdminister = isOwner;

/** One owner task in organization settings. */
export async function administerOrganization(world: World) {
  await think("navigate");
  if (config.mode === "coverage") {
    await renameOrganization(world);
    await inviteAndCancel(world);
    await changeRoleAndBack(world);
    return;
  }
  const task = rng.weighted(
    [
      { weight: 2, run: renameOrganization },
      { weight: 4, run: inviteAndCancel },
      { weight: 3, run: changeRoleAndBack },
    ],
    (entry) => entry.weight,
  )!;
  await task.run(world);
}

/** Hands a channel or group it owns to another member (conversation actions, "Transfer"). */
export async function transferOwnership(world: World) {
  await showMessaging(world);
  const helper = coverage
    ? rng.pick(
        world.people.filter(
          (person) =>
            person.userId !== world.userId &&
            helperPeer(person.userId) &&
            helpers.some(
              (candidate) =>
                candidate.userId === person.userId &&
                candidate.organizationId === world.organizationId,
            ),
        ),
      )
    : undefined;
  if (coverage && !helper)
    throw new Error("Coverage ownership transfer requires an inactive organization helper");
  const fixtureId = helper
    ? await createConversation(
        world,
        coverageChannel(`coverage-transfer-${word()}-${word()}`, [helper.email]),
      )
    : undefined;
  if (coverage && !fixtureId)
    throw new Error("Coverage ownership transfer requires its own private channel");
  const conversation = coverage
    ? undefined
    : rng.pick(
        listed(world).filter(
          (row) =>
            row.joined && row.kind !== "dm" && row.createdBy === world.userId && !isGeneral(row),
        ),
      );
  const member =
    helper ??
    (conversation &&
      rng.pick(
        conversation.members.filter(
          (row) =>
            row.type === "human" &&
            row.userId &&
            row.userId !== world.userId &&
            helperPeer(row.userId),
        ),
      ));
  const conversationId = fixtureId ?? conversation?.id;
  if (!conversationId || !member?.userId) return;
  await openConversation(world, conversationId);
  await think("decide");
  await typeTime(member.name.slice(0, rng.int(2, 5)));
  await think("decide");
  if (
    await call("messaging.conversations.owner", {
      conversationId,
      userId: member.userId,
    })
  )
    await invalidate([keys.conversations(world.organizationId)], "mutation");
}

export const ownsConversation = (world: World) =>
  listed(world).some(
    (row) => row.joined && row.kind !== "dm" && row.createdBy === world.userId && !isGeneral(row),
  );

/** Picks a new profile picture in Settings > Profile. */
export async function uploadAvatar(world: World) {
  await showSettings(world, "profile");
  await think("decide");
  // The system file dialog.
  await think("decide");
  await changeAvatar(world);
  await think("glance");
}
