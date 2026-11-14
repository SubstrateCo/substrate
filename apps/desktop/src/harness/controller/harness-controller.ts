import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import {
  harnessIdSchema,
  harnessInspectionSchema,
  harnessLocalConfigurationSchema,
  harnessModelCatalogSchema,
  harnessSessionRefSchema,
  commandSchema,
  type HarnessCommand,
  type HarnessCommandResult,
  type HarnessErrorCode,
} from "@substrate/contracts/harness";
import { harnessMethods, localHarnessMethods } from "@substrate/contracts/harness/ipc";
import type { HarnessAPI, HarnessMethod } from "@substrate/contracts/harness/ipc";
import {
  localToolRequest,
  workspaceApiResult,
  type LocalToolProxy,
  type WorkspaceApiProxy,
} from "@substrate/contracts/harness/mcp";
import { mcpTools } from "@substrate/contracts/harness/tools";

import {
  DesktopSessionAuthority,
  HarnessAccessDenied,
} from "../../session/desktop-session-authority.ts";
import { createMcpApiProxy } from "../mcp/mcp-api-proxy.ts";
import { HarnessWorkerError, type HarnessWorker } from "../worker/protocol.ts";
import { prepareLocalInput } from "./local-configuration.ts";
import { join } from "node:path";
import { z } from "zod";

const methodSchema = z.enum(harnessMethods);
const localMethodSchema = z.enum(localHarnessMethods);
const interruptReceiptSchema = z.object({ stillQueuedInputIds: z.array(z.string()).optional() });

/** A native command failed after authorization passed. Other sessions keep running. */
class CommandFailure extends Error {}

/**
 * A main-only session command failed. code is a fixed harness error code such as
 * "resume-failed", "turn-active", "steer-unsupported", "not-connected", "no-live-turn"
 * (interrupt of a turn that is not live), "timeout" (the command took too long; the worker keeps
 * running) or "worker-stopped"; never native output.
 */
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

/** Main-only authority. Never accepts an account path or a catalog from IPC. */
export function createHarnessController(options: {
  backend: string;
  accountsDirectory: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  authority: DesktopSessionAuthority;
  localToolHandler?: LocalToolProxy;
  onResult?: Parameters<typeof createMcpApiProxy>[0]["onResult"];
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
  const localToolHandler = options.localToolHandler;
  authority.onChange(() => {
    syncing = undefined;
  });

  function disconnect() {
    generation++;
    syncing = undefined;
    worker?.dispose();
    worker = undefined;
    identity = undefined;
  }

  /**
   * The current generation. assertCurrent throws once it changed, or, given an identity, once
   * the worker serves another account.
   */
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

  /** Session commands verify once per generation, and again after refreshAuthority(). */
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

  async function perform(method: HarnessMethod, value?: IpcValue) {
    const session = capture();
    try {
      const auth = await authority.verify();
      session.assertCurrent();
      if (identity && identity !== auth.identity) disconnect();
      if (method === "synchronize") {
        const sync = capture();
        const { agents } = await authority.catalog();
        // Renderer organization switches do not bump the generation; reread only the session.
        // Membership was verified for this organization before the catalog request.
        await authority.confirm(auth);
        sync.assertCurrent();
        worker ??= options.createWorker(
          join(options.accountsDirectory, auth.accountKey),
          createMcpApiProxy({
            backend: options.backend,
            fetchAPI: options.fetchAPI,
            isActive: () => sync.current === generation,
            onResult: options.onResult,
          }),
          localTools(sync.current),
        );
        identity = auth.identity;
        await worker.request("configure", {
          agents,
          organizationId: auth.organizationId,
        });
        sync.assertCurrent(auth.identity);
        return { connected: true, organizationId: auth.organizationId };
      }
      const localMethod = localMethodSchema.safeParse(method);
      if (localMethod.success) {
        const input = prepareLocalInput(localMethod.data, value, auth.organizationId);
        if (!worker || identity !== auth.identity) throw new Error("Organization unavailable.");
        const local = capture();
        const result = await worker.request(localMethod.data, input);
        local.assertCurrent(auth.identity);
        if (method === "scanConfiguration") {
          return harnessLocalConfigurationSchema.parse(result);
        }
        if (method === "listModels") {
          const catalog = harnessModelCatalogSchema.parse(result);
          if (catalog.harness !== input.harness) throw new Error("Invalid model catalog.");
          return catalog;
        }
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
      // Do not reveal account IDs, backend errors, or local file paths to the renderer.
      if (error instanceof CommandFailure) throw new Error("Harness command failed.");
      // Only lost access, another account or a stopped worker ends the worker. Network,
      // backend and command failures leave it and its live sessions running.
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
      // A stopped worker cannot recover; the next synchronization starts a new one.
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
    /** The renderer IPC allowlist. Renderer values are parsed again in perform(). */
    run<M extends HarnessMethod>(method: M, value?: IpcValue): Promise<HarnessResult<M>> {
      const parsed = methodSchema.safeParse(method);
      if (
        !parsed.success ||
        ((parsed.data === "status" || parsed.data === "synchronize") && value !== undefined)
      )
        return Promise.reject(new Error("Invalid harness operation."));
      // Several renderer views synchronize at once; they share one verified round trip.
      if (parsed.data === "synchronize" && syncing) {
        // SAFETY: M is "synchronize", and syncing holds the result of a synchronize run.
        return syncing as Promise<HarnessResult<M>>;
      }
      // SAFETY: perform() returns the contract's output shape for each method; the bridge parses it again.
      const result = queue.then(() => perform(parsed.data, value)) as Promise<HarnessResult<M>>;
      if (parsed.data !== "listModels") queue = result.then(ignore, ignore);
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
    /**
     * Main-only session commands for agent work. Not exposed to the renderer. They do not wait
     * in the renderer queue, so interrupt and respond reach a live turn while other work runs.
     */
    async execute<C extends HarnessCommand>(command: C): Promise<HarnessCommandResult<C>> {
      let parsed: HarnessCommand;
      try {
        parsed = commandSchema.parse(command);
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
    /** memory/profile.md of an agent in the verified organization, for its managed prefix. */
    async readProfile(agentId: string): Promise<string> {
      const target = await connected();
      const scope = {
        organizationId: target.auth.organizationId,
        agentId: harnessIdSchema.parse(agentId),
      };
      return z
        .string()
        .parse(await request(target, () => target.worker.request("readProfile", scope)));
    },
    /**
     * Main-only. Interrupts and closes every native session of the organization, also after
     * the verified session moved to another organization of the same account. Agent work calls
     * it when it retires that organization's runtime. Without a worker nothing is open.
     */
    async closeOrganization(organizationId: string): Promise<void> {
      const id = harnessIdSchema.parse(organizationId);
      const target = await connected();
      await request(target, () => target.worker.request("closeOrganization", id));
    },
    /** Verify the session again before the next command. Call on session or access hints. */
    refreshAuthority() {
      authority.invalidate();
    },
  };
}
