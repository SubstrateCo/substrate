import type { HarnessSkill } from "../local.ts";

export const searchSkill: HarnessSkill = {
  id: "substrate-search",
  name: "substrate-search",
  description:
    "Use when finding tasks, projects, messages or conversations in Substrate, or gathering workspace context before answering or acting. Covers search strategy, catching up on recent activity, reading results in context, and access limits.",
  content: `# Substrate search

## Choose the right tool

| Goal | Tool |
| --- | --- |
| Find a record by words in it | \`search\` |
| See what happened recently | \`list_conversations\` with \`activeSince\`, then \`read_conversation\` with \`since\` |
| Browse work | \`list_projects\`, then \`list_tasks\` |
| Find a person to assign | \`list_assignees\` |
| Find what a record is connected to | \`linked\` in \`get_task\`, \`get_project\` or \`get_crm_record\` |
| Find what a message is about | \`records\` on each message in \`read_thread\` or \`read_conversation\` |

## How search matches

- A result matches when it contains every word of the query, or the whole query as text.
- Tasks match on title and description. Projects match on name and description. Messages match on their text. Conversations match on their name.
- DMs and group chats often have no name, so search does not find them by person. Use \`list_conversations\` with \`kind: "dm"\` or \`kind: "group"\`.
- Results are not ranked. Read several results before you decide which one is right.
- A query can have at most 200 characters.

## Strategy

1. Start with one or two distinctive words.
2. If you get too many results, set \`type\` or add a word.
3. If you get no results, try a synonym or a shorter word. Then try a list tool.
4. Make several small searches instead of one long query.

## After a result

- Message: call \`read_thread\` with its \`id\`. This works for a reply too, and returns the whole thread. Each message lists the records it references in \`records\`.
- Task: call \`get_task\`. It shows the source message, task links, and the newest linked messages and records in \`linked\`.
- Project: call \`get_project\`, then \`list_tasks\`.
- Follow the IDs in \`records\` and \`linked\` to read connected work. When \`linked.messageCount\` is larger than the messages shown, call \`list_linked_messages\`.

## Catching up

1. Call \`list_conversations\` with \`activeSince\`.
2. For each conversation, call \`read_conversation\` with \`since\`.
3. Items with \`includedBecause: "thread_activity"\` are older messages with new replies. Call \`read_thread\` to read the replies.
4. Text is cut when \`truncated\` is true. Call \`read_thread\` for the full text.

## Access

- You see only what your owner can see. An empty result can mean "no access", not "does not exist".
- A \`NOT_FOUND\` error means the record does not exist or you cannot access it. Do not guess other IDs.
- Use only IDs that a tool returned. Never build an ID or infer access from a matching ID.

## Pages

When \`nextCursor\` is not null, pass it as \`cursor\` with the same other inputs to get the next page. If you change any input, start again without a cursor.
`,
};
