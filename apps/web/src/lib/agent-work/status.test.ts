import {
  agentStatus,
  attentionFallback,
  attentionReasonText,
  itemStatus,
  queueAhead,
  silentLabel,
  steeredLabel,
  turnStatus,
  type ItemContext,
} from "./status";
import { item, status, turn } from "./test-support";
import { formatDuration, ordinal } from "./time";
import { describe, expect, test } from "bun:test";

const now = Date.parse("2026-11-08T10:01:05Z");
const started = { startedAt: "2026-11-08T10:00:00Z" };

describe("turn labels", () => {
  test("an open request comes before every other state", () => {
    expect(turnStatus(turn(started), now, { kind: "proposal" })).toEqual({
      tone: "attention",
      label: "Needs your approval",
    });
    expect(turnStatus(turn(started), now, { kind: "question" }).label).toBe("Needs your answer");
  });

  test("working time counts from the start and stops when the turn ends", () => {
    expect(turnStatus(turn(started), now).label).toBe("Working for 1m 05s");
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
      "Resumed after interruption · working for 1m 05s",
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

describe("published agent status", () => {
  test("no device, offline device, and live work read as the desktop reported them", () => {
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

describe("times", () => {
  test.each([
    [-5000, "0s"],
    [45_900, "45s"],
    [185_000, "3m 05s"],
    [3_720_000, "1h 02m"],
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
