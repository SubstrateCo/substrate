import { realtimeKeys } from "@substrate/contracts/realtime";

import { createRefreshPublisher } from "./publisher";
import { expect, test } from "bun:test";

test("delivery failure does not turn a committed operation into an error", async () => {
  let failures = 0;
  const publish = createRefreshPublisher(
    async () => {
      throw new Error("Valkey unavailable");
    },
    () => {
      failures++;
    },
  );
  // A rejection here would fail the test; resolving keeps the committed operation successful.
  await publish([{ audience: realtimeKeys.organization("org"), domain: "tasks" }]);
  expect(failures).toBe(1);
});

function outboxFixture(available: boolean) {
  const sent: string[] = [];
  const recorded: unknown[][] = [];
  const finished: string[] = [];
  const publish = createRefreshPublisher(
    async (message) => {
      if (!available) throw new Error("Valkey unavailable");
      sent.push(message);
    },
    () => {},
    {
      record: async (hints) => {
        recorded.push(hints);
      },
      finish: async (id) => {
        finished.push(id);
      },
    },
  );
  return { sent, recorded, finished, publish };
}

const hint = { audience: realtimeKeys.organization("org"), domain: "tasks" as const };
const stored = { id: "row", changes: [{ ...hint, id: "event" }] };

test("a stored batch publishes with its stored event IDs, then leaves the outbox", async () => {
  const fixture = outboxFixture(true);
  await fixture.publish([hint], stored);
  expect(fixture.sent.map((message) => JSON.parse(message))).toEqual([stored.changes]);
  expect(fixture.finished).toEqual(["row"]);
});

test("a stored batch that fails to publish stays for the relay", async () => {
  const fixture = outboxFixture(false);
  await fixture.publish([hint], stored);
  expect(fixture.finished).toEqual([]);
  expect(fixture.recorded).toEqual([]);
});

test("a batch from outside a transaction is stored for the relay when publishing fails", async () => {
  const fixture = outboxFixture(false);
  await fixture.publish([hint]);
  expect(fixture.recorded).toEqual([[{ ...hint, id: expect.any(String) }]]);
});

test("publishes each committed batch with fresh event IDs and no record content", async () => {
  const messages: string[] = [];
  const publish = createRefreshPublisher(
    async (message) => {
      messages.push(message);
    },
    () => {},
  );
  const hints = [{ audience: realtimeKeys.organization("org"), domain: "tasks" as const }];
  await publish(hints);
  await publish(hints);
  const batches = messages.map((message) => JSON.parse(message));
  expect(batches[0]).toEqual([{ ...hints[0], id: expect.any(String) }]);
  expect(batches[1][0].id).not.toBe(batches[0][0].id);
});

test("routing lookup failure is isolated from the committed result", async () => {
  let failures = 0;
  const messages: string[] = [];
  const publish = createRefreshPublisher(
    async (message) => {
      messages.push(message);
    },
    () => {
      failures++;
    },
  );
  await publish(Promise.reject(new Error("lookup unavailable")));
  expect(messages).toEqual([]);
  expect(failures).toBe(1);
});
