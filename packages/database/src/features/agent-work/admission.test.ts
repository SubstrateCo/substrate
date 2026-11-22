import { sessionKeys, wakeDedupeKeys } from "@substrate/contracts/agent-work";

import {
  decideAdmission,
  type AdmissionDecision,
  type CallerFacts,
  type InvocationRecord,
  type MessageFacts,
  type MessageTrigger,
  type RequestTrigger,
} from "./admission";
import { expect, test } from "bun:test";

const agent = { actorId: "a1", organizationId: "o1", userAgentId: "ua1", ownerUserId: "alice" };
const message = { id: "m2", conversationId: "c1", threadId: "m1", body: "" };
const owner = { kind: "human" as const, userId: "alice" };
const facts: MessageFacts = { agent, mentioned: false, disabled: [] };

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
  ["a mention wins over a DM", sent(owner, "dm"), { mentioned: true }, admitted("mention", dm)],
  ["an owner's DM wakes the agent", sent(owner, "dm"), {}, admitted("direct_message", dm)],
  [
    "an owner's thread reply without a mention does not start another turn",
    sent(owner, "group"),
    {},
    { type: "deny", reason: "not_triggered" },
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
    { mentioned: true, disabled: ["thread_reply"] },
    admitted("mention", thread),
  ],
];

for (const [name, trigger, overrides, expected] of messageCases)
  test(`message: ${name}`, () => {
    expect(
      decideAdmission({ type: "message", trigger, facts: { ...facts, ...overrides } }),
    ).toEqual(expected);
  });

const bob = { kind: "human" as const, userId: "bob" };
const caller: CallerFacts = {
  policy: "anyone",
  member: true,
  actorId: "bob-actor",
  ownerCanSee: true,
  allowlisted: false,
  pending: 0,
  admittedToday: 0,
  invocationId: "i1",
};
const call = (event: InvocationRecord["event"], overrides: Partial<InvocationRecord> = {}) => ({
  id: "i1",
  event,
  kind: "mention" as const,
  policy: "anyone" as const,
  allowlisted: false,
  ...overrides,
});
const calledNow = (invocation: InvocationRecord): AdmissionDecision => ({
  type: "admit",
  source: "caller_message",
  sourceRef: { invocationId: "i1" },
  sessionKey: thread,
  dedupeKey: wakeDedupeKeys.call("i1"),
  invocation,
});

const callerCases: [
  string,
  MessageTrigger["conversationKind"],
  Partial<MessageFacts>,
  Partial<CallerFacts>,
  AdmissionDecision,
][] = [
  [
    "anyone: a member's mention runs now",
    "channel",
    { mentioned: true },
    {},
    calledNow(call("admit")),
  ],
  [
    "ask: a member's mention waits for the owner",
    "group",
    { mentioned: true },
    { policy: "ask" },
    { type: "needs_approval", sessionKey: thread, invocation: call("hold", { policy: "ask" }) },
  ],
  [
    "ask: an allowlisted member's mention runs now",
    "channel",
    { mentioned: true },
    { policy: "ask", allowlisted: true },
    calledNow(call("admit", { policy: "ask", allowlisted: true })),
  ],
  [
    "a person outside the agent's organization is never a caller",
    "channel",
    { mentioned: true },
    { member: false, actorId: null },
    { type: "deny", reason: "not_member" },
  ],
  [
    "callers cannot reach someone else's agent in a DM",
    "dm",
    { mentioned: true },
    {},
    { type: "deny", reason: "direct_message" },
  ],
  [
    "a conversation the owner cannot see never wakes the agent for a caller",
    "channel",
    { mentioned: true },
    { ownerCanSee: false },
    { type: "deny", reason: "owner_cannot_see" },
  ],
  [
    "a caller's thread reply without a mention does not start work",
    "channel",
    {},
    {},
    { type: "deny", reason: "not_triggered" },
  ],
  [
    "the owner's disabled mention trigger applies to callers",
    "channel",
    { mentioned: true, disabled: ["mention"] },
    {},
    { type: "deny", reason: "not_triggered" },
  ],
  [
    "a fourth pending call of the same caller is rate limited",
    "channel",
    { mentioned: true },
    { policy: "ask", pending: 3 },
    { type: "deny", reason: "rate_limited", invocation: call("limit", { policy: "ask" }) },
  ],
  [
    "the agent's daily cap of admitted calls is rate limited",
    "channel",
    { mentioned: true },
    { admittedToday: 100 },
    { type: "deny", reason: "rate_limited", invocation: call("limit") },
  ],
];

for (const [name, conversationKind, overrides, callerOverrides, expected] of callerCases)
  test(`caller: ${name}`, () => {
    expect(
      decideAdmission({
        type: "message",
        trigger: { ...sent(bob, conversationKind), message: { ...message, threadId: "m1" } },
        facts: { ...facts, ...overrides, caller: { ...caller, ...callerOverrides } },
      }),
    ).toEqual(expected);
  });

test("caller: an agent author never wakes an agent, even one that accepts callers", () => {
  expect(
    decideAdmission({
      type: "message",
      trigger: sent({ kind: "agent", actorEntityId: "a2" }, "channel"),
      facts: { ...facts, mentioned: true, caller },
    }),
  ).toEqual({ type: "deny", reason: "agent_author" });
});

test("invocation: an approved call wakes the agent in the call's session, once", () => {
  const invocation = { ...request, id: "i1" };
  expect(
    decideAdmission({
      type: "invocation",
      trigger: { type: "invocation", invocation },
      facts: { agent },
    }),
  ).toEqual({
    type: "admit",
    source: "caller_message",
    sourceRef: { invocationId: "i1" },
    sessionKey: thread,
    dedupeKey: wakeDedupeKeys.call("i1"),
  });
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
