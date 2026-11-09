import { itemPlacements, requestPlacements, turnPlacements } from "./placement";
import { conversationId, item, output, request, source, turn } from "./test-support";
import { describe, expect, test } from "bun:test";

const ids = (placements: Map<string, { id: string }[]>) =>
  Object.fromEntries(
    [...placements].map(([messageId, list]) => [messageId, list.map((x) => x.id)]),
  );

describe("turn placement", () => {
  test("work shows under its latest reply in this conversation, not under its source", () => {
    const { placements } = turnPlacements(
      [
        turn({
          sourceMessages: [source("ask", "2026-11-08T10:00:00Z")],
          outputs: [
            output("first", "2026-11-08T10:01:00Z"),
            output("latest", "2026-11-08T10:02:00Z"),
            output("elsewhere", "2026-11-08T10:03:00Z", "other"),
          ],
        }),
      ],
      conversationId,
    );
    expect(ids(placements)).toEqual({ latest: ["turn"] });
  });

  test("before any reply, work shows under the newest source message here", () => {
    const { placements } = turnPlacements(
      [
        turn({
          sourceMessages: [
            source("older", "2026-11-08T10:00:00Z"),
            source("newer", "2026-11-08T10:00:05Z"),
            source("other-conversation", "2026-11-08T10:00:09Z", "other"),
          ],
        }),
      ],
      conversationId,
    );
    expect(ids(placements)).toEqual({ newer: ["turn"] });
  });

  test("an answer turn shows under the anchor of the request it continues", () => {
    const { placements } = turnPlacements(
      [turn({ requestAnchors: [{ requestId: "request", anchorMessageId: "question" }] })],
      conversationId,
    );
    expect(ids(placements)).toEqual({ question: ["turn"] });
  });

  test("a recovery turn shows where the turn it resumes shows", () => {
    const { placements } = turnPlacements(
      [
        turn({ id: "first", sourceMessages: [source("ask", "2026-11-08T10:00:00Z")] }),
        turn({ id: "resume", resumesTurnId: "first", createdAt: "2026-11-08T10:05:00Z" }),
      ],
      conversationId,
    );
    expect(ids(placements)).toEqual({ ask: ["first", "resume"] });
  });

  test("a resume cycle does not loop and leaves the turns without a place", () => {
    const { placements } = turnPlacements(
      [turn({ id: "a", resumesTurnId: "b" }), turn({ id: "b", resumesTurnId: "a" })],
      conversationId,
    );
    expect(placements.size).toBe(0);
  });

  test("routine work without a message here has no place in the conversation", () => {
    const { placements, anchors } = turnPlacements(
      [turn({ sessionKind: "routine", kind: "unattended" })],
      conversationId,
    );
    expect(placements.size).toBe(0);
    expect(anchors.size).toBe(0);
  });

  test("several turns under one message are grouped oldest first", () => {
    const { placements } = turnPlacements(
      [
        turn({
          id: "second",
          createdAt: "2026-11-08T10:05:00Z",
          sourceMessages: [source("ask", "2026-11-08T10:00:00Z")],
        }),
        turn({ id: "first", sourceMessages: [source("ask", "2026-11-08T10:00:00Z")] }),
      ],
      conversationId,
    );
    expect(ids(placements)).toEqual({ ask: ["first", "second"] });
  });
});

describe("inbox item placement", () => {
  test("waiting owner messages show under themselves; items a turn started show in that turn", () => {
    const waiting = item({ id: "waiting" });
    const started = item({
      id: "started",
      sourceRef: { source: "owner_message", messageId: "m2", conversationId, threadId: null },
    });
    const elsewhere = item({
      id: "elsewhere",
      sourceRef: {
        source: "owner_message",
        messageId: "m3",
        conversationId: "other",
        threadId: null,
      },
    });
    const placements = itemPlacements(
      [waiting, started, elsewhere],
      [turn({ itemIds: ["started"] })],
      conversationId,
    );
    expect(ids(placements)).toEqual({ m1: ["waiting"] });
  });
});

describe("request placement", () => {
  test("a request shows under its anchor, else under its turn's place", () => {
    const { cards } = requestPlacements(
      [
        request({ id: "anchored" }),
        request({
          id: "turn-placed",
          turnId: "t2",
          place: {
            access: "visible",
            conversationId,
            threadId: null,
            conversationName: "Researcher",
            anchorMessageId: null,
          },
        }),
      ],
      new Map([["t2", "ask"]]),
      conversationId,
    );
    expect(ids(cards)).toEqual({ reply: ["anchored"], ask: ["turn-placed"] });
  });

  test("hidden requests and requests of other conversations never show here", () => {
    const { cards } = requestPlacements(
      [
        request({ id: "hidden", place: { access: "hidden" } }),
        request({
          id: "other",
          place: {
            access: "visible",
            conversationId: "other",
            threadId: null,
            conversationName: "General",
            anchorMessageId: "reply",
          },
        }),
      ],
      new Map<string, string>(),
      conversationId,
    );
    expect(cards.size).toBe(0);
  });

  test("an executed proposal links back from the message it created", () => {
    const { backlinks } = requestPlacements(
      [
        request({
          kind: "proposal",
          status: "executed",
          place: {
            access: "visible",
            conversationId: "dm",
            threadId: null,
            conversationName: "DM",
            anchorMessageId: null,
          },
          proposal: {
            action: {
              type: "reply_elsewhere",
              input: { conversationId: crypto.randomUUID(), body: "Update" },
            },
            actionHash: "hash",
            outcome: {
              status: "executed",
              receipt: { kind: "message", id: "created", conversationId, threadId: null },
            },
          },
        }),
      ],
      new Map<string, string>(),
      conversationId,
    );
    expect(ids(backlinks)).toEqual({ created: ["request"] });
  });
});
