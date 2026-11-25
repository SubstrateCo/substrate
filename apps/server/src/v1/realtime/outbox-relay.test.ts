import { realtimeKeys } from "@substrate/contracts/realtime";

import { createOutboxRelay } from "./outbox-relay";
import { expect, test } from "bun:test";

const hint = { audience: realtimeKeys.organization("org"), domain: "tasks" as const };
const batch = (id: string) => ({ id, changes: [{ ...hint, id: `event-${id}` }] });

function relay(queue: ReturnType<typeof batch>[], failSends = 0) {
  const sent: string[] = [];
  const finished: string[] = [];
  let failures = failSends;
  const worker = createOutboxRelay(
    {
      claim: async () => queue.splice(0, 2),
      send: async (message) => {
        if (failures-- > 0) throw new Error("Valkey unavailable");
        sent.push(message);
      },
      finish: async (id) => {
        finished.push(id);
      },
      reportFailure: () => {},
    },
    { claimLimit: 2 },
  );
  return { worker, sent, finished };
}

test("the relay drains a backlog larger than one claim in one run", async () => {
  const queue = [batch("a"), batch("b"), batch("c")];
  const { worker, sent, finished } = relay(queue);
  await worker.trigger();
  expect(finished).toEqual(["a", "b", "c"]);
  expect(sent.map((message) => JSON.parse(message)[0].id)).toEqual([
    "event-a",
    "event-b",
    "event-c",
  ]);
});

test("a failed publish stops the run and leaves the batch for its next attempt", async () => {
  const queue = [batch("a"), batch("b")];
  const { worker, finished } = relay(queue, 1);
  await worker.trigger();
  expect(finished).toEqual([]);
});
