import { realtimeAudience, realtimeConnectInput, realtimeEvent, realtimeKeys } from "./index";
import { expect, test } from "bun:test";

test("audience keys preserve workspace-specific actor identity", () => {
  expect(realtimeKeys.actor("workspace-a", "actor")).not.toEqual(
    realtimeKeys.actor("workspace-b", "actor"),
  );
  for (const key of [
    realtimeKeys.organization("workspace-a"),
    realtimeKeys.conversation("channel"),
    realtimeKeys.actor("workspace-a", "actor"),
    realtimeKeys.user("user"),
  ])
    expect(JSON.stringify(realtimeAudience.parse(JSON.parse(JSON.stringify(key))))).toBe(
      JSON.stringify(key),
    );
});

test("socket boundaries reject invalid scopes and unsupported protocols", () => {
  for (const audience of [
    ["organization", ""],
    ["actor", "workspace"],
    ["user", "user", "extra"],
    ["everything"],
    ["conversation", "x".repeat(201)],
  ])
    expect(realtimeAudience.safeParse(audience).success).toBe(false);
  expect(realtimeConnectInput.safeParse({ organizationId: "" }).success).toBe(false);
  expect(realtimeConnectInput.parse({ organizationId: null })).toEqual({ organizationId: null });
  const event = {
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "workspace-b",
    domain: "messaging",
    conversationId: "partner-channel",
  } as const;
  expect(realtimeEvent.parse(event)).toEqual(event);
  expect(realtimeEvent.parse({ ...event, token: "private", body: "private message" })).toEqual(
    event,
  );
  for (const patch of [
    { version: 2 },
    { type: "record" },
    { domain: "arbitrary-command" },
    { id: "invalid" },
    { organizationId: "" },
    { conversationId: "" },
  ])
    expect(realtimeEvent.safeParse({ ...event, ...patch }).success).toBe(false);
});
