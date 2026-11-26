import {
  helperMachine,
  maxLiveHelpers,
  sessionKeys,
  wakeDedupeKeys,
} from "@substrate/contracts/agent-work";
import { newId } from "@substrate/contracts/ids";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import { AccessDeniedError, ValidationError } from "../../errors";
import { admit } from "./admission/admission";
import { agentHelpers } from "./helpers.schema";
import { liveStatuses } from "./host/held-turn";
import { setItemStatus } from "./items";
import { inStates } from "./machine-sql";
import { ensureSession, type SessionRow } from "./sessions";
import { agentSessions } from "./sessions.schema";
import { stopTurns } from "./stop";
import { agentTurns } from "./turns.schema";
import { agentWorkItems } from "./work-items.schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export type HelperRow = typeof agentHelpers.$inferSelect;

const helperWithoutReport = "The helper ended without a report.";
const helperLimitMessage = `At most ${maxLiveHelpers} helpers run at a time. Wait for one to finish or stop one.`;

export async function helperBySession(db: DatabaseExecutor, sessionId: string) {
  const [helper] = await db
    .select()
    .from(agentHelpers)
    .where(eq(agentHelpers.sessionId, sessionId));
  return helper;
}

function changed(db: DatabaseExecutor, row: Pick<HelperRow, "ownerUserId">) {
  effectsFor(db).hint({ audience: realtimeKeys.user(row.ownerUserId), domain: "agent-work" });
}

/** Ends a running helper and drops its unclaimed input. False when it already ended. */
async function endHelper(
  db: DatabaseExecutor,
  helper: HelperRow,
  event: keyof typeof helperMachine.events,
  report: string | null,
  now: Date,
) {
  const status = helperMachine.events[event].to;
  const ended = await db
    .update(agentHelpers)
    .set({ status, report, finishedAt: now })
    .where(
      and(eq(agentHelpers.id, helper.id), inStates(agentHelpers.status, helperMachine.from(event))),
    )
    .returning({ id: agentHelpers.id });
  if (!ended.length) return false;
  const pending = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(eq(agentWorkItems.sessionId, helper.sessionId), eq(agentWorkItems.status, "pending")),
    );
  await setItemStatus(
    db,
    pending.map((item) => item.id),
    "drop",
    { reason: `helper_${status}` },
  );
  return true;
}

/**
 * Stores the helper's report and gives the parent a helper_result item. A helper that ends
 * without a report fails, and the parent learns that too.
 */
export async function finishHelper(
  db: DatabaseExecutor,
  helper: HelperRow,
  report: string | null,
  now: Date,
) {
  if (!(await endHelper(db, helper, report === null ? "fail" : "finish", report, now))) return;
  const [parent] = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, helper.parentSessionId));
  if (!parent) return;
  const { hints } = await admit(
    db,
    [
      {
        type: "helper",
        source: "helper_result",
        helperId: helper.id,
        session: parent,
        body: report ?? helperWithoutReport,
        dedupeKey: wakeDedupeKeys.helperResult(helper.id),
      },
    ],
    now,
  );
  for (const hint of hints) effectsFor(db).hint(hint);
}

/** A helper that a turn of this parent session started. */
export async function requireHelper(db: DatabaseExecutor, parentSessionId: string, id: string) {
  const [helper] = await db
    .select()
    .from(agentHelpers)
    .where(and(eq(agentHelpers.id, id), eq(agentHelpers.parentSessionId, parentSessionId)));
  if (!helper) throw new AccessDeniedError();
  return helper;
}

/** The helpers that turns of this session started, newest first. */
export function sessionHelpers(db: DatabaseExecutor, parentSessionId: string) {
  return db
    .select()
    .from(agentHelpers)
    .where(eq(agentHelpers.parentSessionId, parentSessionId))
    .orderBy(desc(agentHelpers.createdAt), desc(agentHelpers.id));
}

/**
 * Starts a helper in its own session and folder, with its task as the first item. A repeated
 * requestId in the same parent session returns the same helper. Helpers cannot start helpers,
 * and at most maxLiveHelpers run per agent.
 */
export async function startHelper(
  db: DatabaseExecutor,
  parent: SessionRow,
  input: { requestId: string; task: string },
  now = new Date(),
) {
  const [existing] = await db
    .select()
    .from(agentHelpers)
    .where(
      and(eq(agentHelpers.parentSessionId, parent.id), eq(agentHelpers.requestId, input.requestId)),
    );
  if (existing) return existing;
  if (parent.kind === "helper") throw new ValidationError("Helpers cannot start helpers.");
  const running = await db
    .select({ id: agentHelpers.id })
    .from(agentHelpers)
    .where(
      and(eq(agentHelpers.userAgentId, parent.userAgentId), eq(agentHelpers.status, "running")),
    );
  if (running.length >= maxLiveHelpers) throw new ValidationError(helperLimitMessage);
  const id = newId();
  const session = await ensureSession(
    db,
    parent,
    { key: sessionKeys.helper(id), kind: "helper", parentSessionId: parent.id },
    now,
  );
  const [helper] = await db
    .insert(agentHelpers)
    .values({
      id,
      organizationId: parent.organizationId,
      userAgentId: parent.userAgentId,
      agentActorEntityId: parent.agentActorEntityId,
      ownerUserId: parent.ownerUserId,
      parentSessionId: parent.id,
      sessionId: session.id,
      requestId: input.requestId,
      task: input.task,
      createdAt: now,
    })
    // A concurrent start with the same requestId wins; this one returns its helper.
    .onConflictDoNothing({ target: [agentHelpers.parentSessionId, agentHelpers.requestId] })
    .returning();
  if (!helper) {
    await db.delete(agentSessions).where(eq(agentSessions.id, session.id));
    return startHelper(db, parent, input, now);
  }
  const { hints } = await admit(
    db,
    [
      {
        type: "helper",
        source: "helper_task",
        helperId: id,
        session,
        body: input.task,
        dedupeKey: wakeDedupeKeys.helperTask(id),
      },
    ],
    now,
  );
  for (const hint of hints) effectsFor(db).hint(hint);
  return helper;
}

/**
 * Queues more instructions from the parent in the running helper's own session. The helper
 * reads them in its next turn: its turns run unattended, so nothing steers into them.
 */
export async function messageHelper(
  db: DatabaseExecutor,
  helper: HelperRow,
  text: string,
  now = new Date(),
) {
  if (helper.status !== "running") throw new ValidationError("The helper is not running.");
  const [session] = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, helper.sessionId));
  const { items, hints } = await admit(
    db,
    [
      {
        type: "helper",
        source: "helper_task",
        helperId: helper.id,
        session: session!,
        body: text,
        dedupeKey: wakeDedupeKeys.helperMessage(helper.id),
      },
    ],
    now,
  );
  for (const hint of hints) effectsFor(db).hint(hint);
  return items[0]!;
}

/** Stops a running helper. Its live turn stops too; a report it already saved stays. */
export async function stopHelper(db: DatabaseExecutor, helper: HelperRow, now = new Date()) {
  await endHelper(db, helper, "stop", helper.report, now);
  await stopTurns(
    db,
    and(eq(agentTurns.sessionId, helper.sessionId), inArray(agentTurns.status, liveStatuses)),
    "stop",
  );
  changed(db, helper);
  const [row] = await db.select().from(agentHelpers).where(eq(agentHelpers.id, helper.id));
  return row!;
}
