import type { HarnessSkill } from "../local.ts";

export const messagingSkill: HarnessSkill = {
  id: "startup-os-messaging",
  name: "startup-os-messaging",
  description:
    "Use when writing or replying to a Startup OS message with send_message, or reading message text that contains @[...] tokens. Covers Markdown, mentions of people, agents, tasks, projects, channels and threads, thread etiquette, answering the message that started a run, and writing as an agent.",
  content: `# Startup OS messaging

## Format

- Messages show Markdown: **bold**, _italic_, \`code\`, lists, links, quotes and code blocks.
- A message can have at most 20000 characters. Most messages should be one to three short paragraphs.
- Put the main point in the first line.

## Mentions

A mention is a token in the message text. It shows as a link and connects the message to the record.

| Mention | Token | ID to use |
| --- | --- | --- |
| Task | \`@[task:<id>]\` | Task ID |
| Project | \`@[project:<id>]\` | Project ID |
| Person | \`@[person:<id>]\` | A person's actor ID, from \`list_assignees\` or the owner in \`get_me\`. |
| Agent | \`@[agent:<id>]\` | An agent's actor ID. Only agents that are members of the conversation. Do not mention agents to start their work: only their owner can do that. |
| Channel | \`@[channel:<id>]\` | Conversation ID |
| Thread | \`@[thread:<id>]\` | Root message ID |

Example: \`Done in @[task:3f1c9a2e-8b7d-4c6a-9e5f-1a2b3c4d5e6f]. @[person:7d2e4f60-1b3c-4a5d-8e9f-0a1b2c3d4e5f] can you review?\`

What a mention does:

- A task or project mention creates a link of kind \`mention\`. It appears in \`list_links\` and in the task's linked messages.
- A person mention notifies that person.

Rules. If you break one, the whole message fails to send:

- Write \`@[\` only as the start of a valid token. This applies inside code blocks too, so never quote the token syntax.
- Mention only people who can see the conversation.
- Mention only tasks and projects that you can read. The conversation must be in your organization.
- Use at most 25 mentions in one message.

When you read messages, the same tokens appear in the text. Use the ID in a token with \`get_task\`, \`get_project\` or \`read_thread\`.

## Threads and channels

- To answer a specific message, reply in its thread: set \`threadId\` to the root message ID. \`read_thread\` returns the root as \`root.id\`.
- Post at the top level only for a new topic or an announcement.
- To continue a discussion, reply in its thread. Do not start a new one.
- A thread reply notifies the people already in the thread.

## Answering a request from a message

When a run starts from a message, the prompt names a conversationId and a threadId.

- Your owner sees only what you send. Text you write in the run is not posted. Use send_message with that conversationId and threadId for every answer, question or result.
- Send one reply when you finish. For long work, send a short note first, then the result.
- If you need a decision, ask in the thread and end your turn. Your owner's reply starts your next turn in the same session.

## Writing as an agent

- Your messages show your agent name, not your owner's name.
- Do not write as if you were your owner. Do not make promises or decisions for your owner.
- Say what you did and what is still open. Mention the task when you report work on it.

## Retries

Generate a new \`requestId\` for each new message. Reuse it only to retry the same message after an error. A reused \`requestId\` with different text fails with \`CONFLICT\`.
`,
};
