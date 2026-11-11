import type { LocalToolProxy } from "@substrate/contracts/harness/mcp";

import { DesktopSessionAuthority } from "../../session/desktop-session-authority.ts";
import { HarnessWorkerError } from "../worker/protocol.ts";
import { createHarnessController } from "./harness-controller.ts";

/* oxlint-disable deslop/no-unknown-parameters -- The fake worker records structured-clone payloads. */

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

export function fixture(
  beforeScan?: () => Promise<void>,
  nativeMcpServers: unknown[] = [],
  options: {
    failExecute?: string;
    /** Holds every execute command except interrupt until resolved. */
    holdExecute?: Promise<void>;
    localToolHandler?: LocalToolProxy;
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
      if (url.endsWith("/session")) {
        requests.push("session");
        return Response.json({ success: true, data: session });
      }
      if (url.includes("get-active-member-role")) {
        requests.push("membership");
        return membership ? Response.json({ role: "member" }) : new Response(null, { status: 403 });
      }
      requests.push("catalog");
      catalogRequests++;
      if (catalogFails) return new Response("Bad gateway", { status: 502 });
      return Response.json({ success: true, data: { agents: [], runSettings: [] } });
    },
  };
  const authority = new DesktopSessionAuthority(connection);
  const controller = createHarnessController({
    ...connection,
    authority,
    accountsDirectory: "accounts",
    localToolHandler: options.localToolHandler,
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
              mcpServers: nativeMcpServers,
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
