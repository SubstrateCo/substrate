import { mailFlag } from "@substrate/contracts/mail";

import type { RunTransaction } from "../database.ts";
import { mailConnections, mailMessages } from "../schema/mail.ts";
import { and, eq, inArray, sql } from "drizzle-orm";

const counted = (flags: number) =>
  (flags & (mailFlag.unread | mailFlag.trash | mailFlag.spam)) === mailFlag.unread;

export function mailActions(run: RunTransaction, org: string) {
  type State = { flags: number; labelIds: string[] };
  type Target = { kind: "threads" | "messages"; id: string };
  const columns = {
    id: mailMessages.id,
    mailboxId: mailMessages.mailboxId,
    remoteId: mailMessages.remoteId,
    threadId: mailMessages.threadId,
  };
  const applyConfirmed = (
    mailboxId: string,
    target: Target,
    grant: string,
    states: (State & { remoteId: string })[] | null,
  ) =>
    run(async (tx) => {
      const connection = and(
        eq(mailConnections.organizationId, org),
        eq(mailConnections.id, mailboxId),
        eq(mailConnections.protectedGrant, grant),
      );
      if (
        !(await tx.select({ id: mailConnections.id }).from(mailConnections).where(connection).get())
      )
        throw new Error("Mailbox authorization changed.");
      const scope = and(
        eq(mailMessages.organizationId, org),
        eq(mailMessages.mailboxId, mailboxId),
      );
      const old = await tx
        .select({ remoteId: mailMessages.remoteId, flags: mailMessages.flags })
        .from(mailMessages)
        .where(
          and(
            scope,
            eq(
              target.kind === "threads" ? mailMessages.threadId : mailMessages.remoteId,
              target.id,
            ),
          ),
        );
      const confirmed = new Map(states?.map((m) => [m.remoteId, m]));
      let delta = 0;
      for (const member of old) {
        const state = confirmed.get(member.remoteId);
        if (!state && states !== null) continue;
        const row = and(scope, eq(mailMessages.remoteId, member.remoteId));
        if (state)
          await tx
            .update(mailMessages)
            .set({ flags: state.flags, labelIds: state.labelIds })
            .where(row);
        else await tx.delete(mailMessages).where(row);
        delta += Number(counted(state?.flags ?? 0)) - Number(counted(member.flags));
      }
      if (delta)
        await tx
          .update(mailConnections)
          .set({ unreadTotal: sql`max(0, ${mailConnections.unreadTotal} + ${delta})` })
          .where(connection);
    });
  return {
    actionTarget: (id: string) =>
      run((tx) =>
        tx
          .select(columns)
          .from(mailMessages)
          .where(and(eq(mailMessages.organizationId, org), eq(mailMessages.id, id)))
          .get(),
      ),
    actionTargets: (ids: string[]) =>
      run((tx) =>
        tx
          .select(columns)
          .from(mailMessages)
          .where(and(eq(mailMessages.organizationId, org), inArray(mailMessages.id, ids))),
      ),
    applyConfirmed,
    applyMessageState: (mailboxId: string, remoteId: string, grant: string, state: State | null) =>
      applyConfirmed(
        mailboxId,
        { kind: "messages", id: remoteId },
        grant,
        state ? [{ ...state, remoteId }] : null,
      ),
  };
}
