import { saveAgentInput, saveMcpServerInput } from "./index";
import { describe, expect, test } from "bun:test";

describe("agent configuration inputs", () => {
  test("defaults to startup tools and rejects device references", () => {
    const input = { name: "Helper", instructions: "Help", harness: "opencode", enabled: true };
    expect(saveAgentInput.parse(input).useStartupDefaults).toBe(true);
    expect(saveAgentInput.safeParse({ ...input, skillIds: [crypto.randomUUID()] }).success).toBe(
      false,
    );
    expect(
      saveAgentInput.safeParse({ ...input, mcpServerIds: [crypto.randomUUID()] }).success,
    ).toBe(false);
  });

  test("rejects credentials and transport mismatches", () => {
    for (const input of [
      { name: "Remote", transport: "http", url: "https://user:pass@example.com" },
      { name: "Remote", transport: "http", url: "https://example.com?api_key=secret" },
      { name: "Local", transport: "stdio", command: "tool", environment: { API_TOKEN: "secret" } },
      {
        name: "Remote",
        transport: "http",
        url: "https://example.com",
        headers: { Authorization: "secret" },
      },
      { name: "Local", transport: "stdio", command: "tool", args: ["--api-key", "secret"] },
      { name: "Remote", transport: "http", command: "tool" },
    ])
      expect(saveMcpServerInput.safeParse(input).success).toBe(false);
    expect(
      saveMcpServerInput.safeParse({
        name: "Local",
        transport: "stdio",
        command: "tool",
        environment: { LOG_LEVEL: "info" },
      }).success,
    ).toBe(true);
  });
});
