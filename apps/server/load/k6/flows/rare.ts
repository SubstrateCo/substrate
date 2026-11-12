import { config } from "../lib/config.ts";
import { trace } from "../lib/debug.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import {
  addMembers,
  createConversation,
  deleteConversation,
  isGeneral,
  joinConversation,
  leaveConversation,
  listed,
  removeMember,
  showAddMembers,
  showDeleteImpact,
} from "../lib/screens/conversations.ts";
import { openConversation, sendMessage, showMessaging } from "../lib/screens/messaging.ts";
import { messageBody, word } from "../lib/words.ts";
import type { Person, World } from "../lib/world.ts";
import type { FlowContext } from "./flow.ts";
import {
  administerOrganization,
  canAdminister,
  ownsConversation,
  transferOwnership,
  uploadAvatar,
} from "./rare-admin.ts";
import { canInvite, checkInvitations, inviteExternal, managePending } from "./rare-sharing.ts";
import {
  browseAttachments,
  browseSettings,
  changeProjectIcon,
  createProject,
  deleteOwnProject,
  ownProjects,
  revokeShare,
  shareProject,
  updateProject,
  uploadToMessage,
  uploadToTask,
} from "./rare-work.ts";

const backfill = config.mode === "backfill";

// What this VU did in its session, so it only undoes its own changes.
const created = new Set<string>();
const joined = new Set<string>();
const added: { conversationId: string; userId: string }[] = [];

const others = (world: World) => world.people.filter((person) => person.userId !== world.userId);

/** The people picker: type part of a name, pick the match; repeated for each person. */
async function pickPeople(candidates: Person[], count: number) {
  const picked: Person[] = [];
  const pool = [...candidates];
  for (let index = 0; index < count && pool.length; index++) {
    const person = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    await typeTime(person.name.slice(0, rng.int(2, 5)));
    await think("glance");
    picked.push(person);
  }
  return picked;
}

/** A new channel, group or DM from the sidebar's "+" menu; usually followed by a first message. */
async function startConversation(world: World) {
  await showMessaging(world);
  const people = others(world);
  const dmWith = new Set(
    listed(world)
      .filter((conversation) => conversation.kind === "dm")
      .flatMap((conversation) => conversation.members.map((member) => member.userId)),
  );
  const fresh = people.filter((person) => !dmWith.has(person.userId));
  const kind = rng.weighted(["channel", "group", "dm"] as const, (value) =>
    value === "dm" ? (fresh.length ? 2.5 : 0) : value === "channel" ? 4.5 : 3,
  )!;
  await think("decide");
  let name: string | undefined;
  if (kind === "channel" || (kind === "group" && rng.chance(0.5))) {
    name = kind === "channel" ? `${word()}-${word()}` : `${word()} ${word()}`;
    await typeTime(name);
  }
  const count = kind === "dm" ? 1 : kind === "group" ? rng.int(2, 4) : rng.int(1, 5);
  const recipients = await pickPeople(kind === "dm" ? fresh : people, count);
  if ((kind === "dm" && recipients.length !== 1) || (kind === "group" && recipients.length < 2))
    return;
  const isPrivate = kind === "channel" && rng.chance(0.3);
  await think("glance");
  const id = await createConversation(world, {
    kind,
    name,
    private: isPrivate,
    emails: recipients.map((person) => person.email),
  });
  if (!id) return;
  created.add(id);
  if (!rng.chance(0.8)) return;
  if (!backfill) {
    await showMessaging(world);
    await openConversation(world, id);
  }
  const body = messageBody();
  await think(body.length > 200 ? "composeLong" : "composeShort");
  await typeTime(body);
  await sendMessage(world, id, body);
}

/** The members dialog of a managed channel or group: add people, or rarely remove one added here. */
async function manageMembers(world: World) {
  await showMessaging(world);
  const managed = listed(world).filter(
    (conversation) =>
      conversation.joined &&
      conversation.canManage &&
      conversation.kind !== "dm" &&
      !isGeneral(conversation),
  );
  const conversation = rng.pick(managed);
  if (!conversation) return joinChannel(world);
  if (!backfill) {
    await openConversation(world, conversation.id);
    await think("glance");
    await readTime(Math.min(conversation.members.length, 10));
  }
  const ownAdds = added.filter((row) => row.conversationId === conversation.id);
  const removable = conversation.members.filter(
    (member) =>
      member.type === "human" &&
      ownAdds.some((row) => row.userId === member.userId) &&
      member.userId !== conversation.createdBy,
  );
  if (removable.length && rng.chance(0.25)) {
    const member = rng.pick(removable)!;
    await think("decide");
    if (await removeMember(world, conversation.id, member.actorId))
      added.splice(
        added.findIndex(
          (row) => row.userId === member.userId && row.conversationId === conversation.id,
        ),
        1,
      );
    return;
  }
  const members = new Set(conversation.members.map((member) => member.userId));
  await think("decide");
  await showAddMembers(world);
  const people = await pickPeople(
    others(world).filter((person) => !members.has(person.userId)),
    rng.int(1, 3),
  );
  if (!people.length) return;
  if (
    await addMembers(
      world,
      conversation.id,
      people.map((person) => person.email),
    )
  )
    for (const person of people)
      added.push({ conversationId: conversation.id, userId: person.userId });
}

