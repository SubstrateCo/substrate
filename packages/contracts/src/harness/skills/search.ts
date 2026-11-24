import type { HarnessSkill } from "../local.ts";

export const searchSkill: HarnessSkill = {
  id: "substrate-search",
  name: "substrate-search",
  description:
    "Use when finding tasks, projects, messages or conversations in Substrate, or gathering workspace context before answering or acting. Covers choosing between name and content search, catching up on recent activity, following links, and access limits.",
  content: `# Substrate search

## Choose the right tool

| Goal | Tool |
| --- | --- |
| Find a task, project or channel you can name | \`search_names\` |
| Find words in descriptions or messages | \`search_content\` |
| See what happened recently | \`list_conversations\` with \`activeSince\`, then \`read_conversation\` with \`since\` |
| Browse work | \`list_projects\`, then \`list_tasks\` |
| Find a person to assign | \`list_assignees\` |
| Find what a record is connected to | \`linked\` in \`get_task\`, \`get_project\` or \`get_crm_record\` |
| Find what a message is about | \`records\` on each message in \`read_thread\` or \`read_conversation\` |

## How search matches

- \`search_names\` matches the whole query as any part of a task title, project name or conversation name, ignoring case.
- \`search_content\` matches when every word of the query appears as a whole word or the start of one. It reads task and project titles and descriptions, and message text.
- Both are keyword searches, not semantic searches. Use words that literally appear in what you want, not a description of it.
- DMs and group chats often have no name, so neither search finds them by person. Use \`list_conversations\` with \`kind: "dm"\` or \`kind: "group"\`.
- Results are newest first, not ranked by relevance. Read several results before you decide which one is right.
- A query can have at most 200 characters.

## Strategy

1. Start with one to three distinctive words.
2. Leave \`type\` out unless the request clearly names one type. Keep it on follow-up searches.
3. Neither search finds people. If the request names a person and a topic, find the person with \`list_assignees\` or \`list_conversations\`, and the topic with a search.
4. If you get no results, try a shorter word or a synonym, then the other search, then a list tool.
5. Make several small searches instead of one long query.

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
