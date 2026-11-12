import { sessionKeys, wakeDedupeKeys } from "@substrate/contracts/agent-work";

import {
  decideAdmission,
  type AdmissionDecision,
  type MessageFacts,
  type MessageTrigger,
  type RequestTrigger,
} from "./admission";
import { expect, test } from "bun:test";

const agent = { actorId: "a1", organizationId: "o1", userAgentId: "ua1", ownerUserId: "alice" };
const message = { id: "m2", conversationId: "c1", threadId: "m1", body: "" };
const owner = { kind: "human" as const, userId: "alice" };
const facts: MessageFacts = { agent, mentioned: false, workedInThread: false, disabled: [] };

const sent = (
  author: MessageTrigger["author"],
  conversationKind: MessageTrigger["conversationKind"],
): MessageTrigger => ({ type: "message", organizationId: "o1", author, message, conversationKind });

const admitted = (
  kind: "mention" | "direct_message" | "thread_reply",
  sessionKey: string,
): AdmissionDecision => ({
  type: "admit",
  source: "owner_message",
  sourceRef: { messageId: "m2", conversationId: "c1", threadId: "m1", kind },
  sessionKey,
  dedupeKey: wakeDedupeKeys.message("m2"),
});

const thread = sessionKeys.thread("m1");
const dm = sessionKeys.dm("c1");

const messageCases: [string, MessageTrigger, Partial<MessageFacts>, AdmissionDecision][] = [
  [
    "an agent author never wakes, even when it mentions the agent",
    sent({ kind: "agent", actorEntityId: "a2" }, "dm"),
    { mentioned: true },
    { type: "deny", reason: "agent_author" },
  ],
  [
    "another person never wakes the agent",
    sent({ kind: "human", userId: "bob" }, "dm"),
    { mentioned: true },
    { type: "deny", reason: "not_owner" },
  ],
  [
    "an owner message that does not address the agent",
    sent(owner, "channel"),
    {},
    { type: "deny", reason: "not_triggered" },
  ],
  [
    "a mention wins over a DM and a worked thread",
    sent(owner, "dm"),
    { mentioned: true, workedInThread: true },
    admitted("mention", dm),
  ],
  [
    "a DM wins over a worked thread",
    sent(owner, "dm"),
    { workedInThread: true },
    admitted("direct_message", dm),
  ],
  [
    "a reply in a thread the agent worked in uses the thread root session",
    sent(owner, "group"),
    { workedInThread: true },
    admitted("thread_reply", thread),
  ],
  [
    "a disabled winning kind stops the wake without falling back",
    sent(owner, "dm"),
    { mentioned: true, disabled: ["mention"] },
    { type: "deny", reason: "not_triggered" },
  ],
  [
    "a disabled weaker kind does not stop a stronger one",
    sent(owner, "channel"),
    { mentioned: true, workedInThread: true, disabled: ["thread_reply"] },
    admitted("mention", thread),
  ],
];

for (const [name, trigger, overrides, expected] of messageCases)
  test(`message: ${name}`, () => {
    expect(
      decideAdmission({ type: "message", trigger, facts: { ...facts, ...overrides } }),
    ).toEqual(expected);
  });

const request = {
  id: "r1",
  organizationId: "o1",
  userAgentId: "ua1",
  agentActorEntityId: "a1",
  ownerUserId: "alice",
  sessionKey: thread,
};

const requestCases: [RequestTrigger["source"], string][] = [
  ["answer", wakeDedupeKeys.answer("r1")],
  ["approval_result", wakeDedupeKeys.approval("r1")],
];

for (const [source, dedupeKey] of requestCases)
  test(`request: ${source} wakes the agent in the request's session, once per kind`, () => {
    const trigger: RequestTrigger = { type: "request", source, request };
    expect(decideAdmission({ type: "request", trigger, facts: { agent } })).toEqual({
      type: "admit",
      source,
      sourceRef: { requestId: "r1" },
      sessionKey: thread,
      dedupeKey,
    });
  });
