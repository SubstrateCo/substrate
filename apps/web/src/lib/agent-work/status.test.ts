import {
  agentHeaderStatus,
  agentStatus,
  attentionFallback,
  attentionReasonText,
  itemStatus,
  queueAhead,
  silentLabel,
  steeredLabel,
  turnLabel,
  turnOrb,
  turnTone,
  type ItemContext,
} from "./status";
import { item, status, turn } from "./test-support";
import { formatDuration, ordinal } from "./time";
import { describe, expect, test } from "bun:test";

const now = Date.parse("2026-11-08T10:01:05Z");
const started = { startedAt: "2026-11-08T10:00:00Z" };
const turnStatus = (...[value, at, request]: Parameters<typeof turnLabel>) => ({
  tone: turnTone(value, request),
  label: turnLabel(value, at, request),
});

describe("turn labels", () => {
  test("an open request comes before every other state", () => {
    expect(turnStatus(turn(started), now, { kind: "proposal" })).toEqual({
      tone: "attention",
      label: "Needs your approval",
    });
    expect(turnStatus(turn(started), now, { kind: "question" }).label).toBe("Needs your answer");
  });

  test("working time counts from the start and stops when the turn ends", () => {
    expect(turnStatus(turn(started), now).label).toBe("Working · 1m 05s");
    expect(turnStatus(turn({ ...started, status: "waiting" }), now).label).toBe("Working · 1m 05s");
    expect(
      turnStatus(
        turn({
          ...started,
          status: "completed",
          outcome: "replied",
          finishedAt: "2026-11-08T10:02:40Z",
        }),
        now,
      ),
    ).toEqual({ tone: "done", label: "Worked for 2m 40s" });
  });

  test("a resumed turn says it resumed after an interruption", () => {
    expect(turnStatus(turn({ ...started, attempt: 2 }), now).label).toBe(
      "Resumed after interruption · 1m 05s",
    );
  });

  test("a turn that needs attention says it stopped and needs the owner", () => {
    expect(turnStatus(turn({ status: "needs_attention" }), now)).toEqual({
      tone: "attention",
      label: "Stopped · needs you",
    });
  });

  test("a silent turn is muted and says it found nothing to report", () => {
    expect(turnStatus(turn({ status: "completed", outcome: "silent" }), now)).toEqual({
      tone: "muted",
      label: silentLabel,
    });
  });
});

describe("orb animation", () => {
  test("each live state has its own animation; an open request listens for the owner", () => {
    expect(turnOrb(turn({ status: "assigned" }))).toBe("connecting");
    expect(turnOrb(turn(started))).toBe("solving");
    expect(turnOrb(turn({ ...started, status: "waiting" }))).toBe("listening");
    expect(turnOrb(turn(started), { kind: "question" })).toBe("listening");
    expect(turnOrb(turn({ status: "stopping" }))).toBe("breathing");
  });

  test("ended work shows no orb, even with a request still open", () => {
    expect(turnOrb(turn({ status: "completed", outcome: "replied" }))).toBeNull();
    expect(turnOrb(turn({ status: "needs_attention" }), { kind: "question" })).toBeNull();
    expect(turnOrb(turn({ status: "failed" }))).toBeNull();
  });
});

describe("inbox item labels", () => {
  const context: ItemContext = { agentName: "Researcher", ahead: 0, busy: false };

  test("a held owner message waits for the busy agent and offers Send now", () => {
    expect(itemStatus(item({ held: true }), context)).toEqual({
      tone: "idle",
      label: "Waiting · Researcher is busy",
      sendNow: true,
      uncertain: false,
    });
  });

  test("a steered message says it joined the current work", () => {
    expect(itemStatus(item({ status: "submitted" }), context).label).toBe(steeredLabel);
  });

  test("a queued message shows its place in line, or that other work runs first", () => {
    expect(itemStatus(item(), { ...context, ahead: 1 }).label).toBe("Queued · 2nd in line");
    expect(itemStatus(item(), { ...context, busy: true }).label).toBe("Queued · after other work");
  });

  test("a message for an agent on another desktop says why it waits", () => {
    expect(
      itemStatus(item(), { ...context, device: { id: "d", name: "MacBook", online: false } }).label,
    ).toBe("Waiting for MacBook · offline");
    expect(itemStatus(item(), { ...context, device: null }).label).toBe(
      "No desktop runs this agent",
    );
  });

  test("a message the agent may not have seen offers Resend and Discard, not Send now", () => {
    expect(itemStatus(item({ status: "uncertain" }), context)).toEqual({
      tone: "attention",
      label: "We couldn’t confirm Researcher received this message",
      sendNow: false,
      uncertain: true,
    });
    expect(itemStatus(item(), context).uncertain).toBe(false);
  });
});

