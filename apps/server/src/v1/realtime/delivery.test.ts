import { realtimeKeys } from "@startup-os/contracts/realtime";
import type { RealtimeEvent } from "@startup-os/contracts/realtime";

import { createRealtimeHub } from "./hub";
import type { Transport } from "./hub";
import { expect, test } from "bun:test";

test("publishes without polling and isolates a failed recipient", async () => {
  const failures: boolean[] = [];
  const hub = createRealtimeHub({
    authenticate: async () => ({ userId: "user", organizationId: "org", actorId: "actor" }),
    recipients: async () => () => true,
    reportFailure: () => failures.push(true),
  });
  const received: RealtimeEvent[] = [];
  for (const broken of [true, false]) {
    const connection = await hub.reserve(new Headers(), "org");
    if (!connection) throw new Error("Missing connection");
    const transport: Transport = {
      send: (data) => {
        const event: RealtimeEvent = JSON.parse(data);
        if (event.type === "change") {
          if (broken) throw new Error("Socket closed");
          received.push(event);
        }
        return data.length;
      },
      close: () => {},
      terminate: () => {},
      ping: () => {},
      bufferedAmount: () => 0,
    };
    await hub.open(connection, transport);
  }
  await hub.publish({
    id: crypto.randomUUID(),
    audience: realtimeKeys.organization("org"),
    domain: "tasks",
  });
  expect(received).toMatchObject([{ type: "change", domain: "tasks" }]);
  expect(failures).toHaveLength(1);
  expect(hub.size).toBe(1);
  hub.stop();
});
