import {
  createAgentWorkRuntime,
  createAgentWorkServer,
  createHostApi,
  createServerCall,
  type AgentDirectory,
  type AgentInbox,
  type AgentWorkRuntime,
  type HarnessPort,
} from "@substrate/agent-host";
import { AgentWorkStore } from "@substrate/client-storage/agent-work";
import type {
  LocalToolRequest,
  WorkspaceApiRequest,
  WorkspaceApiResult,
} from "@substrate/contracts/agent-tools/mcp";
import type { AgentWorkChange } from "@substrate/contracts/agent-work/desktop";
import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import type { HarnessEvent } from "@substrate/contracts/harness-runtime";
import type { MailScope } from "@substrate/contracts/mail/ipc";
import type { RealtimeUpdate } from "@substrate/contracts/realtime";

import type {
  LocalMcpServers,
  LocalWorkspaces,
} from "../harness/controller/local-configuration.ts";
import {
  DesktopSessionAuthority,
  HarnessAccessDenied,
} from "../session/desktop-session-authority.ts";
import { dispatchAgentWork } from "./bridge/agent-work-bridge.ts";
import { agentWorkServiceMachine, type AgentWorkServiceState } from "./service-machine.ts";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

interface Active {
  identity: string;
  generation: number;
  organizationId: string;
  store: AgentWorkStore;
  runtime: AgentWorkRuntime;
}

async function storePath(accountDirectory: string) {
  await mkdir(accountDirectory, { recursive: true });
  const directory = join(await realpath(accountDirectory), ".substrate");
  const path = join(directory, "agent-work.sqlite");
  for (const managed of [directory, path]) {
    const stat = await lstat(managed).catch(() => undefined);
    if (stat?.isSymbolicLink())
      throw new Error("Local storage paths cannot contain symlinks or junctions.");
    if (!stat && managed === directory) await mkdir(directory, { recursive: true });
  }
  return path;
}

function agentDirectory(
  server: ReturnType<typeof createAgentWorkServer>,
  authority: DesktopSessionAuthority,
): AgentDirectory {
  const all = () => server.catalog();
  return {
    all,
    get: async (id) => (await all()).find((agent) => agent.id === id),
    invalidate() {
      authority.invalidateCatalog();
    },
  };
}