/** Browses public channels it is not in (they are listed but not joined), joins one, reads it. */
async function joinChannel(world: World) {
  await showMessaging(world);
  const open = listed(world).filter(
    (conversation) =>
      conversation.kind === "channel" && !conversation.private && !conversation.joined,
  );
  const channel = rng.pick(open);
  if (!channel) return;
  if (!backfill) await readTime(open.length);
  await think("decide");
  if (!(await joinConversation(world, channel.id))) return;
  joined.add(channel.id);
  if (backfill) return;
  const { messages } = await openConversation(world, channel.id);
  await readTime(
    Math.min(messages.length, 10),
    messages.slice(-10).reduce((sum, row) => sum + row.body.length, 0),
  );
}

/** Leaves a channel it joined in this session; never general and never one it owns. */
async function leaveChannel(world: World) {
  await showMessaging(world);
  const channel = rng.pick(
    listed(world).filter(
      (conversation) =>
        conversation.joined &&
        joined.has(conversation.id) &&
        !isGeneral(conversation) &&
        conversation.createdBy !== world.userId,
    ),
  );
  if (!channel) return joinChannel(world);
  await openConversation(world, channel.id);
  await think("decide");
  if (await leaveConversation(world, channel.id)) joined.delete(channel.id);
}

/** Deletes a conversation it created in this session that is still nearly empty. */
async function deleteOwnConversation(world: World) {
  await showMessaging(world);
  const candidate = rng.pick(
    listed(world).filter((conversation) => created.has(conversation.id) && conversation.canManage),
  );
  if (!candidate) return;
  const { messages } = await openConversation(world, candidate.id);
  if (messages.length >= 5) return;
  await think("glance");
  const dialog = await showDeleteImpact(world, candidate.id);
  await think("decide");
  dialog.close();
  if (await deleteConversation(world, candidate.id)) created.delete(candidate.id);
}

type Step = {
  weight: number;
  backfill: number;
  run: (world: World) => Promise<unknown>;
  when?: (world: World) => boolean;
};

const steps: Step[] = [
  { weight: 14, backfill: 25, run: startConversation },
  { weight: 8, backfill: 0, run: manageMembers },
  { weight: 8, backfill: 0, run: joinChannel },
  { weight: 2, backfill: 0, run: leaveChannel, when: () => joined.size > 0 },
  { weight: 0.4, backfill: 0, run: deleteOwnConversation, when: () => created.size > 0 },
  { weight: 8, backfill: 15, run: createProject },
  { weight: 6, backfill: 0, run: updateProject },
  { weight: 6, backfill: 5, run: shareProject },
  { weight: 2, backfill: 0, run: revokeShare },
  { weight: 10, backfill: 20, run: uploadToTask },
  { weight: 8, backfill: 15, run: uploadToMessage },
  { weight: 8, backfill: 0, run: browseAttachments },
  { weight: 12, backfill: 10, run: inviteExternal, when: canInvite },
  { weight: 4, backfill: 0, run: managePending },
  { weight: 8, backfill: 0, run: browseSettings },
  { weight: 1, backfill: 0, run: deleteOwnProject, when: () => ownProjects.length > 0 },
  { weight: 2, backfill: 0, run: changeProjectIcon },
  // Only owners qualify (one per organization), so this stays rare.
  { weight: 6, backfill: 0, run: administerOrganization, when: canAdminister },
  { weight: 1, backfill: 0, run: transferOwnership, when: ownsConversation },
  { weight: 2, backfill: 0, run: uploadAvatar },
];

/**
 * Infrequent actions (weight 2; backfill 4). A visit starts by acting on new collaboration
 * invitations, then does one weighted step with its dialog, typing and confirm pauses. Backfill
 * keeps to steps that add data.
 */
export async function rare({ world }: FlowContext) {
  await checkInvitations(world);
  const step = rng.weighted(steps, (entry) =>
    entry.when && !entry.when(world) ? 0 : backfill ? entry.backfill : entry.weight,
  );
  if (!step) return;
  trace("step", step.run.name);
  await step.run(world);
}
