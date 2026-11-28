import { startFakeAgent, type FakeAgent, type FakeAgentScript } from "../testing/fake-agent.ts";
import { createAcpAdapter } from "./adapter.ts";
import type { AcpProtocolVersion } from "./api.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

function modelValue(version: AcpProtocolVersion) {
  return version === 2
    ? { configId: "model-choice", type: "id", value: "large" }
    : { configId: "model-choice", value: "large" };
}

function fixture(
  version: AcpProtocolVersion,
  advertised: boolean,
  overrides: FakeAgentScript = {},
) {
  const model = {
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue: "small",
    options: [
      { value: "small", name: "Small" },
      { value: "large", name: "Large" },
    ],
  };
  const script: FakeAgentScript = {
    protocolVersions: [version],
    agentCapabilities: {
      sessionCapabilities: advertised ? { resume: {}, options: {} } : { resume: {} },
    },
    configOptions: [{ ...model, id: "model-choice" }],
    v2: {
      capabilities: { session: advertised ? { options: {} } : {} },
      configOptions: [{ ...model, configId: "model-choice" }],
    },
    ...overrides,
  };
  let agent: FakeAgent;
  return {
    connect(model: string | undefined = "large", resumeId?: string) {
      return createAcpAdapter(
        {
          launch: { harness: "codex", command: "fake", args: [], version: "1" },
          prefixChannel: "instructions",
          prefix: "",
          resumeId,
          context: { directory: "C:/agent", model, emit: () => {} },
        },
        {
          spawn: () => (agent = startFakeAgent(script)),
          cache: new Map<string, AcpProtocolVersion>(),
          commandsWaitMs: 0,
        },
      );
    },
    calls(method: string) {
      return agent.record.calls.filter((call) => call.method === method).map((call) => call.params);
    },
    methods() {
      return agent.record.calls.map((call) => call.method);
    },
  };
}

for (const version of [1, 2] as const) {
  test(`v${version} selects a model at creation when session options are advertised`, async () => {
    const f = fixture(version, true);
    const adapter = await f.connect();
    try {
      expect(f.calls("session/options")).toEqual([{ cwd: "C:/agent" }]);
      expect(f.calls("session/new")).toEqual([
        {
          cwd: "C:/agent",
          mcpServers: [],
          configOptions: [modelValue(version)],
        },
      ]);
      expect(f.calls("session/set_config_option")).toEqual([]);
    } finally {
      await adapter.disconnect();
    }
  });

  test(`v${version} applies the fallback model before the first prompt`, async () => {
    const f = fixture(version, false);
    const adapter = await f.connect();
    try {
      expect(f.calls("session/options")).toEqual([]);
      expect(f.calls("session/new")).toEqual([{ cwd: "C:/agent", mcpServers: [] }]);
      expect(f.calls("session/set_config_option")).toEqual([
        {
          sessionId: "fake-session-1",
          ...modelValue(version),
        },
      ]);
      await adapter.turn({ inputIds: ["input"], text: "go" }, { mode: "interactive" });
      expect(f.calls("session/prompt")).toHaveLength(1);
      expect(f.methods().indexOf("session/set_config_option")).toBeLessThan(
        f.methods().indexOf("session/prompt"),
      );
    } finally {
      await adapter.disconnect();
    }
  });

  test(`v${version} rejects an unavailable pre-session model without creating a session`, async () => {
    const f = fixture(version, true);
    await rejects(f.connect("removed"), { code: "invalid-model" });
    expect(f.calls("session/new")).toEqual([]);
    expect(f.calls("session/prompt")).toEqual([]);
  });

  for (const advertised of [false, true]) {
    test(`v${version} rejects an unconfirmed ${advertised ? "initial" : "fallback"} selection`, async () => {
      const f = fixture(version, advertised, { ignoreConfigChanges: true });
      await rejects(f.connect(), { code: "invalid-model" });
      expect(f.calls("session/prompt")).toEqual([]);
    });
  }

  test(`v${version} keeps post-resume selection even when session options are advertised`, async () => {
    const f = fixture(version, true);
    const adapter = await f.connect("large", "saved-session");
    try {
      expect(f.calls("session/options")).toEqual([]);
      expect(f.calls("session/new")).toEqual([]);
      expect(f.calls("session/set_config_option")).toEqual([
        {
          sessionId: "saved-session",
          ...modelValue(version),
        },
      ]);
    } finally {
      await adapter.disconnect();
    }
  });

  test(`v${version} leaves the native default when no model is selected`, async () => {
    const f = fixture(version, true);
    const adapter = await f.connect("");
    try {
      expect(f.calls("session/options")).toEqual([]);
      expect(f.calls("session/new")).toEqual([{ cwd: "C:/agent", mcpServers: [] }]);
      expect(f.calls("session/set_config_option")).toEqual([]);
    } finally {
      await adapter.disconnect();
    }
  });
}