describe("attention reasons", () => {
  test("uncertain input says the message may not have arrived", () => {
    expect(attentionReasonText("uncertain_input", "Researcher")).toBe(
      "We couldn’t confirm Researcher received this message",
    );
  });

  test("a missing reason gets the general text", () => {
    expect(attentionReasonText(null, "Researcher")).toBe(attentionFallback);
  });
});

describe("queue position", () => {
  test("counts other sessions whose oldest waiting owner item is older", () => {
    const items = [
      item({ id: "a", sessionId: "s1", availableAt: "2026-11-08T10:00:00Z" }),
      item({ id: "b", sessionId: "s2", availableAt: "2026-11-08T10:00:01Z" }),
      item({ id: "c", sessionId: "s3", availableAt: "2026-11-08T10:00:02Z" }),
      item({ id: "d", sessionId: "s3", availableAt: "2026-11-08T09:59:00Z", held: true }),
      item({ id: "e", sessionId: "s4", availableAt: "2026-11-08T09:00:00Z", lane: "background" }),
    ];
    expect(queueAhead(items[2]!, items)).toBe(2);
    expect(queueAhead(items[0]!, items)).toBe(0);
  });
});

describe("derived agent status", () => {
  test("no device, offline device, and live work read as the server derived them", () => {
    expect(agentStatus(status({ device: null })).label).toBe("No desktop runs this agent");
    expect(
      agentStatus(status({ state: "queued", device: { id: "d", name: "MacBook", online: false } }))
        .label,
    ).toBe("Waiting for MacBook · offline");
    expect(agentStatus(status({ state: "working", activity: "Reading files" })).label).toBe(
      "Working on MacBook · Reading files",
    );
    expect(agentStatus(status({ state: "needs_you" })).tone).toBe("attention");
  });
});

describe("agent page header status", () => {
  test("idle shows nothing; other states show one short word", () => {
    expect(agentHeaderStatus(status(), "dm")).toBeNull();
    expect(agentHeaderStatus(status({ state: "needs_you" }), "dm")).toMatchObject({
      tone: "attention",
      label: "Needs you",
    });
    expect(agentHeaderStatus(status({ state: "queued", queuedCount: 1 }), "dm")?.label).toBe(
      "Queued",
    );
    expect(agentHeaderStatus(status({ state: "queued", queuedCount: 3 }), "dm")?.label).toBe(
      "Queued · 3",
    );
    expect(agentHeaderStatus(status({ device: null }), "dm")?.label).toBe(
      "No desktop runs this agent",
    );
    expect(
      agentHeaderStatus(
        status({ state: "working", device: { id: "d", name: "MacBook", online: false } }),
        "dm",
      )?.label,
    ).toBe("MacBook is offline");
  });

  test("working names its place only when that place is not this page's conversation", () => {
    const working = (liveConversationId: string | null) =>
      agentHeaderStatus(
        status({ state: "working", liveConversationId, activity: "Reading files" }),
        "dm",
      );
    expect(working("dm")).toEqual({
      tone: "working",
      label: "Working",
      orb: "solving",
      elsewhereConversationId: null,
    });
    expect(working("channel")?.elsewhereConversationId).toBe("channel");
    // The server leaves out places the owner can no longer open.
    expect(working(null)?.elsewhereConversationId).toBeNull();
  });
});

describe("times", () => {
  test.each([
    [-5000, "0s"],
    [45_900, "45s"],
    [59_999, "59s"],
    [60_000, "1m 00s"],
    [185_000, "3m 05s"],
    [3_599_999, "59m 59s"],
    [3_600_000, "1h 00m 00s"],
    [3_720_000, "1h 02m 00s"],
    [4_986_000, "1h 23m 06s"],
  ])("formats %pms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  test.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [22, "22nd"],
  ])("ordinal %p is %s", (value, text) => {
    expect(ordinal(value)).toBe(text);
  });
});
