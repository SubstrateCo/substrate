import { realtimeEvent, realtimeKeys } from "./index";
import { expect, test } from "bun:test";

test("audience keys preserve workspace-specific actor identity", () => {
  expect(realtimeKeys.actor("workspace-a", "actor")).not.toEqual(
    realtimeKeys.actor("workspace-b", "actor"),
  );
});

test("events drop unknown keys, so a token or message body never reaches a client", () => {
  const event = {
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "workspace-b",
    domain: "messaging",
    conversationId: "partner-channel",
  } as const;
  expect(realtimeEvent.parse({ ...event, token: "private", body: "private message" })).toEqual(
    event,
  );
});
