import { commandSchema } from "@substrate/contracts/harness";

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
    mcpServers: [],
  };
  expect(commandSchema.parse(open)).toEqual(open);
  const { epoch: _epoch, ...withoutEpoch } = open;
  expect(() => commandSchema.parse(withoutEpoch)).toThrow();
  expect(() => commandSchema.parse({ ...open, cwd: "C:/other" })).toThrow();
  expect(() => commandSchema.parse({ ...open, folder: { helperId: "../escape" } })).toThrow();
  expect(() =>
    commandSchema.parse({
      ...open,
      mcpServers: [
        {
          id: "tools",
          name: "Tools",
          transport: "stdio",
          command: "tool",
          environment: { API_KEY: "value" },
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    commandSchema.parse({ type: "configure", organizationId: "org", agents: [] }),
  ).toThrow();
  expect(() =>
    commandSchema.parse({
      type: "steer",
      organizationId: "org",
      sessionId: "session",
      turnId: crypto.randomUUID(),
      inputId: "item",
      text: "x".repeat(1_000_001),
    }),
  ).toThrow();
});
