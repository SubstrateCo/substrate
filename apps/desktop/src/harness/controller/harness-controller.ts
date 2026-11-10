import {
  harnessIdSchema,
  harnessInspectionSchema,
  harnessKinds,
  harnessLocalConfigurationSchema,
  harnessModelCatalogSchema,
  adapterCapabilitiesSchema,
  type HarnessCommand,
  type HarnessCommandResult,
} from "@startup-os/contracts/harness";
import {
  localToolRequest,
  workspaceApiResult,
  type LocalToolProxy,
  type WorkspaceApiProxy,
} from "@startup-os/contracts/harness/mcp";
import { mcpTools } from "@startup-os/contracts/harness/tools";

import {
  harnessMethods,
  localHarnessMethods,
  parseHarnessCommand,
} from "../bridge/harness-bridge.ts";
import type { HarnessMethod } from "../bridge/harness-bridge.ts";
import { createMcpApiProxy } from "../mcp/mcp-api-proxy.ts";
import { HarnessWorkerError, type HarnessWorker } from "../worker/protocol.ts";
import {
  createHarnessAuthority,
  HarnessAccessDenied,
  readVerifiedSession,
} from "./harness-authority.ts";
import { prepareLocalInput } from "./local-configuration.ts";
import { join } from "node:path";
/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- Main parses IPC and worker response payloads at this boundary. The injected transport carries structured-clone values. */
import { z } from "zod";

const methodSchema = z.enum(harnessMethods);
const localMethodSchema = z.enum(localHarnessMethods);
const sessionRefSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentId: z.string(),
  harness: z.enum(harnessKinds),
  nativeSessionId: z.string(),
  folder: z.union([z.literal("main"), z.object({ helperId: z.string() })]),
  capabilities: adapterCapabilitiesSchema,
  resumed: z.boolean(),
});
const interruptReceiptSchema = z.object({ stillQueuedInputIds: z.array(z.string()).optional() });

/** A native command failed after authorization passed. Other sessions keep running. */
class CommandFailure extends Error {}

/**
 * A main-only session command failed. code is a fixed harness error code such as
 * "resume-failed", "turn-active", "steer-unsupported", "not-connected", "no-live-turn"
 * (interrupt of a turn that is not live), "timeout" (the command took too long; the worker keeps
 * running) or "worker-stopped"; never native output.
 */
class HarnessCommandError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("Harness command failed.");
    this.name = "HarnessCommandError";
    this.code = code;
  }
}

type Authorization = Awaited<ReturnType<ReturnType<typeof createHarnessAuthority>["verify"]>>;