export function createAgentWorkService(options: {
  backend: string;
  installationId: string;
  device: { name: string; platform: string };
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  authority: DesktopSessionAuthority;
  harness: HarnessPort;
  inbox?(scope: MailScope): AgentInbox;
  accountsDirectory: string;
  migrationsDirectory?: string;
  notify(change: AgentWorkChange): void;
  log?: (message: string) => void;
  openStore?: (path: string, migrationsDirectory?: string) => Promise<AgentWorkStore>;
  createRuntime?: typeof createAgentWorkRuntime;
}) {
  const log = options.log ?? (() => {});
  const openStore =
    options.openStore ??
    ((path: string, migrationsDirectory?: string) =>
      AgentWorkStore.open(path, migrationsDirectory));
  const createRuntime = options.createRuntime ?? createAgentWorkRuntime;
  const authority = options.authority;
  const sessionChanged = () => {
    authority.invalidate();
  };
  const call = createServerCall({ ...options, onDenied: sessionChanged });
  const server = createAgentWorkServer({
    call,
    installationId: options.installationId,
    catalog: () => authority.catalog(),
  });
  const host = createHostApi({ call, installationId: options.installationId });
  const agents = agentDirectory(server, authority);
  let active: Active | undefined;
  let ensuring: Promise<Active | undefined> | undefined;
  let stopping: Promise<void> | undefined;
  let state: AgentWorkServiceState = "stopped";

  function transition(event: keyof typeof agentWorkServiceMachine.events) {
    const next = agentWorkServiceMachine.next(state, event);
    if (next === null) return false;
    state = next;
    return true;
  }

  const accepting = () => agentWorkServiceMachine.canFire(state, "stop");
  const available = (current: Active | undefined) =>
    active === current &&
    (state === "running" || (state === "verifying" && current?.generation === authority.generation))
      ? current
      : undefined;

  async function retire(current: Active) {
    transition("retire");
    await current.runtime.shutdown().catch(() => log("Agent work could not stop cleanly."));
    if (active === current) active = undefined;
    current.store.close();
    transition("retired");
  }

  async function open(generation: number): Promise<Active | undefined> {
    const auth = await authority.verify();
    if (!accepting() || generation !== authority.generation) return undefined;
    const identity = `${auth.accountKey}:${auth.organizationId}`;
    if (active?.identity === identity) {
      active.generation = generation;
      return active;
    }
    if (active) await retire(active);
    if (!accepting() || generation !== authority.generation) return undefined;
    const accountDirectory = join(options.accountsDirectory, auth.accountKey);
    const store = await openStore(await storePath(accountDirectory), options.migrationsDirectory);
    if (!accepting() || generation !== authority.generation) {
      store.close();
      return undefined;
    }
    agents.invalidate();
    const runtime = createRuntime(
      {
        organizationId: auth.organizationId,
        store,
        server,
        host,
        harness: options.harness,
        inbox: options.inbox?.({ userId: auth.userId, organizationId: auth.organizationId }),
        agents,
        enabledApps: async () => (await authority.appSettings()).enabledApps,
        now: () => Date.now(),
        log,
      },
      {
        notify: (change) => options.notify(change),
        device: options.device,
        every(callback, milliseconds) {
          const timer = setInterval(callback, milliseconds);
          return () => clearInterval(timer);
        },
        later(callback, milliseconds) {
          const timer = setTimeout(callback, milliseconds);
          return () => clearTimeout(timer);
        },
      },
    );
    active = { identity, generation, organizationId: auth.organizationId, store, runtime };
    await runtime.start().catch(() => log("Agent work could not start."));
    return active;
  }

  function ensure() {
    if (!accepting()) return Promise.resolve(undefined);
    if (ensuring) return ensuring;
    if (!transition("recheck")) transition("check");
    ensuring = (async () => {
      while (accepting()) {
        const generation = authority.generation;
        let current: Active | undefined;
        try {
          current = await open(generation);
        } catch (error: unknown) {
          if (!accepting()) return undefined;
          if (generation !== authority.generation) continue;
          if (error instanceof HarnessAccessDenied) {
            if (active) await retire(active);
          } else {
            log("Could not verify the session for agent work.");
            current = active;
          }
        }
        if (!accepting()) return undefined;
        if (generation !== authority.generation) continue;
        transition(current ? "ready" : "unavailable");
        return current;
      }
      return undefined;
    })().finally(() => {
      ensuring = undefined;
    });
    return ensuring;
  }

  async function required() {
    const current = available(await ensure());
    if (!current) throw new Error("Agent work is unavailable. Sign in and try again.");
    return current.runtime;
  }

  async function organizationStore(organizationId: string) {
    const current = available(await ensure());
    if (current?.organizationId !== organizationId)
      throw new Error("Agent work is unavailable. Sign in and try again.");
    return current.store;
  }

  const mcpServers: LocalMcpServers = {
    list: async (organizationId, agentId) =>
      (await organizationStore(organizationId)).mcpServers.list(organizationId, agentId),
    save: async (organizationId, agentId, server) =>
      (await organizationStore(organizationId)).mcpServers.save(
        organizationId,
        agentId,
        server,
        Date.now(),
      ),
    delete: async (organizationId, agentId, id) =>
      (await organizationStore(organizationId)).mcpServers.delete(organizationId, agentId, id),
  };

  const workspaces: LocalWorkspaces = {
    get: async (organizationId, agentId) =>
      (await organizationStore(organizationId)).workspaces.get(organizationId, agentId),
    async set(organizationId, agentId, path) {
      await (
        await organizationStore(organizationId)
      ).workspaces.set(organizationId, agentId, path, Date.now());
      available(active)?.runtime.agentsChanged();
    },
  };

  return {
    mcpServers,
    workspaces,
    start() {
      if (transition("start")) void ensure();
      else transition("restart");
    },
    stop() {
      transition("cancelRestart");
      if (stopping) return stopping;
      if (!transition("stop")) return Promise.resolve();
      stopping = (async () => {
        await ensuring;
        if (active) await retire(active);
      })().finally(() => {
        stopping = undefined;
        if (transition("restarted")) void ensure();
        else transition("stopped");
      });
      return stopping;
    },
    onRealtime(event: RealtimeUpdate) {
      if (!accepting()) return;
      if (event.type === "status" && event.status === "forbidden") {
        sessionChanged();
        void ensure();
      }
      if (event.type === "ready") {
        sessionChanged();
        agents.invalidate();
        void ensure().then((current) => {
          if (!available(current)) return;
          current?.runtime.agentsChanged();
          return current?.runtime.sync();
        });
      }
      if (event.type !== "change") return;
      const appsChanged = event.domain === "organization" || event.domain === "apps";
      if (event.domain === "session" || event.domain === "access" || appsChanged) sessionChanged();
      if (event.domain === "access") void ensure();
      if (event.domain === "agents") {
        agents.invalidate();
        void ensure()
          .then((current) => {
            if (!available(current)) return;
            current?.runtime.agentsChanged();
            current?.runtime.hint();
          })
          .catch(() => log("Could not check where agents run."));
      }
      if (event.domain === "agent-work" && event.scope !== "activity")
        void ensure().then((current) => available(current)?.runtime.hint());
      if (event.domain === "session" || appsChanged)
        void ensure().then((current) => {
          if (!available(current)) return;
          current?.runtime.agentsChanged();
          return current?.runtime.sync();
        });
    },
    onHarnessEvent(event: HarnessEvent) {
      active?.runtime.onHarnessEvent(event);
    },
    observeToolCall(
      request: WorkspaceApiRequest,
      result: WorkspaceApiResult,
      decided?: { requestId: string },
    ) {
      return active?.runtime.observeToolCall(request, result, decided);
    },
    requestStatus(organizationId: string, requestId: string) {
      return server.requestStatus(organizationId, requestId);
    },
    awaitApproval(request: WorkspaceApiRequest, requestId: string) {
      return available(active)?.runtime.awaitApproval(request, requestId) ?? null;
    },
    async handleLocalTool(request: LocalToolRequest): Promise<WorkspaceApiResult> {
      const current = available(active);
      if (!current)
        return {
          success: false,
          error: { code: "UNAVAILABLE", message: "Agent work is not running." },
        };
      return current.runtime.handleLocalTool(request);
    },
    async call(method: string, value?: IpcValue) {
      return dispatchAgentWork(await required(), method, value);
    },
  };
}
