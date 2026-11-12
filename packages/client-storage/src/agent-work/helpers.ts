import { helperMachine, maxLiveHelpers, sessionKeys } from "@substrate/contracts/agent-work";

import type { LocalTransaction, RunTransaction } from "../database.ts";
import { helpers, inbox } from "../schema/index.ts";
import { insertItem, localDedupeKeys, setItemStatus } from "./inbox.ts";
import { inStates } from "./machine-sql.ts";
import { ensureSession, sessionById } from "./sessions.ts";
import { and, desc, eq } from "drizzle-orm";

export type HelperRow = typeof helpers.$inferSelect;

export class HelperLimitError extends Error {
  constructor() {
    super(`At most ${maxLiveHelpers} helpers run at a time. Wait for one to finish or stop one.`);
  }
}

async function helperBySession(tx: LocalTransaction, sessionId: string) {
  return tx.select().from(helpers).where(eq(helpers.sessionId, sessionId)).get();
}

/** Queues a message from the parent agent in the helper's own session. */
async function queueHelperInput(
  tx: LocalTransaction,
  helper: HelperRow,
  text: string,
  dedupeKey: string,
  now: number,
) {
  return insertItem(
    tx,
    {
      sessionId: helper.sessionId,
      userAgentId: helper.userAgentId,
      // The helper session's input: the task, then parent messages.
      source: "helper_task",
      sourceRef: { source: "helper_task", helperId: helper.id },
      lane: "system",
      dedupeKey,
      body: text,
    },
    now,
  );
}

/** Ends a running helper and drops its unclaimed input. */
async function endHelper(
  tx: LocalTransaction,
  helper: HelperRow,
  event: keyof typeof helperMachine.events,
  report: string | null,
  now: number,
) {
  const status = helperMachine.events[event].to;
  await tx
    .update(helpers)
    .set({ status, report, finishedAt: now })
    .where(and(eq(helpers.id, helper.id), inStates(helpers.status, helperMachine.from(event))));
  const pending = await tx
    .select({ id: inbox.id })
    .from(inbox)
    .where(and(eq(inbox.sessionId, helper.sessionId), eq(inbox.status, "pending")))
    .all();
  await setItemStatus(
    tx,
    pending.map((item) => item.id),
    "drop",
    { reason: `helper_${status}` },
  );
}

export function helperRepository(run: RunTransaction) {
  return {
    /**
     * Starts a helper in its own session and folder. A repeated requestId returns the same
     * helper. At most maxLiveHelpers run per agent.
     */
    start: (parentSessionId: string, input: { requestId: string; task: string }, now: number) =>
      run(async (tx) => {
        const existing = await tx
          .select()
          .from(helpers)
          .where(
            and(
              eq(helpers.parentSessionId, parentSessionId),
              eq(helpers.requestId, input.requestId),
            ),
          )
          .get();
        if (existing) return existing;
        const parent = await sessionById(tx, parentSessionId);
        if (!parent || parent.kind === "helper") throw new Error("Helpers cannot start helpers.");
        const running = await tx
          .select({ id: helpers.id })
          .from(helpers)
          .where(and(eq(helpers.userAgentId, parent.userAgentId), eq(helpers.status, "running")))
          .all();
        if (running.length >= maxLiveHelpers) throw new HelperLimitError();
        const id = crypto.randomUUID();
        const session = await ensureSession(
          tx,
          {
            organizationId: parent.organizationId,
            userAgentId: parent.userAgentId,
            agentId: parent.agentId,
            key: sessionKeys.helper(id),
            kind: "helper",
            harness: parent.harness,
            parentSessionId,
          },
          now,
        );
        const [helper] = await tx
          .insert(helpers)
          .values({
            id,
            parentSessionId,
            sessionId: session.id,
            userAgentId: parent.userAgentId,
            requestId: input.requestId,
            task: input.task,
            createdAt: now,
          })
          .returning();
        await queueHelperInput(tx, helper!, input.task, localDedupeKeys.helperTask(id), now);
        return helper!;
      }),
    get: (id: string) => run((tx) => tx.select().from(helpers).where(eq(helpers.id, id)).get()),
    bySession: (sessionId: string) => run((tx) => helperBySession(tx, sessionId)),
    list: (parentSessionId: string) =>
      run((tx) =>
        tx
          .select()
          .from(helpers)
          .where(eq(helpers.parentSessionId, parentSessionId))
          .orderBy(desc(helpers.createdAt))
          .all(),
      ),
    forAgent: (userAgentId: string) =>
      run((tx) =>
        tx
          .select()
          .from(helpers)
          .where(eq(helpers.userAgentId, userAgentId))
          .orderBy(desc(helpers.createdAt))
          .all(),
      ),
    /** Queues more instructions for a running helper. */
    message: (helperId: string, text: string, now: number) =>
      run(async (tx) => {
        const helper = await tx.select().from(helpers).where(eq(helpers.id, helperId)).get();
        if (!helper || helper.status !== "running") throw new Error("The helper is not running.");
        const item = await queueHelperInput(
          tx,
          helper,
          text,
          localDedupeKeys.helperMessage(helperId),
          now,
        );
        return item!;
      }),
    /**
     * Stores the helper's report and wakes the parent with a helper_result item. A helper that
     * ends without a report fails, and the parent learns that too.
     */
    finish: (helperSessionId: string, report: string | null, now: number) =>
      run(async (tx) => {
        const helper = await helperBySession(tx, helperSessionId);
        if (!helper) throw new Error("Only helpers can finish.");
        if (helper.status !== "running") return helper;
        await endHelper(tx, helper, report === null ? "fail" : "finish", report, now);
        await insertItem(
          tx,
          {
            sessionId: helper.parentSessionId,
            userAgentId: helper.userAgentId,
            source: "helper_result",
            sourceRef: { source: "helper_result", helperId: helper.id },
            lane: "background",
            dedupeKey: localDedupeKeys.helperResult(helper.id),
            body: report ?? "The helper ended without a report.",
          },
          now,
        );
        return (await helperBySession(tx, helperSessionId))!;
      }),
    stop: (helperId: string, now: number) =>
      run(async (tx) => {
        const helper = await tx.select().from(helpers).where(eq(helpers.id, helperId)).get();
        if (!helper) throw new Error("Helper not found.");
        await endHelper(tx, helper, "stop", helper.report, now);
        return (await tx.select().from(helpers).where(eq(helpers.id, helperId)).get())!;
      }),
  };
}
