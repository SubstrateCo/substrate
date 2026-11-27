import { acpAuthRequired, type AcpLaunch, type AcpPeer } from "../acp/api.ts";
import { HarnessError } from "../errors.ts";
import { discoverAcpModels } from "./discover.ts";
import { describe, expect, test } from "bun:test";

const launch: AcpLaunch = { harness: "claude", command: "agent", args: [], version: "1.0.0" };

function agents(probe: AcpPeer["probeConfigOptions"]) {
  const peer: AcpPeer = {
    launch,
    protocolVersion: 1,
    capabilities: {
      loadSession: false,
      resume: false,
      close: false,
      delete: false,
      sessionOptions: false,
      additionalDirectories: false,
      systemPrompt: { append: false, override: false },
      mcp: { http: false, stdio: false, acp: false },
      steering: "none",
      logout: true,
      authStatus: false,
    },
    authMethods: [
      {
        id: "login",
        name: "Log in",
        type: "terminal",
        args: ["/login"],
        env: { CLAUDE_CONFIG_DIR: "/home/me/.claude" },
      },
    ],
    probeConfigOptions: probe,
    authenticate: async () => {},
    logout: async () => {},
    close: async () => {},
  };
  return { openPeer: async () => peer, requireAgent: async () => launch };
}

describe("ACP model discovery", () => {
  test("auth_required during session setup reports sign-in with the advertised methods", async () => {
    const catalog = await discoverAcpModels(
      "claude",
      ".",
      AbortSignal.timeout(1000),
      agents(async () => {
        throw new HarnessError(acpAuthRequired, "Sign in first.");
      }),
    );
    expect(catalog).toEqual({
      status: "sign-in",
      models: [],
      auth: { methods: [{ id: "login", name: "Log in", type: "terminal" }], signOut: true },
    });
  });

  test("other setup failures are not reported as sign-in", async () => {
    expect(
      discoverAcpModels(
        "claude",
        ".",
        AbortSignal.timeout(1000),
        agents(async () => {
          throw new HarnessError("process-exit", "Exited.");
        }),
      ),
    ).rejects.toThrow("Exited.");
  });
});
