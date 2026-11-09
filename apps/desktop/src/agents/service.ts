import { AgentWorkStore } from "@startup-os/client-storage/agent-work";
import type { AgentWorkChange } from "@startup-os/contracts/agent-work/desktop";
import type { HarnessEvent } from "@startup-os/contracts/harness";
import type { WorkspaceApiResult } from "@startup-os/contracts/harness/mcp";
import type { RealtimeUpdate } from "@startup-os/contracts/realtime";

import { createHarnessAuthority } from "../harness/controller/harness-authority.ts";
import { dispatchAgentWork } from "./bridge/agent-work-bridge.ts";
import type { AgentDirectory, HarnessPort } from "./runtime/context.ts";
import { createAgentWorkRuntime, type AgentWorkRuntime } from "./runtime/runtime.ts";
import { createAgentWorkServer, type CatalogAgent } from "./server/agent-work-server.ts";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

/* oxlint-disable deslop/no-unknown-parameters -- IPC values, MCP bodies and local tool calls are parsed by the modules this service calls. */

const catalogTtlMs = 60_000;

interface Active {
  identity: string;
  organizationId: string;
  store: AgentWorkStore;
  runtime: AgentWorkRuntime;
}

async function storePath(accountDirectory: string) {
  await mkdir(accountDirectory, { recursive: true });
  const directory = join(await realpath(accountDirectory), ".startup-os");
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
): AgentDirectory & { invalidate(): void } {
  let cache: { at: number; agents: CatalogAgent[] } | undefined;
  async function all() {
    if (!cache || Date.now() - cache.at > catalogTtlMs)
      cache = { at: Date.now(), agents: await server.catalog() };
    return cache.agents;
  }
  return {
    all,
    get: async (id) => (await all()).find((agent) => agent.id === id),
    invalidate() {
      cache = undefined;
    },
  };
}

/**
 * Agent work for the signed-in account in main. Main derives the account and organization from
 * the verified session for every operation; the renderer never names them.
 */
export function createAgentWorkService(options: {
  backend: string;
  installationId: string;
  device: { name: string; platform: string };
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  harness: HarnessPort;
  accountsDirectory: string;
  migrationsDirectory?: string;
  notify(change: AgentWorkChange): void;
  log?: (message: string) => void;
}) {
  const log = options.log ?? (() => {});
  const authority = createHarnessAuthority(options);
  const server = createAgentWorkServer(options);
  const agents = agentDirectory(server);
  let active: Active | undefined;
  let ensuring: Promise<Active | undefined> | undefined;
  let stopped = true;

  /** The app stops: the harness process stops with it, and the next start recovers the turns. */
  function shutdown() {
    active?.runtime.dispose();
    active?.store.close();
    active = undefined;
  }

  /**
   * The account or organization changed: the old runtime interrupts and closes its live
   * sessions and ends their turns before it goes. It keeps receiving their events until then.
   */
  async function retire(current: Active) {
    await current.runtime.shutdown().catch(() => log("Agent work could not stop cleanly."));
    if (active === current) active = undefined;
    current.store.close();
  }

  async function open(): Promise<Active | undefined> {
    const auth = await authority.verify();
    const identity = `${auth.accountKey}:${auth.organizationId}`;
    if (active?.identity === identity) return active;
    if (active) await retire(active);
    if (stopped) return undefined;
    const accountDirectory = join(options.accountsDirectory, auth.accountKey);
    const store = await AgentWorkStore.open(
      await storePath(accountDirectory),
      options.migrationsDirectory,
    );
    agents.invalidate();
    const runtime = createAgentWorkRuntime(
      {
        organizationId: auth.organizationId,
        installationId: options.installationId,
        store,
        server,
        harness: options.harness,
        agents,
        profile: (agentId) => options.harness.readProfile(agentId).catch(() => ""),
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
    active = { identity, organizationId: auth.organizationId, store, runtime };
    void runtime.start().catch(() => log("Agent work could not start."));
    return active;
  }

  /**
   * The runtime for the current verified account and organization. Calls share one check. A
   * failed check, such as a network error, keeps the running runtime: only a verified change of
   * account or organization replaces it.
   */
  function ensure() {
    ensuring ??= open()
      .catch(() => {
        log("Could not verify the session for agent work.");
        return stopped ? undefined : active;
      })
      .finally(() => {
        ensuring = undefined;
      });
    return ensuring;
  }

  async function required() {
    const current = await ensure();
    if (!current) throw new Error("Agent work is unavailable. Sign in and try again.");
    return current.runtime;
  }

  return {
    start() {
      stopped = false;
      void ensure();
    },
    stop() {
      stopped = true;
      shutdown();
    },
    onRealtime(event: RealtimeUpdate) {
      if (stopped) return;
      if (event.type === "ready") void ensure().then((current) => current?.runtime.sync());
      if (event.type !== "change") return;
      if (event.domain === "agents") {
        // An agent may have moved to or from this desktop.
        agents.invalidate();
        const current = active;
        void current?.runtime
          .reconcileHome()
          .then(() => current.runtime.sync())
          .catch(() => log("Could not check where agents run."));
      }
      if (
        event.domain === "agent-work" ||
        event.domain === "session" ||
        event.domain === "organization"
      )
        void ensure().then((current) => current?.runtime.sync());
    },
    /** Harness events reach the store before anything else. */
    onHarnessEvent(event: HarnessEvent) {
      active?.runtime.onHarnessEvent(event);
    },
    observeToolCall(request: unknown, result: unknown) {
      void active?.runtime.observeToolCall(request, result).catch(() => {});
    },
    async handleLocalTool(request: unknown): Promise<WorkspaceApiResult> {
      if (!active)
        return {
          success: false,
          error: { code: "UNAVAILABLE", message: "Agent work is not running." },
        };
      return active.runtime.handleLocalTool(request);
    },
    /** The IPC bridge. Values are parsed per method. */
    async call(method: unknown, value?: unknown) {
      return dispatchAgentWork(await required(), method, value);
    },
  };
}
