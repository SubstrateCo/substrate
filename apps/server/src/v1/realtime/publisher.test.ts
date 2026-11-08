import { realtimeKeys } from "@startup-os/contracts/realtime";

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
