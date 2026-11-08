import { createHarnessController } from "./harness-controller.ts";

export function fixture(beforeScan?: () => Promise<void>, nativeMcpServers: unknown[] = []) {
  let session = {
    user: { id: "user-1", emailVerified: true },
    session: { activeOrganizationId: "org-1" },
  };
  let catalogRequests = 0;
  const calls: { method: string; value?: unknown }[] = [];
  const directories: string[] = [];
  let disposed = 0;
  let membership = true;
  const controller = createHarnessController({
    backend: "https://api.example.com",
    accountsDirectory: "accounts",
    fetchAPI: async (url) => {
      if (url.endsWith("/session")) return Response.json({ success: true, data: session });
      if (url.includes("get-active-member-role"))
        return membership ? Response.json({ role: "member" }) : new Response(null, { status: 403 });
      catalogRequests++;
      return Response.json({ success: true, data: { agents: [] } });
    },
    createWorker: (directory) => {
      directories.push(directory);
      return {
        request: async (method, value) => {
          calls.push({ method, value });
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
                  capabilities: { resume: true, permissions: true, nativeAgents: false },
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
    },
    catalogRequests: () => catalogRequests,
    disposed: () => disposed,
    revokeMembership: () => {
      membership = false;
    },
  };
}
