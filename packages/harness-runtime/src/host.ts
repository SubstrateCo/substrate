import type {
  HarnessAgent,
  HarnessConfiguration,
  HarnessEvent,
  HarnessHost,
  HarnessKind,
  HarnessLocalScope,
  HarnessSessionRef,
} from "@startup-os/contracts/harness";

import type { AdapterContext, NativeAdapter } from "./adapters/types.ts";
import { materialize } from "./config.ts";
import { HarnessError } from "./errors.ts";
import { createStartupMcp } from "./mcp.ts";
import { discoverModels } from "./models/discover.ts";
import {
  deleteNativeSkill,
  editNativeServer,
  saveNativeSkill,
  scanNativeServers,
  scanNativeSkills,
} from "./native-config.ts";
import { organizationDirectory, safeId, safePath } from "./paths.ts";
import { antigravityAcpAvailable, binaryVersion, resolveExecutable } from "./process.ts";
import { MetadataStore } from "./store.ts";
import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

export interface HarnessHostOptions {
  accountDirectory: string;
  migrationsDirectory?: string;
  /** Trusted main-process configuration only. Never accept executable paths from renderer commands. */
  executables?: Partial<Record<HarnessKind, string>>;
}

export async function createHarnessHost(options: HarnessHostOptions): Promise<HarnessHost> {
  await mkdir(options.accountDirectory, { recursive: true });
  const accountDirectory = await realpath(options.accountDirectory);
  const store = await MetadataStore.open(
    await safePath(accountDirectory, ".startup-os/harness-metadata.sqlite", false, true),
    options.migrationsDirectory,
  );
  const mcp = await createStartupMcp();
  const listeners = new Set<(event: HarnessEvent) => void>();
  const sessions = new Map<
    string,
    { ref: HarnessSessionRef; adapter: NativeAdapter; revoke(): void; busy: boolean }
  >();
  let disposed = false;
  const modelDiscovery = new AbortController();
  const assertOpen = () => {
    if (disposed) throw new HarnessError("disposed", "Harness host is disposed.");
  };
  function emit(ref: HarnessSessionRef, event: Parameters<AdapterContext["emit"]>[0]) {
    const normalized: HarnessEvent = {
      ...event,
      sessionId: ref.id,
      organizationId: ref.organizationId,
      timestamp: Date.now(),
    };
    for (const listener of listeners) {
      try {
        listener(normalized);
      } catch {
        /* A subscriber cannot stop a native event stream. */
      }
    }
  }
  async function directory(scope: HarnessLocalScope) {
    assertOpen();
    if (!["opencode", "antigravity", "claude", "codex"].includes(scope.harness))
      throw new HarnessError("invalid-harness", "Unknown harness.");
    // Scan must not create a missing organization or a missing native config directory.
    const path = await safePath(accountDirectory, join("orgs", safeId(scope.organizationId)));
    if ((await realpath(path)) !== path)
      throw new HarnessError("unsafe-path", "Organization folder is not canonical.");
    return path;
  }
  async function connect(
    configuration: HarnessConfiguration,
    agent: HarnessAgent,
    existing?: HarnessSessionRef,
  ): Promise<HarnessSessionRef> {
    if (!agent.enabled) throw new HarnessError("agent-disabled", "This agent is disabled.");
    const ref: HarnessSessionRef = existing ?? {
      id: randomUUID(),
      organizationId: configuration.organizationId,
      agentId: agent.id,
      harness: agent.harness,
      nativeSessionId: "",
    };
    if (sessions.has(ref.id)) return ref;
    const lease = agent.useStartupDefaults ? mcp.issue(ref.organizationId, agent.id) : undefined;
    try {
      const context: AdapterContext = {
        configuration,
        agent,
        directory: await organizationDirectory(accountDirectory, ref.organizationId),
        executable: await resolveExecutable(agent.harness, options.executables?.[agent.harness]),
        lease,
        emit: (event) => emit(ref, event),
      };
      let adapter: NativeAdapter;
      switch (agent.harness) {
        case "opencode":
          adapter = await (
            await import("./adapters/opencode.ts")
          ).connectOpenCode(context, existing?.nativeSessionId);
          break;
        case "antigravity":
          adapter = await (
            await import("./adapters/antigravity.ts")
          ).connectAntigravity(context, existing?.nativeSessionId);
          break;
        case "claude":
          adapter = await (
            await import("./adapters/claude.ts")
          ).connectClaude(context, existing?.nativeSessionId);
          break;
        case "codex":
          adapter = await (
            await import("./adapters/codex.ts")
          ).connectCodex(context, existing?.nativeSessionId);
          break;
      }
      ref.nativeSessionId = adapter.nativeSessionId;
      await store.save(ref);
      sessions.set(ref.id, { ref, adapter, revoke: () => lease?.revoke(), busy: false });
      emit(ref, { type: "session", session: { ...ref } });
      return { ...ref };
    } catch (error) {
      lease?.revoke();
      throw error;
    }
  }
  return {
    async listModels(scope) {
      return discoverModels(
        scope.harness,
        await directory(scope),
        options.executables?.[scope.harness],
        modelDiscovery.signal,
      );
    },
    async configure(input) {
      assertOpen();
      const configuration: HarnessConfiguration = {
        organizationId: input.organizationId,
        agents: input.agents.map(
          ({ id, name, instructions, harness, model, enabled, useStartupDefaults }) => ({
            id,
            name,
            instructions,
            harness,
            model,
            enabled,
            useStartupDefaults,
          }),
        ),
      };
      const previous = await store.configuration(configuration.organizationId);
      for (const session of sessions.values()) {
        if (session.ref.organizationId !== configuration.organizationId) continue;
        const next = configuration.agents.find(
          (agent) => agent.id === session.ref.agentId && agent.enabled,
        );
        const old = previous?.agents.find((agent) => agent.id === session.ref.agentId);
        if (next && JSON.stringify(next) === JSON.stringify(old)) continue;
        session.revoke();
        try {
          await session.adapter.disconnect();
        } finally {
          sessions.delete(session.ref.id);
          emit(session.ref, { type: "disconnected" });
        }
      }
      const directory = await materialize(accountDirectory, configuration);
      await store.configure(configuration);
      return { directory };
    },
    async scanConfiguration(scope) {
      const root = await directory(scope);
      return {
        ...scope,
        directory: root,
        skills: await scanNativeSkills(root, scope.harness),
        mcpServers: await scanNativeServers(root, scope.harness),
      };
    },
    async scanSkills(scope) {
      const root = await directory(scope);
      return { ...scope, skills: await scanNativeSkills(root, scope.harness) };
    },
    async saveSkill(input) {
      await saveNativeSkill(await directory(input), input.harness, input.skill);
    },
    async deleteSkill(input) {
      await deleteNativeSkill(await directory(input), input.harness, input.id);
    },
    async saveMcpServer(input) {
      await editNativeServer(await directory(input), input.harness, input.server.id, input.server);
    },
    async deleteMcpServer(input) {
      await editNativeServer(await directory(input), input.harness, input.id);
    },
    async inspect() {
      assertOpen();
      return Promise.all(
        (["opencode", "antigravity", "claude", "codex"] as const).map(async (harness) => {
          const capabilities = {
            resume: true,
            permissions: true,
            nativeAgents:
              harness === "opencode" || harness === "antigravity" || harness === "claude",
          };
          try {
            const executable = await resolveExecutable(harness, options.executables?.[harness]);
            const version = await binaryVersion(executable);
            if (harness === "antigravity" && !(await antigravityAcpAvailable(executable)))
              return {
                harness,
                available: false,
                executable,
                version,
                error: "Installed agy lacks ACP --process-per-session. Update Antigravity CLI.",
                capabilities: { resume: false, permissions: false, nativeAgents: false },
              };
            return { harness, available: true, executable, version, capabilities };
          } catch (error) {
            return {
              harness,
              available: false,
              error: error instanceof Error ? error.message : "Inspection failed.",
              capabilities,
            };
          }
        }),
      );
    },
    async execute(command) {
      assertOpen();
      const configuration = await store.configuration(command.organizationId);
      if (!configuration)
        throw new HarnessError(
          "organization-not-configured",
          "Configure this organization before starting native agents.",
        );
      if (command.type === "start") {
        const agent = configuration.agents.find((entry) => entry.id === command.agentId);
        if (!agent)
          throw new HarnessError(
            "agent-not-found",
            "Agent is not configured in this organization.",
          );
        return connect(configuration, agent);
      }
      const ref = await store.session(command.organizationId, command.sessionId);
      if (!ref)
        throw new HarnessError(
          "session-not-found",
          "Session is not associated with this organization.",
        );
      if (command.type === "resume") {
        const agent = configuration.agents.find(
          (entry) => entry.id === ref.agentId && entry.harness === ref.harness,
        );
        if (!agent)
          throw new HarnessError(
            "agent-not-found",
            "The session's native harness profile is no longer configured.",
          );
        return connect(configuration, agent, ref);
      }
      const session = sessions.get(ref.id);
      if (!session) throw new HarnessError("not-connected", "Resume the native session first.");
      switch (command.type) {
        case "prompt":
          if (session.busy)
            throw new HarnessError("session-busy", "Wait for the current turn or interrupt it.");
          if (!command.text.trim())
            throw new HarnessError("empty-prompt", "Prompt cannot be empty.");
          session.busy = true;
          // A prompt acknowledges immediately so utility-process RPC can deliver replies and interrupts.
          void session.adapter
            .prompt(command.text)
            .catch((error) => {
              emit(ref, {
                type: "error",
                code: error instanceof HarnessError ? error.code : "native-error",
                message: "Native turn failed. Check native authentication and configuration.",
              });
            })
            .finally(() => {
              session.busy = false;
            });
          return;
        case "interrupt":
          return session.adapter.interrupt();
        case "respond":
          return session.adapter.respond(command.requestId, command.response);
        case "disconnect":
          session.revoke();
          try {
            await session.adapter.disconnect();
          } finally {
            sessions.delete(ref.id);
            emit(ref, { type: "disconnected" });
          }
          return;
      }
    },
    subscribe(listener) {
      assertOpen();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      modelDiscovery.abort();
      const results = await Promise.allSettled(
        [...sessions.values()].map(async (session) => {
          session.revoke();
          await session.adapter.disconnect();
        }),
      );
      sessions.clear();
      listeners.clear();
      await mcp.close();
      store.close();
      const failure = results.find((entry) => entry.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
  };
}
