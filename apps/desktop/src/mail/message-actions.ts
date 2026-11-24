import type { MailMessageAction } from "@substrate/contracts/mail";
import type { MailActionResult } from "@substrate/contracts/mail/ipc";

import { WritePermissionRequired } from "./gmail-actions.ts";
import type { GmailWork } from "./gmail-connection.ts";
import { ReconnectRequired } from "./provider.ts";
import type { LocalMail } from "./session.ts";

/** The renderer supplies local IDs, never Gmail IDs. A checked list row represents a
 * conversation; expanding a message in the reader grants a write only to that email. */
export async function applyMailActions(
  local: LocalMail,
  ids: string[],
  mode: "message" | "conversation",
  action: MailMessageAction,
  gmail: GmailWork,
  check: (signal: AbortSignal) => Promise<void>,
  reconcile: (local: LocalMail, id: string) => void,
) {
  const rows = await local.db.actionTargets(ids);
  const outcomes = new Map<string, MailActionResult>();
  for (const mailboxId of new Set(rows.map((r) => r.mailboxId))) {
    const members = rows.filter((r) => r.mailboxId === mailboxId);
    await local.jobs.run(
      mailboxId,
      async (signal) => {
        const done = new Map<string, MailActionResult>();
        try {
          await check(signal);
          const box = await local.db.connection(mailboxId);
          if (!box) throw new Error("Mailbox unavailable.");
          if (!box.canModify || box.status === "reconnect") throw new WritePermissionRequired();
          await gmail(local, mailboxId, signal, async (reader, grant) => {
            const allowed = async () => {
              await check(signal);
              const box = await local.db.connection(mailboxId);
              if (!box || box.protectedGrant !== grant()) throw new Error("Mailbox changed.");
              if (!box.canModify) throw new WritePermissionRequired();
            };
            try {
              for (const m of members) {
                const thread = mode === "conversation" ? m.threadId : null;
                const target = thread
                  ? { kind: "threads" as const, id: thread }
                  : { kind: "messages" as const, id: m.remoteId };
                const key = `${target.kind}/${target.id}`;
                let result = done.get(key);
                if (!result) {
                  await allowed();
                  try {
                    const states = await reader.changeLabels(action, target, allowed);
                    await check(signal);
                    signal.throwIfAborted();
                    await local.db.applyConfirmed(mailboxId, target, grant(), states);
                    result = states ? "updated" : "missing";
                  } catch (error) {
                    signal.throwIfAborted();
                    if (
                      error instanceof WritePermissionRequired ||
                      error instanceof ReconnectRequired
                    )
                      throw error;
                    // A failed target doesn't roll back completed rows or prevent an independent
                    // conversation from changing. Authority failures must still end the batch.
                    await allowed();
                    result = "retry";
                  }
                  done.set(key, result);
                }
                outcomes.set(m.id, result);
              }
            } catch (error) {
              if (error instanceof WritePermissionRequired)
                await local.db.disableWrites(mailboxId, grant());
              throw error;
            }
          });
        } catch (error) {
          const reconnect =
            error instanceof ReconnectRequired || error instanceof WritePermissionRequired;
          for (const m of members)
            if (!outcomes.has(m.id)) outcomes.set(m.id, reconnect ? "reconnect" : "retry");
        }
        await check(signal);
      },
      local.abort.signal,
    );
    if (members.some((m) => outcomes.get(m.id) !== "reconnect")) reconcile(local, mailboxId);
  }
  return Array.from(new Set(ids), (id) => ({
    id,
    result: outcomes.get(id) ?? ("missing" as const),
  }));
}
