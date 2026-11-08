import { fixture } from "./test-support.ts";
import { describe, expect, test } from "bun:test";

describe("desktop harness local configuration", () => {
  test("local file operations use the verified active organization", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    const input = {
      harness: "codex",
      agentId: "agent-1",
      id: "notes",
      name: "Notes",
      description: "",
      content: "Keep notes.",
    };
    await f.controller.run("saveSkill", input);
    expect(f.calls.at(-1)).toEqual({
      method: "saveSkill",
      value: {
        organizationId: "org-1",
        agentId: "agent-1",
        harness: "codex",
        skill: { id: "notes", name: "Notes", description: "", content: "Keep notes." },
      },
    });
    expect(
      f.controller.run("deleteSkill", {
        organizationId: "other-org",
        agentId: "agent-1",
        harness: "codex",
        id: "notes",
      }),
    ).rejects.toThrow();
    expect(f.calls.length).toBe(2);
  });
  test("new native configuration uses stable names instead of random database-style IDs", async () => {
    const f = fixture();
    await f.controller.run("synchronize");
    await f.controller.run("saveSkill", {
      harness: "opencode",
      agentId: "agent-1",
      name: "review-context",
      description: "Review context.",
      content: "Read the sources.",
    });
    expect(f.calls.at(-1)?.value).toMatchObject({ skill: { id: "review-context" } });
    await f.controller.run("saveMcpServer", {
      harness: "opencode",
      agentId: "agent-1",
      name: "local-helper",
      transport: "stdio",
      command: "node",
      args: ["helper.mjs"],
    });
    expect(f.calls.at(-1)?.value).toMatchObject({ server: { id: "local-helper" } });
  });
  test("native scan results omit transport-inapplicable fields and private metadata", async () => {
    const f = fixture(undefined, [
      {
        id: "local-helper",
        name: "local-helper",
        transport: "stdio",
        command: "node",
        args: ["helper.mjs"],
        url: undefined,
        sourcePath: "private-native-path",
      },
    ]);
    await f.controller.run("synchronize");
    expect(
      await f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" }),
    ).toEqual({
      organizationId: "org-1",
      agentId: "agent-1",
      harness: "codex",
      skills: [],
      mcpServers: [
        {
          id: "local-helper",
          name: "local-helper",
          transport: "stdio",
          command: "node",
          args: ["helper.mjs"],
        },
      ],
    });
  });
  test("a scan cannot return private configuration after sign-out", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scanning = new Promise<void>((resolve) => {
      started = resolve;
    });
    const f = fixture(async () => {
      started();
      await gate;
    });
    await f.controller.run("synchronize");
    const result = f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" });
    await scanning;
    f.controller.disconnect();
    release();
    // oxlint-disable-next-line typescript/await-thenable -- Bun's rejects matchers return a promise at runtime.
    await expect(result).rejects.toThrow("Harness unavailable");
  });
});
