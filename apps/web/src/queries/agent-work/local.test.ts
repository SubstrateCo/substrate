import type { TurnEventView } from "@substrate/contracts/agent-work";
import { turnEventsPageSize } from "@substrate/contracts/agent-work/desktop";

import { loadTurnEvents } from "./local";
import { expect, test } from "bun:test";

function event(seq: number): TurnEventView {
  return {
    turnId: "turn",
    seq,
    attempt: 1,
    kind: "activity",
    itemId: null,
    data: { text: `step ${seq}` },
    createdAt: new Date(seq).toISOString(),
  };
}

/** A bridge that pages like the desktop: events after a seq, one page at a time. */
function bridge(stored: TurnEventView[]) {
  const requests: number[] = [];
  return {
    requests,
    read: async (after: number) => {
      requests.push(after);
      return stored.filter((item) => item.seq > after).slice(0, turnEventsPageSize);
    },
  };
}

const sequence = (count: number) => Array.from({ length: count }, (_, index) => event(index + 1));

test("loads every event of a turn that is longer than one page", async () => {
  const stored = sequence(turnEventsPageSize * 2 + 5);
  const source = bridge(stored);

  const events = await loadTurnEvents(source.read);

  expect(events.map((item) => item.seq)).toEqual(stored.map((item) => item.seq));
});

test("a refetch reads only the events after the cached ones", async () => {
  const stored = sequence(turnEventsPageSize + 20);
  const cached = stored.slice(0, turnEventsPageSize + 10);
  const source = bridge(stored);

  const events = await loadTurnEvents(source.read, cached);

  expect(source.requests).toEqual([turnEventsPageSize + 10]);
  expect(events.map((item) => item.seq)).toEqual(stored.map((item) => item.seq));
});

test("an abandoned transcript does not request another page", async () => {
  const controller = new AbortController();
  const requests: number[] = [];
  const cancellation = new DOMException("Aborted", "AbortError");
  const result = loadTurnEvents(
    async (after) => {
      requests.push(after);
      controller.abort(cancellation);
      return after === 0 ? sequence(turnEventsPageSize) : [];
    },
    [],
    controller.signal,
  );
  expect(await result.catch((error) => error)).toBe(cancellation);
  expect(requests).toEqual([0]);
});

test("a cancelled transcript does not start reading", async () => {
  const controller = new AbortController();
  controller.abort();
  const source = bridge(sequence(1));
  expect(await loadTurnEvents(source.read, [], controller.signal).catch((error) => error)).toBe(
    controller.signal.reason,
  );
  expect(source.requests).toEqual([]);
});
