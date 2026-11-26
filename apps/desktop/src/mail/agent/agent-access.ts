import { InboxToolError, type AgentInbox } from "@substrate/agent-host";
import { mcpOutputOffloadBytes } from "@substrate/contracts/harness-runtime";
import type { MailScope } from "@substrate/contracts/mail/ipc";

import type { GmailWork } from "../gmail/gmail-connection.ts";
import type { createMailSession } from "../session.ts";
import { readExcerpt } from "./agent-excerpts.ts";
import { createInboxSearch, refreshMailLabels } from "./agent-search.ts";

export function agentInbox(
  { use, checked }: Pick<ReturnType<typeof createMailSession>, "use" | "checked">,
  gmail: GmailWork,
) {
  const search = createInboxSearch(gmail);
  return (scope: MailScope): AgentInbox => {
    const check = async (signal: AbortSignal) => {
      await checked(scope, signal);
    };
    return {
      search: (q) => use(scope, (local) => search(local, q, check)),
      read: (q) =>
        use(scope, async (local) => {
          const target = await local.db.actionTarget(q.messageId);
          const missing = () =>
            new InboxToolError("NOT_FOUND", "This email is no longer in a connected Inbox.");
          if (!target) throw missing();
          const { mailboxId, remoteId } = target;
          const deadline = AbortSignal.any([local.abort.signal, AbortSignal.timeout(15_000)]);
          let coverage: "gmail" | "cached" = "gmail";
          try {
            await local.jobs.run(
              mailboxId,
              (signal) =>
                gmail(local, mailboxId, signal, (reader, grant) =>
                  refreshMailLabels(local, mailboxId, [remoteId], reader, grant, signal, check),
                ),
              deadline,
            );
          } catch {
            local.abort.signal.throwIfAborted();
            coverage = "cached";
          }
          await check(local.abort.signal);
          const box = (await local.db.accounts()).find((b) => b.id === mailboxId);
          const message = await local.db.inboxMessage(q.messageId, q.offset, mcpOutputOffloadBytes);
          await check(local.abort.signal);
          if (!box || !message) throw missing();
          return readExcerpt(box, message, q.offset, coverage);
        }),
    };
  };
}
