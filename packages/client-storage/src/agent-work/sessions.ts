import {
  parseSessionKey,
  sessionKeys,
  type AgentSessionKind,
} from "@substrate/contracts/agent-work";
import type { HarnessFolder, HarnessKind, TurnPlace } from "@substrate/contracts/harness";

import type { LocalTransaction, RunTransaction } from "../database.ts";
import { sessions } from "../schema/index.ts";
import { and, eq, getTableColumns, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";

export type SessionRow = typeof sessions.$inferSelect;

/** A session without its managed prefix, which is large and only the turn start needs. */
export type SessionSummary = Omit<SessionRow, "prefix">;
const { prefix: _prefix, ...summaryColumns } = getTableColumns(sessions);

export interface EnsureSessionInput {
  organizationId: string;
  userAgentId: string;
  agentId: string;
  key: string;
  kind: AgentSessionKind;
  harness: HarnessKind;
  parentSessionId?: string | null;
  origin?: TurnPlace | null;
  destination?: TurnPlace | null;
}

/** Keys of the slots turns run in. One live turn per folder. */
export const folderKeys = {
  main: (userAgentId: string) => `main:${userAgentId}`,
  /** A helper's folder key is its session key. */
  helper: sessionKeys.helper,
};

/** The slot a session's turns run in: the agent's main folder, or a helper's own folder. */
export function folderKey(session: Pick<SessionRow, "kind" | "key" | "userAgentId">) {
  const folder = folderOf(session);
  return folder === "main"
    ? folderKeys.main(session.userAgentId)
    : folderKeys.helper(folder.helperId);
}

export function folderOf(session: Pick<SessionRow, "kind" | "key">): HarnessFolder {
  return session.kind === "helper" ? { helperId: parseSessionKey(session.key)!.id } : "main";
}

export async function ensureSession(tx: LocalTransaction, input: EnsureSessionInput, now: number) {
  await tx
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      userAgentId: input.userAgentId,
      agentId: input.agentId,
      key: input.key,
      kind: input.kind,
      harness: input.harness,
      parentSessionId: input.parentSessionId ?? null,
      originConversationId: input.origin?.conversationId ?? null,
      originThreadId: input.origin?.threadId ?? null,
      destinationConversationId: input.destination?.conversationId ?? null,
      destinationThreadId: input.destination?.threadId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const row = await tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.userAgentId, input.userAgentId), eq(sessions.key, input.key)))
    .get();
  if (!row) throw new Error("Session was not saved.");
  return row;
}

export async function sessionById(tx: LocalTransaction, id: string) {
  return tx.select().from(sessions).where(eq(sessions.id, id)).get();
}

/** Starts the next epoch: a new native session and a new managed prefix. */
export async function rotateEpoch(tx: LocalTransaction, id: string, now: number) {
  const session = await sessionById(tx, id);
  if (!session) throw new Error("Session not found.");
  await tx
    .update(sessions)
    .set({
      epoch: session.epoch + 1,
      epochTurns: 0,
      nativeSessionId: null,
      prefix: null,
      policyVersion: null,
      rotation: null,
      updatedAt: now,
    })
    .where(eq(sessions.id, id));
  return session.epoch + 1;
}

export function sessionRepository(run: RunTransaction) {
  return {
    ensure: (input: EnsureSessionInput, now: number) => run((tx) => ensureSession(tx, input, now)),
    get: (id: string) => run((tx) => sessionById(tx, id)),
    byKey: (userAgentId: string, key: string) =>
      run((tx) =>
        tx
          .select()
          .from(sessions)
          .where(and(eq(sessions.userAgentId, userAgentId), eq(sessions.key, key)))
          .get(),
      ),
    byIds: (ids: string[]) =>
      run(async (tx) =>
        ids.length ? tx.select().from(sessions).where(inArray(sessions.id, ids)).all() : [],
      ),
    forAgent: (organizationId: string, userAgentId: string): Promise<SessionSummary[]> =>
      run((tx) =>
        tx
          .select(summaryColumns)
          .from(sessions)
          .where(
            and(eq(sessions.organizationId, organizationId), eq(sessions.userAgentId, userAgentId)),
          )
          .all(),
      ),
    /** Agents with local work in the organization: the agents homed on this desktop. */
    agents: (organizationId: string) =>
      run(async (tx) =>
        (
          await tx
            .selectDistinct({ userAgentId: sessions.userAgentId })
            .from(sessions)
            .where(eq(sessions.organizationId, organizationId))
            .all()
        ).map((row) => row.userAgentId),
      ),
    /** Sessions that started in or publish to the conversation. */
    forConversation: (organizationId: string, conversationId: string): Promise<SessionSummary[]> =>
      run((tx) =>
        tx
          .select(summaryColumns)
          .from(sessions)
          .where(
            and(
              eq(sessions.organizationId, organizationId),
              or(
                eq(sessions.originConversationId, conversationId),
                eq(sessions.destinationConversationId, conversationId),
              ),
            ),
          )
          .all(),
      ),
    /** Records the native session and, at epoch start, the prefix it was opened with. */
    opened: (
      id: string,
      input: { nativeSessionId: string; prefix: string; policyVersion: number },
      now: number,
    ) =>
      run((tx) =>
        tx
          .update(sessions)
          .set({ ...input, updatedAt: now })
          .where(eq(sessions.id, id)),
      ),
    setPrefix: (id: string, prefix: string, policyVersion: number, now: number) =>
      run((tx) =>
        tx
          .update(sessions)
          .set({ prefix, policyVersion, updatedAt: now })
          .where(eq(sessions.id, id)),
      ),
    /** Sessions of the organization whose epoch prefix was built with another policy version. */
    outdatedPolicy: (policyVersion: number, organizationId: string) =>
      run((tx) =>
        tx
          .select({ id: sessions.id, userAgentId: sessions.userAgentId })
          .from(sessions)
          .where(
            and(
              eq(sessions.organizationId, organizationId),
              isNotNull(sessions.policyVersion),
              ne(sessions.policyVersion, policyVersion),
              isNull(sessions.rotation),
              ne(sessions.status, "closed"),
            ),
          )
          .all(),
      ),
  };
}