/** Main-only authority. Never accepts an account path or a catalog from IPC. */
export function createHarnessController(options: {
  backend: string;
  accountsDirectory: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  createWorker: (
    accountDirectory: string,
    proxy: WorkspaceApiProxy,
    localTools: LocalToolProxy,
  ) => HarnessWorker;
}) {
  const authority = createHarnessAuthority(options);
  let worker: HarnessWorker | undefined;
  let identity: string | undefined;
  let generation = 0;
  let queue = Promise.resolve<unknown>(undefined);
  let syncing: Promise<unknown> | undefined;
  let verified: { generation: number; authorization: Promise<Authorization> } | undefined;
  let localToolHandler: LocalToolProxy | undefined;

  function disconnect() {
    generation++;
    syncing = undefined;
    verified = undefined;
    worker?.dispose();
    worker = undefined;
    identity = undefined;
  }

  /** Session commands verify once per generation, and again after refreshAuthority(). */
  function authorized(): Promise<Authorization> {
    if (verified?.generation === generation) return verified.authorization;
    const epoch = generation;
    const authorization = authority.verify().then((auth) => {
      if (epoch !== generation) throw new Error("Session changed.");
      if (identity && identity !== auth.identity) throw new HarnessAccessDenied("Account changed.");
      return auth;
    });
    verified = { generation: epoch, authorization };
    authorization.catch(() => {
      if (verified?.authorization === authorization) verified = undefined;
    });
    return authorization;
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

  async function perform(method: HarnessMethod, value?: unknown) {
    const epoch = generation;
    try {
      const auth = await authority.verify();
      if (epoch !== generation) throw new Error("Session changed.");
      if (identity && identity !== auth.identity) disconnect();
      verified = { generation, authorization: Promise.resolve(auth) };
      if (method === "synchronize") {
        const current = generation;
        const agents = await authority.catalog();
        // Renderer organization switches do not bump the generation; reread only the session.
        // Membership was verified for this organization before the catalog request.
        const latest = await readVerifiedSession(options.fetchAPI, options.backend);
        if (latest.user.id !== auth.userId) throw new HarnessAccessDenied("Account changed.");
        if (current !== generation || latest.session.activeOrganizationId !== auth.organizationId)
          throw new Error("Session changed.");
        worker ??= options.createWorker(
          join(options.accountsDirectory, auth.accountKey),
          createMcpApiProxy({
            backend: options.backend,
            fetchAPI: options.fetchAPI,
            isActive: () => current === generation,
          }),
          localTools(current),
        );
        identity = auth.identity;
        await worker.request("configure", {
          agents,
          organizationId: auth.organizationId,
        });
        if (current !== generation || identity !== auth.identity)
          throw new Error("Session changed.");
        return { connected: true, organizationId: auth.organizationId };
      }
      const localMethod = localMethodSchema.safeParse(method);
      if (localMethod.success) {
        const input = prepareLocalInput(localMethod.data, value, auth.organizationId);
        if (!worker || identity !== auth.identity) throw new Error("Organization unavailable.");
        const current = generation;
        const result = await worker.request(localMethod.data, input);
        if (current !== generation || identity !== auth.identity)
          throw new Error("Session changed.");
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
      const current = generation;
      const result = await worker.request("inspect").catch((error: unknown) => {
        if (error instanceof HarnessWorkerError && error.code === "worker-stopped") throw error;
        throw new CommandFailure();
      });
      if (current !== generation || identity !== auth.identity) throw new Error("Session changed.");
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
      throw new Error("Harness unavailable. Verify your session and synchronize again.");
    }
  }

  /** The connected worker for the verified organization, or a command error. */
  async function connected(organizationId?: string) {
    let auth: Authorization;
    try {
      auth = await authorized();
    } catch (error) {
      if (error instanceof HarnessAccessDenied) disconnect();
      throw new Error("Harness unavailable. Verify your session and synchronize again.");
    }
    if (organizationId !== undefined && organizationId !== auth.organizationId)
      throw new HarnessCommandError("organization-unavailable");
    if (!worker || identity !== auth.identity) throw new HarnessCommandError("not-connected");
    return { auth, worker, current: generation };
  }

  async function request(
    target: Awaited<ReturnType<typeof connected>>,
    run: () => Promise<unknown>,
  ) {
    const result = await run().catch((error: unknown) => {
      const code = error instanceof HarnessWorkerError ? error.code : "harness-error";
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
    /** The renderer IPC allowlist. Renderer values are parsed again in perform(). */
    run(method: unknown, value?: unknown) {
      const parsed = methodSchema.safeParse(method);
      if (
        !parsed.success ||
        ((parsed.data === "status" || parsed.data === "synchronize") && value !== undefined)
      )
        return Promise.reject(new Error("Invalid harness operation."));
      // Several renderer views synchronize at once; they share one verified round trip.
      if (parsed.data === "synchronize" && syncing) return syncing;
      const result = queue.then(() => perform(parsed.data, value));
      if (parsed.data !== "listModels") queue = result.catch(() => undefined);
      if (parsed.data === "synchronize") {
        syncing = result;
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
        parsed = parseHarnessCommand(command);
      } catch {
        throw new HarnessCommandError("invalid-command");
      }
      const target = await connected(parsed.organizationId);
      const result = await request(target, () => target.worker.request("execute", parsed));
      if (parsed.type === "open") {
        // SAFETY: an open command's result is the session ref parsed here.
        return sessionRefSchema.parse(result) as HarnessCommandResult<C>;
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
      verified = undefined;
    },
    /**
     * Registers main's agent-work handler for local tool calls (save_handoff and the helper
     * tools). Requests arrive validated; undefined rejects every local call.
     */
    setLocalToolHandler(handler: LocalToolProxy | undefined) {
      localToolHandler = handler;
    },
  };
}
