import { realtimeKeys } from "@substrate/contracts/realtime";
import type { RealtimeEvent } from "@substrate/contracts/realtime";

import { createRealtimeHub } from "./hub";
import { createRefreshPublisher } from "./publisher";
import { createRealtimeSubscription } from "./subscription";
import { testReceiver } from "./test-support";
import { RedisClient } from "bun";
import { expect, test } from "bun:test";

test.skipIf(!process.env.TEST_VALKEY_URL)(
  "Valkey fan-out reaches both hubs, with local permission checks and recovery after a gap",
  async () => {
    const url = process.env.TEST_VALKEY_URL!;
    const topic = `substrate:realtime:test:${crypto.randomUUID()}`;
    const publisher = new RedisClient(url, { autoReconnect: false, enableOfflineQueue: false });
    const peers = ["org-a", "org-b"].map((organizationId) => {
      const received: RealtimeEvent[] = [];
      let next = Promise.withResolvers<void>();
      const hub = createRealtimeHub({
        authenticate: async () =>
          testReceiver({ userId: organizationId, organizationId, actorId: organizationId }),
        recipients: async (audience) => () =>
          audience[0] !== "conversation" || audience[1] === "shared" || organizationId === "org-a",
        reportFailure: () => {
          throw new Error("Unexpected delivery failure");
        },
      });
      const subscribe = () =>
        createRealtimeSubscription({
          url,
          topic,
          receive: (changes) => hub.publish(...changes),
          setAvailable: (available) => hub.setAvailable(available),
        });
      return {
        hub,
        received,
        subscribe,
        subscription: subscribe(),
        async connect() {
          next = Promise.withResolvers<void>();
          const connection = await hub.reserve(new Headers(), organizationId);
          if (!connection) throw new Error("Missing connection");
          await hub.open(connection, {
            send: (data) => {
              const event: RealtimeEvent = JSON.parse(data);
              received.push(event);
              if (event.type === "change") next.resolve();
              return data.length;
            },
            close: () => {},
            terminate: () => {},
            ping: () => {},
            bufferedAmount: () => 0,
          });
        },
        get delivered() {
          return next.promise;
        },
      };
    });
    const publish = createRefreshPublisher(
      async (message) => {
        await publisher.publish(topic, message);
      },
      () => {
        throw new Error("Unexpected publish failure");
      },
    );
    try {
      await publisher.connect();
      await Promise.all(
        peers.map(async (peer) => {
          await peer.subscription.start();
          await peer.connect();
        }),
      );
      await publish([{ audience: realtimeKeys.conversation("shared"), domain: "messaging" }]);
      await Promise.all(peers.map((peer) => peer.delivered));
      expect(peers[0]!.received.slice(1)).toMatchObject([
        { domain: "messaging", conversationId: "shared", organizationId: "org-a" },
      ]);
      expect(peers[1]!.received.slice(1)).toMatchObject([
        { domain: "messaging", conversationId: "shared", organizationId: "org-b" },
      ]);

      const first = peers[0]!;
      first.subscription.stop();
      expect(first.hub.size).toBe(0);
      await publish([{ audience: realtimeKeys.user("org-a"), domain: "agents" }]);
      first.subscription = first.subscribe();
      await first.subscription.start();
      await first.connect();
      await publish([{ audience: realtimeKeys.conversation("private"), domain: "messaging" }]);
      await first.delivered;
      expect(first.received.slice(2)).toMatchObject([
        { type: "ready" },
        { domain: "messaging", conversationId: "private" },
      ]);
      expect(peers[1]!.received).toHaveLength(2);
    } finally {
      publisher.close();
      for (const peer of peers) {
        peer.subscription.stop();
        peer.hub.stop();
      }
    }
  },
);
