import { saveMcpServerInput } from "./index";
import { describe, expect, test } from "bun:test";

describe("agent configuration inputs", () => {
  test("rejects credentials", () => {
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
