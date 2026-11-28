import type { TurnPlace } from "@substrate/contracts/agent-tools";
import {
  sessionKeys,
  type AgentRoutineView,
  type RoutineChanges,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { ensureUserAgentActor } from "../../../core/actors/provisioning";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { createMessagingService } from "../../messaging/service";
import { setItemStatus } from "../items";
import { requirePlace } from "../place";
import { agentRoutines } from "../routines.schema";
import { agentSessions } from "../sessions.schema";
import { agentWorkItems } from "../work-items.schema";
import { nextOccurrence, validCron } from "./schedule";
import { and, desc, eq } from "drizzle-orm";

export type RoutineRow = typeof agentRoutines.$inferSelect;

export type RoutineAuthor = "owner" | "agent";

type Owner = Pick<SessionIdentity, "organizationId" | "userId">;

const revisedFields = [
  "name",
  "prompt",
  "cron",
  "timezone",
  "destinationConversationId",
  "destinationThreadId",
] as const;

const iso = (value: Date | null) => value?.toISOString() ?? null;

export function routineView(row: RoutineRow): AgentRoutineView {
  return {
    id: row.id,
    userAgentId: row.userAgentId,
    name: row.name,
    prompt: row.prompt,
    cron: row.cron,
    timezone: row.timezone,
    revision: row.revision,
    approvedRevision: row.approvedRevision,
    destination: {
      conversationId: row.destinationConversationId,
      threadId: row.destinationThreadId,
    },
    catchUp: row.catchUp,
    enabled: row.enabled,
    nextFireAt: iso(row.nextFireAt),
    lastFiredAt: iso(row.lastFiredAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export const routineApproved = (row: Pick<RoutineRow, "revision" | "approvedRevision">) =>
  row.approvedRevision === row.revision;

function checkSchedule(cron: string, timezone: string) {
  if (!validCron(cron, timezone)) throw new ValidationError("Invalid cron expression.");
}

async function destinationOf(
  db: DatabaseExecutor,
  owner: Owner,
  userAgentId: string,
  place: TurnPlace | null,
): Promise<TurnPlace> {
  if (place) {
    await requirePlace(db, owner, place);
    return place;
  }
  const direct = await createMessagingService(db, owner).createConversation({
    kind: "agent_dm",
    agentIds: [userAgentId],
  });
  return { conversationId: direct.id, threadId: null };
}

function changed(db: DatabaseExecutor, row: Pick<RoutineRow, "ownerUserId">) {
  effectsFor(db).hint({ audience: realtimeKeys.user(row.ownerUserId), domain: "agent-work" });
}

export async function requireRoutine(
  db: DatabaseExecutor,
  owner: Owner,
  routineId: string,
  userAgentId?: string,
) {
  const [row] = await db
    .select()
    .from(agentRoutines)
    .where(
      and(
        eq(agentRoutines.id, routineId),
        eq(agentRoutines.organizationId, owner.organizationId),
        eq(agentRoutines.ownerUserId, owner.userId),
        userAgentId ? eq(agentRoutines.userAgentId, userAgentId) : undefined,
      ),
    );
  if (!row) throw new AccessDeniedError();
  return row;
}

export async function listRoutines(db: DatabaseExecutor, owner: Owner, userAgentId: string) {
  return db
    .select()
    .from(agentRoutines)
    .where(
      and(
        eq(agentRoutines.organizationId, owner.organizationId),
        eq(agentRoutines.ownerUserId, owner.userId),
        eq(agentRoutines.userAgentId, userAgentId),
      ),
    )
    .orderBy(desc(agentRoutines.createdAt), desc(agentRoutines.id));
}

export interface NewRoutine {
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  destination: TurnPlace | null;
}

export async function createRoutine(
  db: DatabaseExecutor,
  owner: Owner,
  userAgentId: string,
  input: NewRoutine,
  author: RoutineAuthor,
  now = new Date(),
) {
  checkSchedule(input.cron, input.timezone);
  const actor = await ensureUserAgentActor(db, { ...owner, userAgentId });
  const destination = await destinationOf(db, owner, userAgentId, input.destination);
  const [row] = await db
    .insert(agentRoutines)
    .values({
      organizationId: owner.organizationId,
      userAgentId,
      agentActorEntityId: actor.entityId,
      ownerUserId: owner.userId,
      name: input.name,
      prompt: input.prompt,
      cron: input.cron,
      timezone: input.timezone,
      enabled: input.enabled,
      approvedRevision: author === "owner" ? 1 : null,
      destinationConversationId: destination.conversationId,
      destinationThreadId: destination.threadId,
      nextFireAt: nextOccurrence(input.cron, input.timezone, now),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  changed(db, row!);
  return row!;
}

export async function updateRoutine(
  db: DatabaseExecutor,
  routine: RoutineRow,
  changes: RoutineChanges,
  author: RoutineAuthor,
  now = new Date(),
) {
  const { destination: place, ...rest } = changes;
  const values: Partial<typeof agentRoutines.$inferInsert> = { ...rest };
  if (place !== undefined) {
    const owner = { organizationId: routine.organizationId, userId: routine.ownerUserId };
    const target = await destinationOf(db, owner, routine.userAgentId, place);
    values.destinationConversationId = target.conversationId;
    values.destinationThreadId = target.threadId;
  }
  const cron = values.cron ?? routine.cron;
  const timezone = values.timezone ?? routine.timezone;
  checkSchedule(cron, timezone);
  const revised = revisedFields.some(
    (field) => values[field] !== undefined && values[field] !== routine[field],
  );
  const revision = revised ? routine.revision + 1 : routine.revision;
  const [row] = await db
    .update(agentRoutines)
    .set({
      ...values,
      revision,
      approvedRevision: author === "owner" ? revision : routine.approvedRevision,
      nextFireAt: nextOccurrence(cron, timezone, now),
      updatedAt: now,
    })
    .where(and(eq(agentRoutines.id, routine.id), eq(agentRoutines.revision, routine.revision)))
    .returning();
  if (!row) throw new ConflictError("The routine changed. Try again.");
  await db
    .update(agentSessions)
    .set({
      destinationConversationId: row.destinationConversationId,
      destinationThreadId: row.destinationThreadId,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentSessions.userAgentId, row.userAgentId),
        eq(agentSessions.key, sessionKeys.routine(row.id)),
      ),
    );
  changed(db, row);
  return row;
}

export async function deleteRoutine(db: DatabaseExecutor, routine: RoutineRow) {
  const pending = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .innerJoin(agentSessions, eq(agentSessions.id, agentWorkItems.sessionId))
    .where(
      and(
        eq(agentSessions.userAgentId, routine.userAgentId),
        eq(agentSessions.key, sessionKeys.routine(routine.id)),
        eq(agentWorkItems.status, "pending"),
      ),
    );
  await setItemStatus(
    db,
    pending.map((item) => item.id),
    "drop",
    { reason: "routine_deleted" },
  );
  await db.delete(agentRoutines).where(eq(agentRoutines.id, routine.id));
  changed(db, routine);
}

export async function approveRoutine(
  db: DatabaseExecutor,
  routine: RoutineRow,
  revision: number,
  now = new Date(),
) {
  const [row] = await db
    .update(agentRoutines)
    .set({
      approvedRevision: revision,
      nextFireAt: nextOccurrence(routine.cron, routine.timezone, now),
      updatedAt: now,
    })
    .where(and(eq(agentRoutines.id, routine.id), eq(agentRoutines.revision, revision)))
    .returning();
  if (!row) throw new ConflictError("The routine changed. Review it again.");
  changed(db, row);
  return row;
}
