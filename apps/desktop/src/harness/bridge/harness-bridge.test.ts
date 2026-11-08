import { parseHarnessCommand } from "./harness-bridge.ts";
import { expect, test } from "bun:test";

test("commands cannot smuggle paths or catalog configuration", () => {
  expect(() =>
    parseHarnessCommand({
      type: "start",
      organizationId: "org",
      agentId: "agent",
      cwd: "C:/other",
    }),
  ).toThrow();
  expect(() =>
    parseHarnessCommand({ type: "configure", organizationId: "org", agents: [] }),
  ).toThrow();
  expect(() =>
    parseHarnessCommand({
      type: "prompt",
      organizationId: "org",
      sessionId: "session",
      text: "x".repeat(100_001),
    }),
  ).toThrow();
});
