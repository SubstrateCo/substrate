import type { DatabaseExecutor } from "../../client";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { messagePeople, messageWorkLinks } from "./message-metadata";
import { messagingReferencePage } from "./messaging-references";

const token = /@\[(task|project|person|agent|channel|thread):([0-9a-f-]{36})\]/gi;

// Neutral words for references the reader cannot open. They never name the record.
const unavailable = new Map([
  ["task", "a task"],
  ["project", "a project"],
  ["person", "someone"],
  ["agent", "an agent"],
  ["channel", "a channel"],
  ["thread", "a thread"],
]);

/**
 * One line of plain text for a list row. References become the given labels or a neutral word,
 * and light Markdown is dropped. `labels` keys are `kind:id` in lower case.
 */
export function excerptText(body: string, labels: ReadonlyMap<string, string>, length = 160) {
  const text = body
    .replace(token, (_, kind: string, id: string) => {
      const key = `${kind.toLowerCase()}:${id.toLowerCase()}`;
      return labels.get(key) ?? unavailable.get(kind.toLowerCase()) ?? "a reference";
    })
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= length) return text;
  // Cut at a word boundary when one is near, so the line does not end mid-word.
  const cut = text.slice(0, length - 1);
  const word = cut.replace(/\s+\S*$/, "");
  return `${word.length > length / 2 ? word : cut.trimEnd()}…`;
}

/**
 * Excerpts for messages the caller has already authorized. Each reference resolves with the
 * reader's current access; the rest read as neutral words. Queries run only for reference kinds
 * that appear in the bodies.
 */
export async function messageExcerpts(
  ctx: RepositoryContext,
  db: DatabaseExecutor,
  scope: SessionIdentity,
  messages: { id: string; body: string; conversationId: string }[],
  length?: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const ids = messages.map((message) => message.id);
  const bodies = messages.map((message) => message.body).join("\n");
  const labels = new Map<string, string>();
  if (ids.length && /@\[(task|project):/i.test(bodies))
    for (const links of (await messageWorkLinks(ctx, ids)).values())
      for (const link of links) labels.set(`${link.entityType}:${link.entityId}`, link.title);
  signal?.throwIfAborted();
  if (ids.length && /@\[(channel|thread):/i.test(bodies))
    for (const reference of await messagingReferencePage(db, scope, messages)) {
      const channel = reference.conversationName ? `#${reference.conversationName}` : "a channel";
      labels.set(
        `${reference.kind}:${reference.id}`,
        reference.kind === "channel" ? channel : `a thread in ${channel}`,
      );
    }
  signal?.throwIfAborted();
  if (/@\[person:/i.test(bodies))
    for (const people of (await messagePeople(db, scope, messages)).values())
      for (const person of people) labels.set(`person:${person.id}`, `@${person.name}`);
  signal?.throwIfAborted();
  return new Map(
    messages.map((message) => [message.id, excerptText(message.body, labels, length)]),
  );
}
