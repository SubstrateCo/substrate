import type { RunTransaction } from "../database.ts";
import { mailMessages } from "../schema/mail.ts";
import { conversationFilter, headers, membership } from "./conversations.ts";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { compile } from "html-to-text";

export interface InboxHeaderQuery {
  box: string;
  query: string;
  unreadOnly: boolean;
  limit: number;
  seen: string[];
  remoteIds?: string[];
}

// Pure parsing in the mail read worker. No DOM, remote images or attachment requests.
const plain = compile({
  wordwrap: false,
  selectors: [
    { selector: "img", format: "skip" },
    { selector: "a", options: { ignoreHref: true } },
    { selector: "script", format: "skip" },
    { selector: "style", format: "skip" },
  ],
  limits: { maxInputLength: Infinity },
});

/** Agent IDs refer to individual Inbox members, never the latest sibling in a conversation. */
export function agentMailReads(run: RunTransaction, org: string) {
  const scope = eq(mailMessages.organizationId, org);
  return {
    inboxHeaders: ({ box, query, unreadOnly, limit, seen, remoteIds }: InboxHeaderQuery) =>
      run((tx) =>
        tx
          .select(headers)
          .from(mailMessages)
          .where(
            and(
              scope,
              eq(mailMessages.mailboxId, box),
              // Gmail can also match body text. For its result IDs only recheck current membership.
              conversationFilter(
                { mailboxId: box, view: "inbox", search: remoteIds ? "" : query },
                Date.now(),
              ).match,
              unreadOnly ? membership("unread", Date.now()) : undefined,
              remoteIds ? inArray(mailMessages.remoteId, remoteIds) : undefined,
              seen.length
                ? sql`${mailMessages.id} not in (select value from json_each(${JSON.stringify(seen)}))`
                : undefined,
            ),
          )
          .orderBy(desc(mailMessages.timestamp), desc(mailMessages.id))
          .limit(limit),
      ),
    inboxMessage: async (id: string, offset: number, limit: number) => {
      const row = await run((tx) =>
        tx
          .select({ ...headers, body: mailMessages.body })
          .from(mailMessages)
          .where(and(scope, eq(mailMessages.id, id), membership("inbox", Date.now())))
          .get(),
      );
      if (!row) return undefined;
      // Release the SQLite transaction before extracting HTML. Only the requested chunk
      // crosses the worker boundary, even for a very large newsletter.
      const { body, ...header } = row;
      const text = body.plainText ?? (body.format === "plain" ? body.text : plain(body.text));
      return {
        ...header,
        text: text.slice(offset, offset + limit),
        more: offset + limit < text.length,
      };
    },
  };
}
