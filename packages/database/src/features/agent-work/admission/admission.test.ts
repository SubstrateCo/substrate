import { sessionKeys, wakeDedupeKeys } from "@substrate/contracts/agent-work";

import {
  decideAdmission,
  type AdmissionDecision,
  type HostTrigger,
  type MessageFacts,
  type MessageTrigger,
  type RequestTrigger,
  type ThreadTurnFacts,
} from "./admission";
import { expect, test } from "bun:test";

const agent = { actorId: "a1", organizationId: "o1", userAgentId: "ua1", ownerUserId: "alice" };
const sentAt = new Date("2026-11-01T10:00:00Z");
const message = { id: "m2", conversationId: "c1", threadId: "m1", body: "", createdAt: sentAt };
const owner = { kind: "human" as const, userId: "alice" };
const facts: MessageFacts = {
  agent,
  mentioned: false,
  participatedInThread: false,
  disabled: [],
  threadTurn: null,
};

const sent = (
  author: MessageTrigger["author"],
  conversationKind: MessageTrigger["conversationKind"],
): MessageTrigger => ({ type: "message", organizationId: "o1", author, message, conversationKind });

const thread = sessionKeys.thread("m1");
const dm = sessionKeys.dm("c1");

const admitted = (key: string): AdmissionDecision => ({
  type: "admit",
  source: "owner_message",
  sourceRef: { source: "owner_message", messageId: "m2", conversationId: "c1", threadId: "m1" },
  session:
    key === dm
      ? { key, kind: "dm", origin: { conversationId: "c1", threadId: null } }
      : { key, kind: "thread", origin: { conversationId: "c1", threadId: "m1" } },
  dedupeKey: wakeDedupeKeys.message("m2"),
  body: null,
});

