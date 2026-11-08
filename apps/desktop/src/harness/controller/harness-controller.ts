import {
  harnessInspectionSchema,
  harnessLocalConfigurationSchema,
  harnessModelCatalogSchema,
} from "@startup-os/contracts/harness";
import type { WorkspaceApiProxy } from "@startup-os/contracts/harness/mcp";

import {
  harnessMethods,
  localHarnessMethods,
  parseHarnessCommand,
} from "../bridge/harness-bridge.ts";
import type { HarnessMethod, LocalHarnessMethod } from "../bridge/harness-bridge.ts";
import { createMcpApiProxy } from "../mcp/mcp-api-proxy.ts";
import { createHarnessAuthority, readVerifiedSession } from "./harness-authority.ts";
import { prepareLocalInput } from "./local-configuration.ts";
import { join } from "node:path";
/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- Main parses IPC and worker response payloads at this boundary. The injected transport carries structured-clone values. */
import { z } from "zod";

export interface HarnessWorker {
  request(
    method: "configure" | "inspect" | "execute" | LocalHarnessMethod,
    value?: unknown,
  ): Promise<unknown>;
  dispose(): void;
}

const methodSchema = z.enum(harnessMethods);
const localMethodSchema = z.enum(localHarnessMethods);

/** Main-only authority. Never accepts an account path or a catalog from IPC. */
export function createHarnessController(options: {
  backend: string;
  accountsDirectory: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  createWorker: (accountDirectory: string, proxy: WorkspaceApiProxy) => HarnessWorker;
}) {
  const authority = createHarnessAuthority(options);
  let worker: HarnessWorker | undefined;
  let identity: string | undefined;
  let generation = 0;
  let queue = Promise.resolve<unknown>(undefined);
  let syncing: Promise<unknown> | undefined;

  function disconnect() {
    generation++;
    syncing = undefined;
    worker?.dispose();
    worker = undefined;
    identity = undefined;
  }

  async function perform(method: HarnessMethod, value?: unknown) {
    const epoch = generation;
    try {
      const auth = await authority.verify();
      if (epoch !== generation) throw new Error("Session changed.");
      if (identity && identity !== auth.identity) disconnect();
      if (method === "synchronize") {
        const current = generation;
        const agents = await authority.catalog();
        // Renderer organization switches do not bump the generation; reread only the session.
        // Membership was verified for this organization before the catalog request.
        const latest = await readVerifiedSession(options.fetchAPI, options.backend);
        if (
          current !== generation ||
          latest.user.id !== auth.userId ||
          latest.session.activeOrganizationId !== auth.organizationId
        )
          throw new Error("Session changed.");
        worker ??= options.createWorker(
          join(options.accountsDirectory, auth.accountKey),
          createMcpApiProxy({
            backend: options.backend,
            userId: auth.userId,
            fetchAPI: options.fetchAPI,
            isActive: () => current === generation,
          }),
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
      if (method === "execute") {
        const command = parseHarnessCommand(value);
        if (command.organizationId !== auth.organizationId)
          throw new Error("Organization unavailable.");
        value = command;
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
      const result = await worker.request(method === "status" ? "inspect" : "execute", value);
      if (current !== generation || identity !== auth.identity) throw new Error("Session changed.");
      if (method === "status")
        return {
          connected: true,
          organizationId: auth.organizationId,
          harnesses: z.array(harnessInspectionSchema).parse(result),
        };
      return result;
    } catch {
      disconnect();
      // Do not reveal account IDs, backend errors, or local file paths to the renderer.
      throw new Error("Harness unavailable. Verify your session and synchronize again.");
    }
  }

  return {
    disconnect,
    /** The only IPC method allowlist. Renderer values are parsed again in perform(). */
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
  };
}
