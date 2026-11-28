import { harnessConfiguration, turnContextSchema } from "@substrate/contracts/agent-tools";
import {
  localToolRequest,
  workspaceApiResult,
  type LocalToolProxy,
  type WorkspaceApiProxy,
} from "@substrate/contracts/agent-tools/mcp";
import { mcpTools } from "@substrate/contracts/agent-tools/tools";
import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import {
  harnessIdSchema,
  harnessInspectionSchema,
  harnessLocalConfigurationSchema,
  harnessModelCatalogSchema,
  harnessNativeConfigurationSchema,
  harnessSessionRefSchema,
  harnessSignInStateSchema,
  commandSchema,
  skillPackagesSchema,
  skillSourcePreviewSchema,
  type HarnessCommand,
  type HarnessCommandResult,
  type HarnessErrorCode,
} from "@substrate/contracts/harness-runtime";
import {
  harnessMethods,
  localHarnessMethods,
  rendererLocalSchemas,
  rendererSignInSchemas,
  signInHarnessMethods,
} from "@substrate/contracts/harness/ipc";
import type { HarnessAPI, HarnessMethod } from "@substrate/contracts/harness/ipc";
import { workspaceDirectory } from "@substrate/harness-runtime/paths";

import {
  DesktopSessionAuthority,
  HarnessAccessDenied,
} from "../../session/desktop-session-authority.ts";
import { createMcpApiProxy } from "../mcp/mcp-api-proxy.ts";
import { HarnessWorkerError, type HarnessWorker } from "../worker/protocol.ts";
import {
  AgentNotHomedHere,
  prepareLocalInput,
  prepareMcpServerSave,
  requireHomedHere,
  type LocalMcpServers,
  type LocalWorkspaces,
} from "./local-configuration.ts";
import { join } from "node:path";
import { z } from "zod";

const methodSchema = z.enum(harnessMethods);
const localMethodSchema = z.enum(localHarnessMethods);
const signInMethodSchema = z.enum(signInHarnessMethods);
const interruptReceiptSchema = z.object({ stillQueuedInputIds: z.array(z.string()).optional() });

class CommandFailure extends Error {}

class WorkspaceRejected extends Error {
  constructor(message = "This folder can't be used as a working folder.") {
    super(message);
  }
}

export class HarnessCommandError extends Error {
  readonly code: HarnessErrorCode;
  constructor(code: HarnessErrorCode, message = "Harness command failed.") {
    super(message);
    this.name = "HarnessCommandError";
    this.code = code;
  }
}

type Authorization = Awaited<ReturnType<DesktopSessionAuthority["verify"]>>;
type HarnessResult<M extends HarnessMethod> = Awaited<ReturnType<HarnessAPI[M]>>;

const ignore = () => {};

