import type { TurnContext } from "@substrate/contracts/harness/mcp";
import type { McpInput } from "@substrate/contracts/harness/tools";

import { permissionActorEntityId } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { messageEntityReferences } from "../context/schema";
import { ownedArchives } from "../meetings/archive";
import { displayedMeeting } from "../meetings/reads";
import { meetingsRepository } from "../meetings/repository";
import { meetings, meetingOriginals } from "../meetings/schema";
import { sourceMessageOf } from "../meetings/source-message";
import { requireMessage } from "../messaging/access";
import { directMessageKey } from "../messaging/conversations/direct-messages";
import { messagingConversations, messagingParticipants } from "../messaging/schema";
import { referenceChangeHints } from "../realtime/routing";
import { pagination } from "./pagination";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

type Identity = SessionIdentity & { actorEntityId: string };

/** Private archive tools only execute in the live owner/agent DM, including its threads. */
export async function requireMeetingTurn(
  ctx: RepositoryContext,
  identity: Identity,
  turn: TurnContext,
) {
  const sharedTurn =
    turn.invocationIds?.length ||
    (turn.destination && turn.destination.conversationId !== turn.origin?.conversationId);
  if (turn.kind !== "interactive" || !turn.origin || sharedTurn) throw new AccessDeniedError();
  const [actor] = await ctx.db
    .select({
      owner: sql<string>`${permissionActorEntityId(ctx.scope)}`,
      agentId: actors.userAgentId,
    })
    .from(actors)
    .where(eq(actors.entityId, identity.actorEntityId));
  if (!actor?.agentId || !actor.owner) throw new AccessDeniedError();
  const [dm] = await ctx.db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .innerJoin(
      messagingParticipants,
      eq(messagingParticipants.conversationId, messagingConversations.id),
    )
    .where(
      and(
        eq(messagingConversations.id, turn.origin.conversationId),
        eq(messagingConversations.organizationId, identity.organizationId),
        eq(messagingConversations.kind, "dm"),
        eq(
          messagingConversations.dmKey,
          directMessageKey(identity.organizationId, [actor.owner, identity.actorEntityId]),
        ),
        eq(messagingParticipants.actorEntityId, identity.actorEntityId),
        isNull(messagingParticipants.leftAt),
      ),
    );
  if (!dm) throw new AccessDeniedError();
  return actor.agentId;
}

export function mcpMeetingTools(ctx: RepositoryContext, identity: Identity, turn: TurnContext) {
  const repo = meetingsRepository(ctx);
  const scope = (id: string) =>
    and(
      eq(meetings.id, id),
      inArray(meetings.archiveId, ownedArchives(ctx)),
      ctx.readable(meetings.id),
    );
  async function sourceMessage(id: string) {
    const { message, conversation } = await requireMessage(ctx.db, identity, id);
    if (
      message.deletedAt ||
      conversation.id !== turn.origin?.conversationId ||
      conversation.organizationId !== identity.organizationId
    )
      throw new AccessDeniedError();
    return message;
  }
  return {
    sourceMessage,
    async list(input: McpInput<"list_meetings">) {
      const p = pagination(ctx.scope, "list_meetings", input);
      const { rows } = await repo.list(
        { ...input, sort: "date", dir: "desc", offset: p.offset },
        p.take,
      );
      return p.page(rows);
    },
    async get({ meetingId, timeZone }: McpInput<"get_meeting">) {
      const [meeting] = await ctx.db
        .select(displayedMeeting(timeZone))
        .from(meetings)
        .where(scope(meetingId));
      if (!meeting) throw new AccessDeniedError();
      const sources = await ctx.db
        .select({
          id: meetingOriginals.id,
          provider: meetingOriginals.provider,
          title: sql<string>`${meetingOriginals.meta}->>'title'`,
          credit: sql<string | null>`${meetingOriginals.meta}->>'credit'`,
          hasNotes: sql<boolean>`${meetingOriginals.notes} is not null`,
          turnCount: sql<number>`jsonb_array_length(${meetingOriginals.turns})`,
        })
        .from(meetingOriginals)
        .where(
          and(
            eq(meetingOriginals.archiveId, meeting.archiveId),
            eq(meetingOriginals.meetingId, meeting.id),
          ),
        )
        .orderBy(asc(meetingOriginals.id));
      return { ...meeting, sources, sourceMessage: await sourceMessageOf(ctx, meeting.id) };
    },
    async read({
      meetingId,
      sourceId,
      section,
      offset,
      turn: index,
    }: McpInput<"read_meeting_source">) {
      const notes = section === "notes",
        size = 3000;
      const item = sql`${meetingOriginals.turns}->${index}::int`;
      const text = notes ? meetingOriginals.notes : sql`(${item})->>'text'`;
      const [r] = await ctx.db
        .select({
          text: sql<string | null>`substring(${text} from ${offset + 1}::int for ${size})`,
          length: sql<number>`length(${text})`,
          speaker: notes ? sql<null>`null` : sql<string | null>`nullif((${item})->>'speaker','')`,
          offsetMs: notes
            ? sql<null>`null`
            : sql<number | null>`((${item})->>'offsetMs')::double precision`,
          turns: sql<number>`jsonb_array_length(${meetingOriginals.turns})`,
        })
        .from(meetingOriginals)
        .innerJoin(meetings, eq(meetings.id, meetingOriginals.meetingId))
        .where(and(scope(meetingId), eq(meetingOriginals.id, sourceId)));
      if (r?.text == null) throw new AccessDeniedError();
      const nextOffset = offset + size < r.length ? offset + size : null;
      return {
        text: r.text,
        speaker: r.speaker,
        offsetMs: r.offsetMs,
        nextOffset,
        nextTurn: !notes && nextOffset === null && index + 1 < r.turns ? index + 1 : null,
      };
    },
    async create({ meeting, requestId, sourceMessageId }: McpInput<"create_meeting">) {
      const source = sourceMessageId ? await sourceMessage(sourceMessageId) : null;
      const result = await repo.create(meeting, requestId);
      if (source) {
        await ctx.db.insert(messageEntityReferences).values({
          organizationId: identity.organizationId,
          conversationId: source.conversationId,
          messageId: source.id,
          entityId: result.id,
          entityType: "meeting",
          purpose: "source",
          createdByActorEntityId: identity.actorEntityId,
        });
        for (const hint of referenceChangeHints(identity.organizationId, [], source))
          ctx.effects.hint(hint);
      }
      return result;
    },
  };
}
