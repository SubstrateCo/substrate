import { parseHarnessCommand } from "./harness-bridge.ts";
import { expect, test } from "bun:test";

test("commands cannot smuggle paths or catalog configuration", () => {
  const open = {
    type: "open" as const,
    organizationId: "org",
    sessionId: "session",
    agentId: "agent",
    folder: "main" as const,
    epoch: 0,
    prefix: "",
  };
  expect(parseHarnessCommand(open)).toEqual(open);
  const { epoch: _epoch, ...withoutEpoch } = open;
  expect(() => parseHarnessCommand(withoutEpoch)).toThrow();
  expect(() => parseHarnessCommand({ ...open, cwd: "C:/other" })).toThrow();
  expect(() => parseHarnessCommand({ ...open, folder: { helperId: "../escape" } })).toThrow();
  expect(() =>
    parseHarnessCommand({ type: "configure", organizationId: "org", agents: [] }),
  ).toThrow();
  expect(() =>
    parseHarnessCommand({
      type: "steer",
      organizationId: "org",
      sessionId: "session",
      turnId: crypto.randomUUID(),
      inputId: "item",
      text: "x".repeat(1_000_001),
    }),
  ).toThrow();
});
