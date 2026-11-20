import type {
  HarnessAgent,
  HarnessErrorCode,
  HarnessMcpServer,
  HarnessSignInState,
} from "@substrate/contracts/harness";
import type { LocalToolProxy } from "@substrate/contracts/harness/mcp";

import { DesktopSessionAuthority } from "../../session/desktop-session-authority.ts";
import { HarnessWorkerError } from "../worker/protocol.ts";
import { createHarnessController } from "./harness-controller.ts";

const sessionRef = {
  id: "session-1",
  organizationId: "org-1",
  agentId: "agent-1",
  harness: "codex",
  nativeSessionId: "native-1",
  folder: "main",
  capabilities: {
    steer: false,
    steerEvidence: false,
    compact: false,
    usage: false,
    noAskProfile: true,
    interruptReceipt: false,
  },
  resumed: false,
};

/** The sign-in that the fixture's worker reports. */
export const signInId = "6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d";

export function fixture(
  beforeScan?: () => Promise<void>,
  storedMcpServers: HarnessMcpServer[] = [],
  options: {
    /** The catalog's agents. */
    agents?: HarnessAgent[];
    failExecute?: HarnessErrorCode;
    /** Holds every execute command except interrupt until resolved. */
    holdExecute?: Promise<void>;
    localToolHandler?: LocalToolProxy;
    /** What the worker answers for signIn and readSignIn, before main parses it. */
    signInState?: Partial<HarnessSignInState>;
  } = {},
) {
  let session = {
    user: { id: "user-1", emailVerified: true },
    session: { activeOrganizationId: "org-1" },
  };
  let catalogRequests = 0;
  const requests: string[] = [];
  const calls: { method: string; value?: unknown }[] = [];
  const directories: string[] = [];
  let disposed = 0;
  let membership = true;
  /** network: requests throw. server: the backend answers 503. */
  let outage: "network" | "server" | undefined;
  let catalogFails = false;
  let localTools: LocalToolProxy | undefined;
  const connection = {
    backend: "https://api.example.com",
    fetchAPI: async (url: string) => {
      if (outage === "network") throw new TypeError("fetch failed");
      if (outage === "server") return new Response(null, { status: 503 });
      if (new URL(url).pathname === "/api/auth/get-session") {
        requests.push("session");
        return Response.json(session);
      }
      if (url.includes("get-active-member-role")) {
        requests.push("membership");
        return membership ? Response.json({ role: "member" }) : new Response(null, { status: 403 });
      }
      requests.push("catalog");
      catalogRequests++;
      if (catalogFails) return new Response("Bad gateway", { status: 502 });
      return Response.json({
        success: true,
        data: { agents: options.agents ?? [], runSettings: [] },
      });
    },
  };
  const authority = new DesktopSessionAuthority(connection);
  /** Local MCP servers by organization and agent. */
  const mcpServers = new Map<string, HarnessMcpServer[]>([["org-1/agent-1", storedMcpServers]]);
  const controller = createHarnessController({
    ...connection,
    authority,
    accountsDirectory: "accounts",
    localToolHandler: options.localToolHandler,
    mcpServers: {
      list: async (organizationId, agentId) => mcpServers.get(`${organizationId}/${agentId}`) ?? [],
      save: async (organizationId, agentId, server) => {
        const key = `${organizationId}/${agentId}`;
        const servers = (mcpServers.get(key) ?? []).filter((entry) => entry.id !== server.id);
        mcpServers.set(key, [...servers, server]);
      },
      delete: async (organizationId, agentId, id) => {
        const key = `${organizationId}/${agentId}`;
        mcpServers.set(
          key,
          (mcpServers.get(key) ?? []).filter((entry) => entry.id !== id),
        );
      },
    },
    createWorker: (directory, _proxy, local) => {
      directories.push(directory);
      localTools = local;
      return {
        request: async (method, ...[value]) => {
          calls.push({ method, value });
          if (method === "execute") {
            // SAFETY: execute values are parsed harness commands.
            const command = value as { type: string };
            if (options.failExecute) throw new HarnessWorkerError(options.failExecute);
            if (command.type === "interrupt") return { stillQueuedInputIds: [] };
            await options.holdExecute;
            return command.type === "open" ? sessionRef : undefined;
          }
          if (method === "readProfile") return "- Owner prefers mornings.\n";
          if (method === "signIn" || method === "readSignIn")
            return {
              loginId: signInId,
              harness: "claude",
              type: "terminal",
              status: "running",
              output: "Open https://claude.ai/device",
              cursor: 29,
              command: "C:\\Users\\me\\agent.exe",
              ...options.signInState,
            };
          if (method === "listModels")
            return {
              harness: "codex",
              status: "ready",
              models: [{ id: "gpt-native", name: "Native GPT", credentials: "must-not-cross-ipc" }],
              stderr: "must-not-cross-ipc",
            };
          if (method === "scanConfiguration") {
            await beforeScan?.();
            return {
              organizationId: "org-1",
              agentId: "agent-1",
              harness: "codex",
              skills: [],
            };
          }
          return method === "inspect"
            ? [
                {
                  harness: "codex",
                  executable: "secret-path",
                  available: true,
                },
              ]
            : undefined;
        },
        dispose: () => {
          disposed++;
        },
      };
    },
  });
  return {
    controller,
    calls,
    mcpServers,
    directories,
    setSession: (value: typeof session) => {
      session = value;
      authority.invalidate();
    },
    catalogRequests: () => catalogRequests,
    requests: () => [...requests],
    disposed: () => disposed,
    revokeMembership: () => {
      membership = false;
      authority.invalidate();
    },
    setOutage: (value: typeof outage) => {
      outage = value;
      authority.invalidate();
    },
    failCatalog: (value: boolean) => {
      catalogFails = value;
      authority.invalidate();
    },
    localTools: () => localTools,
  };
}