const messageCases: [string, MessageTrigger, Partial<MessageFacts>, AdmissionDecision][] = [
  [
    "the agent's own message never gives it work",
    sent({ kind: "agent", actorEntityId: "a1" }, "dm"),
    { mentioned: true },
    { type: "deny", reason: "own_message" },
  ],
  [
    "another agent never starts work, even when it mentions the agent",
    sent({ kind: "agent", actorEntityId: "a2" }, "dm"),
    { mentioned: true },
    { type: "deny", reason: "agent_author" },
  ],
  [
    "another person never starts work",
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
  ["a mention wins over a DM", sent(owner, "dm"), { mentioned: true }, admitted(dm)],
  ["an owner's DM admits work", sent(owner, "dm"), {}, admitted(dm)],
  [
    "an owner's thread reply does not admit work for an agent that never joined",
    sent(owner, "group"),
    {},
    { type: "deny", reason: "not_triggered" },
  ],
  [
    "a disabled winning kind stops the work without falling back",
    sent(owner, "dm"),
    { mentioned: true, disabled: ["mention"] },
    { type: "deny", reason: "not_triggered" },
  ],
  [
    "a disabled weaker kind does not stop a stronger one",
    sent(owner, "channel"),
    { mentioned: true, disabled: ["thread_reply"] },
    admitted(thread),
  ],
];

for (const [name, trigger, overrides, expected] of messageCases)
  test(`message: ${name}`, () => {
    expect(
      decideAdmission({ type: "message", trigger, facts: { ...facts, ...overrides } }),
    ).toEqual(expected);
  });

test("an unmentioned human follow-up admits work for a participating agent in the same thread", () => {
  expect(
    decideAdmission({
      type: "message",
      trigger: sent(owner, "channel"),
      facts: { ...facts, participatedInThread: true },
    }),
  ).toEqual(admitted(thread));
});

test("a mention of another agent narrows the follow-up's recipients", () => {
  expect(
    decideAdmission({
      type: "message",
      trigger: {
        ...sent(owner, "channel"),
        message: { ...message, body: "@[agent:00000000-0000-4000-8000-000000000001] check this" },
      },
      facts: { ...facts, participatedInThread: true },
    }),
  ).toEqual({ type: "deny", reason: "not_triggered" });
});

const liveTurn: ThreadTurnFacts = {
  id: "t1",
  kind: "interactive",
  status: "running",
  handoff: false,
  since: new Date(sentAt.getTime() - 60_000),
  passiveBatches: 0,
};

const passive: AdmissionDecision = {
  type: "admit",
  source: "thread_context",
  sourceRef: {
    source: "thread_context",
    messageIds: ["m2"],
    targetTurnId: "t1",
    conversationId: "c1",
    threadId: "m1",
  },
  session: { key: thread, kind: "thread", origin: { conversationId: "c1", threadId: "m1" } },
  dedupeKey: wakeDedupeKeys.threadContext("t1", "m2"),
  body: null,
};

test("another person's or agent's thread message joins the live interactive thread turn as passive context", () => {
  for (const author of [
    { kind: "human" as const, userId: "bob" },
    { kind: "agent" as const, actorEntityId: "a2" },
  ])
    expect(
      decideAdmission({
        type: "message",
        trigger: sent(author, "channel"),
        facts: { ...facts, mentioned: true, participatedInThread: true, threadTurn: liveTurn },
      }),
    ).toEqual(passive);
});

const passiveCases: [string, Partial<MessageFacts>, Partial<ThreadTurnFacts>][] = [
  ["the turn is unattended", {}, { kind: "unattended" }],
  ["the turn hands its epoch off", {}, { handoff: true }],
  ["the turn is stopping", {}, { status: "stopping" }],
  ["the turn already has 20 batches", {}, { passiveBatches: 20 }],
  ["the turn started 10 minutes ago", {}, { since: new Date(sentAt.getTime() - 10 * 60_000) }],
  ["thread follow-ups are off", { disabled: ["thread_reply"] }, {}],
];

for (const [name, overrides, turn] of passiveCases)
  test(`passive context does not join when ${name}`, () => {
    expect(
      decideAdmission({
        type: "message",
        trigger: sent({ kind: "human", userId: "bob" }, "channel"),
        facts: { ...facts, ...overrides, threadTurn: { ...liveTurn, ...turn } },
      }),
    ).toEqual({ type: "deny", reason: "not_owner" });
  });

test("messages outside a thread, or in a DM, are never passive context", () => {
  for (const [trigger] of [
    [
      {
        ...sent({ kind: "human", userId: "bob" }, "channel"),
        message: { ...message, threadId: null },
      },
    ],
    [sent({ kind: "human", userId: "bob" }, "dm")],
  ] as const)
    expect(
      decideAdmission({ type: "message", trigger, facts: { ...facts, threadTurn: liveTurn } }),
    ).toEqual({ type: "deny", reason: "not_owner" });
});

test("an owner follow-up that admits work is never passive context too", () => {
  expect(
    decideAdmission({
      type: "message",
      trigger: sent(owner, "channel"),
      facts: { ...facts, participatedInThread: true, threadTurn: liveTurn },
    }),
  ).toEqual(admitted(thread));
});

// Request and host items parse their session keys, which hold real IDs.
const rootId = crypto.randomUUID();
const dmId = crypto.randomUUID();
const request = {
  id: "r1",
  organizationId: "o1",
  userAgentId: "ua1",
  agentActorEntityId: "a1",
  ownerUserId: "alice",
  sessionKey: sessionKeys.thread(rootId),
  anchorMessageId: "m2",
  conversationId: "c1",
};

const requestCases: [RequestTrigger["source"], string][] = [
  ["answer", wakeDedupeKeys.answer("r1")],
  ["approval_result", wakeDedupeKeys.approval("r1")],
];

for (const [source, dedupeKey] of requestCases)
  test(`request: ${source} admits work in the request's session, once per kind`, () => {
    const trigger: RequestTrigger = { type: "request", source, request };
    const place = { conversationId: "c1", threadId: rootId };
    expect(decideAdmission({ type: "request", trigger, facts: { place } })).toEqual({
      type: "admit",
      source,
      sourceRef: { source, requestId: "r1", anchorMessageId: "m2" },
      session: { key: sessionKeys.thread(rootId), kind: "thread", origin: place },
      dedupeKey,
      body: null,
    });
  });

const epoch: HostTrigger = {
  type: "host",
  source: "epoch",
  deviceId: "d1",
  session: { ...request, id: "s1", key: sessionKeys.dm(dmId) },
  fromEpoch: 3,
  body: "Hand off",
};

test("host items are admitted only from the agent's home device", () => {
  expect(decideAdmission({ type: "host", trigger: epoch, facts: { homeDeviceId: "d1" } })).toEqual({
    type: "admit",
    source: "epoch",
    sourceRef: { source: "epoch", fromEpoch: 3 },
    session: { key: sessionKeys.dm(dmId), kind: "dm" },
    dedupeKey: wakeDedupeKeys.epoch("s1", 3),
    body: "Hand off",
  });
  for (const homeDeviceId of ["d2", null])
    expect(decideAdmission({ type: "host", trigger: epoch, facts: { homeDeviceId } })).toEqual({
      type: "deny",
      reason: "not_homed",
    });
  // The server's own resume note for a lost turn needs no device.
  const resume: HostTrigger = {
    ...epoch,
    source: "recovery",
    deviceId: null,
    turn: { id: "t1", attempt: 2 },
  };
  expect(
    decideAdmission({ type: "host", trigger: resume, facts: { homeDeviceId: "d2" } }),
  ).toMatchObject({
    type: "admit",
    source: "recovery",
    dedupeKey: wakeDedupeKeys.recovery("t1", 2),
  });
});