export function createHarnessController(options: {
  backend: string;
  accountsDirectory: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  authority: DesktopSessionAuthority;
  localToolHandler?: LocalToolProxy;
  mcpServers: LocalMcpServers;
  workspaces: LocalWorkspaces;
  pickWorkspace: () => Promise<string | null>;
  onResult?: Parameters<typeof createMcpApiProxy>[0]["onResult"];
  approval?: Parameters<typeof createMcpApiProxy>[0]["approval"];
  createWorker: (
    accountDirectory: string,
    proxy: WorkspaceApiProxy,
    localTools: LocalToolProxy,
  ) => HarnessWorker;
}) {
  const authority = options.authority;
  let worker: HarnessWorker | undefined;
  let identity: string | undefined;
  let generation = 0;
  let queue = Promise.resolve();
  let syncing: Promise<HarnessResult<"synchronize">> | undefined;
  let updateTimer: ReturnType<typeof setInterval> | undefined;
  let updatesRunning = false;
  const localToolHandler = options.localToolHandler;
  authority.onChange(() => {
    syncing = undefined;
  });

  function disconnect() {
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = undefined;
    generation++;
    syncing = undefined;
    worker?.dispose();
    worker = undefined;
    identity = undefined;
  }

  function capture() {
    const current = generation;
    return {
      current,
      assertCurrent(expected?: string) {
        if (current !== generation || (expected !== undefined && identity !== expected))
          throw new Error("Session changed.");
      },
    };
  }

  function authorized(): Promise<Authorization> {
    const session = capture();
    return authority.verify().then((auth) => {
      session.assertCurrent();
      if (identity && identity !== auth.identity) throw new HarnessAccessDenied("Account changed.");
      return auth;
    });
  }

  function localTools(current: number): LocalToolProxy {
    return async (raw) => {
      if (current !== generation || !localToolHandler)
        throw new Error("Local tools are unavailable.");
      const request = localToolRequest.parse(raw);
      mcpTools[request.tool].input.parse(request.input);
      return workspaceApiResult.parse(await localToolHandler(request));
    };
  }

  async function requireAgent(agentId: string) {
    requireHomedHere(await authority.catalog(), agentId);
  }

  async function runLocal(
    target: HarnessWorker,
    method: z.infer<typeof localMethodSchema>,
    value: IpcValue,
    auth: Authorization,
  ) {
    const { organizationId } = auth;
    switch (method) {
      case "scanSkillPackages":
      case "previewSkillSource":
      case "installSkillPackage":
      case "removeSkillPackage":
      case "updateSkillPackages":
      case "setSkillUpdateFrequency": {
        const input = rendererLocalSchemas[method].parse(value);
        await requireAgent(input.agentId);
        const result = await target.request(method, { ...input, organizationId });
        if (method === "scanSkillPackages") return skillPackagesSchema.parse(result);
        if (method === "previewSkillSource") return skillSourcePreviewSchema.parse(result);
        return;
      }
      case "chooseWorkspace": {
        const { agentId } = rendererLocalSchemas.chooseWorkspace.parse(value);
        await requireAgent(agentId);
        const chosen = await options.pickWorkspace();
        if (chosen === null) return;
        const accountDirectory = join(options.accountsDirectory, auth.accountKey);
        let path: string;
        try {
          path = await workspaceDirectory(accountDirectory, chosen);
        } catch (error) {
          throw new WorkspaceRejected(error instanceof Error ? error.message : undefined);
        }
        return options.workspaces.set(organizationId, agentId, path);
      }
      case "clearWorkspace": {
        const { agentId } = rendererLocalSchemas.clearWorkspace.parse(value);
        await requireAgent(agentId);
        return options.workspaces.set(organizationId, agentId, null);
      }
      case "saveMcpServer": {
        const { agentId, server } = prepareMcpServerSave(value);
        await requireAgent(agentId);
        return options.mcpServers.save(organizationId, agentId, server);
      }
      case "deleteMcpServer": {
        const { agentId, id } = rendererLocalSchemas.deleteMcpServer.parse(value);
        await requireAgent(agentId);
        return options.mcpServers.delete(organizationId, agentId, id);
      }
      case "scanConfiguration": {
        const input = prepareLocalInput(method, value, organizationId);
        await requireAgent(input.agentId);
        const native = harnessNativeConfigurationSchema.parse(await target.request(method, input));
        return harnessLocalConfigurationSchema.parse({
          ...native,
          mcpServers: await options.mcpServers.list(organizationId, input.agentId),
          workspace: await options.workspaces.get(organizationId, input.agentId),
        });
      }
      case "listModels": {
        const input = prepareLocalInput(method, value, organizationId);
        const catalog = harnessModelCatalogSchema.parse(await target.request(method, input));
        if (catalog.harness !== input.harness) throw new Error("Invalid model catalog.");
        return catalog;
      }
      case "saveSkill": {
        const input = prepareLocalInput(method, value, organizationId);
        await requireAgent(input.agentId);
        return target.request(method, input);
      }
      case "deleteSkill": {
        const input = prepareLocalInput(method, value, organizationId);
        await requireAgent(input.agentId);
        return target.request(method, input);
      }
      case "resetDefaults": {
        const input = prepareLocalInput(method, value, organizationId);
        await requireAgent(input.agentId);
        return target.request(method, input);
      }
    }
  }

  async function runSignIn(
    target: HarnessWorker,
    method: z.infer<typeof signInMethodSchema>,
    value: IpcValue,
  ) {
    switch (method) {
      case "signIn": {
        const input = rendererSignInSchemas.signIn.parse(value);
        const state = harnessSignInStateSchema.parse(await target.request(method, input));
        if (state.harness !== input.harness) throw new Error("Invalid sign-in state.");
        return state;
      }
      case "readSignIn": {
        const input = rendererSignInSchemas.readSignIn.parse(value);
        const state = harnessSignInStateSchema.parse(await target.request(method, input));
        if (state.loginId !== input.loginId) throw new Error("Invalid sign-in state.");
        return state;
      }
      case "sendSignInInput":
        await target.request(method, rendererSignInSchemas.sendSignInInput.parse(value));
        return;
      case "cancelSignIn":
        await target.request(method, rendererSignInSchemas.cancelSignIn.parse(value));
        return;
      case "signOut":
        await target.request(method, rendererSignInSchemas.signOut.parse(value));
        return;
    }
  }

  async function perform(method: HarnessMethod, value?: IpcValue) {
    const session = capture();
    try {
      const auth = await authority.verify();
      session.assertCurrent();
      if (identity && identity !== auth.identity) disconnect();
      if (method === "synchronize") {
        const sync = capture();
        const { agents } = await authority.catalog();
        const { enabledApps } = await authority.appSettings();
        await authority.confirm(auth);
        sync.assertCurrent();
        worker ??= options.createWorker(
          join(options.accountsDirectory, auth.accountKey),
          createMcpApiProxy({
            backend: options.backend,
            fetchAPI: options.fetchAPI,
            isActive: () => sync.current === generation,
            onResult: options.onResult,
            approval: options.approval,
          }),
          localTools(sync.current),
        );
        identity = auth.identity;
        await worker.request(
          "configure",
          harnessConfiguration({ agents, enabledApps, organizationId: auth.organizationId }),
        );
        sync.assertCurrent(auth.identity);
        if (!updateTimer) {
          updateTimer = setInterval(() => void scheduledUpdates(), 60_000);
          updateTimer.unref();
        }
        return { connected: true, organizationId: auth.organizationId };
      }
      const signInMethod = signInMethodSchema.safeParse(method);
      if (signInMethod.success) {
        if (!worker || identity !== auth.identity) throw new Error("Organization unavailable.");
        const local = capture();
        const result = await runSignIn(worker, signInMethod.data, value);
        local.assertCurrent(auth.identity);
        return result;
      }
      const localMethod = localMethodSchema.safeParse(method);
      if (localMethod.success) {
        if (!worker || identity !== auth.identity) throw new Error("Organization unavailable.");
        const local = capture();
        const result = await runLocal(worker, localMethod.data, value, auth);
        local.assertCurrent(auth.identity);
        return result;
      }
      if (!worker || identity !== auth.identity) return { connected: false };
      const inspection = capture();
      const result = await worker.request("inspect").catch((cause: unknown) => {
        if (cause instanceof HarnessWorkerError && cause.code === "worker-stopped") throw cause;
        throw new CommandFailure();
      });
      inspection.assertCurrent(auth.identity);
      return {
        connected: true,
        organizationId: auth.organizationId,
        harnesses: z.array(harnessInspectionSchema).parse(result),
      };
    } catch (error) {
      if (error instanceof CommandFailure) throw new Error("Harness command failed.");
      if (error instanceof AgentNotHomedHere)
        throw new HarnessCommandError("agent-not-home", error.message);
      if (error instanceof WorkspaceRejected)
        throw new HarnessCommandError("invalid-workspace", error.message);
      if (
        error instanceof HarnessAccessDenied ||
        (error instanceof HarnessWorkerError && error.code === "worker-stopped")
      )
        disconnect();
      throw new HarnessCommandError(
        "harness-unavailable",
        "Harness unavailable. Verify your session and synchronize again.",
      );
    }
  }

  async function scheduledUpdates() {
    if (updatesRunning || !worker) return;
    updatesRunning = true;
    try {
      const session = capture();
      const auth = await authority.verify();
      const catalog = await authority.catalog();
      session.assertCurrent(auth.identity);
      for (const agent of catalog.agents) {
        if (
          !agent.enabled ||
          !catalog.runSettings.some(
            (setting) => setting.agentId === agent.id && setting.homeDevice?.current,
          )
        )
          continue;
        // perform rechecks identity and home ownership. Busy agents retry on the next tick.
        await perform("updateSkillPackages", {
          agentId: agent.id,
          harness: agent.harness,
          scheduled: true,
        }).catch(() => {});
        session.assertCurrent(auth.identity);
      }
    } catch {
      // Offline, signed out, or switched account: no maintenance until authorization returns.
    } finally {
      updatesRunning = false;
    }
  }

  /** The connected worker for the verified organization, or a command error. */
  async function connected(organizationId?: string) {
    let auth: Authorization;
    try {
      auth = await authorized();
    } catch (error) {
      if (error instanceof HarnessAccessDenied) disconnect();
      throw new HarnessCommandError(
        "harness-unavailable",
        "Harness unavailable. Verify your session and synchronize again.",
      );
    }
    if (organizationId !== undefined && organizationId !== auth.organizationId)
      throw new HarnessCommandError("organization-unavailable");
    if (!worker || identity !== auth.identity) throw new HarnessCommandError("not-connected");
    return { auth, worker, current: generation };
  }

  async function request<T>(target: Awaited<ReturnType<typeof connected>>, run: () => Promise<T>) {
    const result = await run().catch((cause: unknown) => {
      const code = cause instanceof HarnessWorkerError ? cause.code : "harness-error";
      if (code === "worker-stopped" && target.worker === worker) disconnect();
      throw new HarnessCommandError(code);
    });
    if (target.current !== generation || target.worker !== worker)
      throw new HarnessCommandError("session-changed");
    return result;
  }

  return {
    disconnect,
    async closeSessions() {
      if (!worker) return;
      const auth = await authority.verify();
      await worker.request("closeOrganization", auth.organizationId);
    },
    run<M extends HarnessMethod>(method: M, value?: IpcValue): Promise<HarnessResult<M>> {
      const parsed = methodSchema.safeParse(method);
      if (
        !parsed.success ||
        ((parsed.data === "status" || parsed.data === "synchronize") && value !== undefined)
      )
        return Promise.reject(new Error("Invalid harness operation."));
      if (parsed.data === "synchronize" && syncing) {
        // SAFETY: M is "synchronize", and syncing holds the result of a synchronize run.
        return syncing as Promise<HarnessResult<M>>;
      }
      // SAFETY: perform() returns the contract's output shape for each method; the bridge parses it again.
      const result = queue.then(() => perform(parsed.data, value)) as Promise<HarnessResult<M>>;
      if (parsed.data !== "listModels" && !signInMethodSchema.safeParse(parsed.data).success)
        queue = result.then(ignore, ignore);
      if (parsed.data === "synchronize") {
        // SAFETY: this run is a synchronize run.
        syncing = result as Promise<HarnessResult<"synchronize">>;
        const clear = () => {
          if (syncing === result) syncing = undefined;
        };
        result.then(clear, clear);
      }
      return result;
    },
    async execute<C extends HarnessCommand>(command: C): Promise<HarnessCommandResult<C>> {
      let parsed: HarnessCommand;
      try {
        parsed = commandSchema.parse(command);
        if (parsed.type === "turn") turnContextSchema.parse(parsed.context);
      } catch {
        throw new HarnessCommandError("invalid-command");
      }
      const target = await connected(parsed.organizationId);
      const result = await request(target, () => target.worker.request("execute", parsed));
      if (parsed.type === "open") {
        // SAFETY: an open command's result is the session ref parsed here.
        return harnessSessionRefSchema.parse(result) as HarnessCommandResult<C>;
      }
      if (parsed.type === "interrupt") {
        // SAFETY: an interrupt command's result is the receipt parsed here.
        return interruptReceiptSchema.parse(result ?? {}) as HarnessCommandResult<C>;
      }
      // SAFETY: every other command resolves to void.
      return undefined as HarnessCommandResult<C>;
    },
    async closeOrganization(organizationId: string): Promise<void> {
      const id = harnessIdSchema.parse(organizationId);
      const target = await connected();
      await request(target, () => target.worker.request("closeOrganization", id));
    },
    refreshAuthority() {
      authority.invalidate();
    },
  };
}
