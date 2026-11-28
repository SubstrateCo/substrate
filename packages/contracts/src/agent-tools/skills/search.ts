import type { HarnessSkill } from "../../harness-runtime/local.ts";

export const searchSkill: HarnessSkill = {
  id: "substrate-search",
  name: "substrate-search",
  description:
    "Use when finding tasks, projects, messages or conversations in Substrate, or gathering workspace context before answering or acting. Covers choosing between name and content search, catching up on recent activity, following links, and access limits.",
  content: `# Substrate search

## Choose the right tool

| Goal | Tool |
| --- | --- |
| Find a channel by name | \`search_names\` |
| Find a task or project, by title or by words in its description | \`search_content\` (it matches titles too; do not also run \`search_names\`) |
| Find words in messages | \`search_content\` |
| See what happened recently | \`list_conversations\` with \`activeSince\`, then \`read_conversation\` with \`since\` |
| List or filter the records of one app | That app's list tool; see the app's skill |
| Find a person to assign | \`list_assignees\` |
| Find what a record is connected to | \`linked\` in the result of the record's read tool |
| Find what a message is about | \`records\` on each message in \`read_thread\` or \`read_conversation\` |
| Find a file, image or screenshot | \`attachments\` on messages and tasks, or \`list_files\` |
| Look at an image or read a text file | \`read_file\` with the file's \`file\` locator |
| Open another file type with your own tools | \`download_file\`, then the saved \`path\` |

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
- A record: call the read tool of its app. It shows the newest linked messages and records in \`linked\`.
- Follow the IDs in \`records\` and \`linked\` to read connected work. When \`linked.messageCount\` is larger than the messages shown, call \`list_linked_messages\`.

## Catching up

1. Call \`list_conversations\` with \`activeSince\`.
2. For each conversation, call \`read_conversation\` with \`since\`.
3. Items with \`includedBecause: "thread_activity"\` are older messages with new replies. Call \`read_thread\` to read the replies.
4. Text is cut when \`truncated\` is true. Call \`read_thread\` for the full text.

## Files

- Messages and tasks list their files in \`attachments\`. A task created from a message also lists that message's files in \`sourceAttachments\`.
- Each file has a \`file\` locator. Pass it unchanged to \`read_file\` or \`download_file\`. A file ID alone opens nothing: each read checks access to the message or task.
- \`read_file\` shows images and returns text in parts. For other types it returns \`unavailable\` with the reason. Report an unavailable file to your owner; do not say you saw it.
- \`download_file\` saves the original under \`.substrate/files/\` in your working folder.

## Access

- You see only what your owner can see. An empty result can mean "no access", not "does not exist".
- A \`NOT_FOUND\` error means the record does not exist or you cannot access it. Do not guess other IDs.
- Use only IDs that a tool returned. Never build an ID or infer access from a matching ID.

## Pages

When \`nextCursor\` is not null, pass it as \`cursor\` with the same other inputs to get the next page. If you change any input, start again without a cursor.
`,
};
