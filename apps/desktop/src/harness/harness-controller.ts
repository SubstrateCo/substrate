import { harnessKinds, harnessModelCatalogSchema } from "@startup-os/contracts/harness";
import type { WorkspaceApiProxy } from "@startup-os/contracts/harness/mcp";

import {
  localHarnessMethods,
  parseHarnessCommand,
  parseLocalConfiguration,
  rendererLocalSchemas,
  skillSchema,
  serverSchema,
} from "./harness-bridge.ts";
import type { HarnessMethod, LocalHarnessMethod } from "./harness-bridge.ts";
import { createMcpApiProxy } from "./mcp-api-proxy.ts";
import { createHash } from "node:crypto";
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

const verifiedSessionSchema = z.object({
  user: z.object({ id: z.string().min(1), emailVerified: z.literal(true) }),
  session: z.object({
    activeOrganizationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  }),
});
const catalogSchema = z.object({
  success: z.literal(true),
  data: z.object({
    agents: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        instructions: z.string(),
        harness: z.enum(harnessKinds),
        model: z.string().optional(),
        enabled: z.boolean(),
        useStartupDefaults: z.boolean(),
      }),
    ),
  }),
});
const localResultSchema = z.object({
  organizationId: z.string(),
  harness: z.enum(harnessKinds),
  skills: z.array(skillSchema.strip()),
  mcpServers: z.array(
    z.union(
      serverSchema.options.map((schema) =>
        schema.strip().extend({ readOnly: z.boolean().optional() }),
      ),
    ),
  ),
});
const inspectionSchema = z.array(
  z.object({
    harness: z.enum(harnessKinds),
    available: z.boolean(),
    version: z.string().optional(),
    capabilities: z.object({
      resume: z.boolean(),
      permissions: z.boolean(),
      nativeAgents: z.boolean(),
    }),
  }),
);
const localMethodSchema = z.enum(localHarnessMethods);

function prepareLocalInput(method: LocalHarnessMethod, value: unknown, organizationId: string) {
  if (method === "saveSkill") {
    const { harness, ...skill } = rendererLocalSchemas.saveSkill.parse(value);
    return parseLocalConfiguration(method, {
      organizationId,
      harness,
      skill: { ...skill, id: skill.id ?? skill.name },
    });
  }
  if (method === "saveMcpServer") {
    const { harness, ...server } = rendererLocalSchemas.saveMcpServer.parse(value);
    return parseLocalConfiguration(method, {
      organizationId,
      harness,
      server: { ...server, id: server.id ?? server.name },
    });
  }
  return parseLocalConfiguration(method, {
    ...rendererLocalSchemas[method].parse(value),
    organizationId,
  });
}

/** Main-only authority. Never accepts an account path or a catalog from IPC. */
export function createHarnessController(options: {
  backend: string;
  accountsDirectory: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  createWorker: (accountDirectory: string, proxy: WorkspaceApiProxy) => HarnessWorker;
}) {
  let worker: HarnessWorker | undefined;
  let identity: string | undefined;
  let generation = 0;
  let queue = Promise.resolve<unknown>(undefined);

  function disconnect() {
    generation++;
    worker?.dispose();
    worker = undefined;
    identity = undefined;
  }

  async function verified() {
    const response = await options.fetchAPI(new URL("/api/v1/session", options.backend).href, {
      method: "GET",
      redirect: "error",
    });
    if (!response.ok) throw new Error("Session unavailable.");
    const { data } = z
      .object({ success: z.literal(true), data: verifiedSessionSchema })
      .parse(await response.json());
    const organizationId = data.session.activeOrganizationId;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(organizationId)) throw new Error("Session unavailable.");
    const membershipURL = new URL("/api/auth/organization/get-active-member-role", options.backend);
    membershipURL.searchParams.set("organizationId", organizationId);
    const membership = await options.fetchAPI(membershipURL.href, {
      method: "GET",
      redirect: "error",
    });
    if (!membership.ok) throw new Error("Organization unavailable.");
    z.object({ role: z.string().min(1) }).parse(await membership.json());
    const accountKey = createHash("sha256")
      .update(JSON.stringify([new URL(options.backend).origin, data.user.id]))
      .digest("hex");
    return { accountKey, organizationId, userId: data.user.id, identity: accountKey };
  }

  async function perform(method: HarnessMethod, value?: unknown) {
    const epoch = generation;
    try {
      const auth = await verified();
      if (epoch !== generation) throw new Error("Session changed.");
      if (identity && identity !== auth.identity) disconnect();
      if (method === "synchronize") {
        if (value !== undefined) throw new Error("Invalid synchronization.");
        const current = generation;
        const response = await options.fetchAPI(
          new URL("/api/v1/agents/list", options.backend).href,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
            redirect: "error",
          },
        );
        const result = catalogSchema.parse(await response.json());
        if (!response.ok) throw new Error("Catalog unavailable.");
        // Recheck authority after the catalog request, including an organization switch.
        const latest = await verified();
        if (current !== generation || latest.identity !== auth.identity)
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
          agents: result.data.agents,
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
          return localResultSchema.parse(result);
        }
        if (method === "listModels") {
          const catalog = harnessModelCatalogSchema.parse(result);
          if (catalog.harness !== input.harness) throw new Error("Invalid model catalog.");
          return catalog;
        }
        if (method === "scanSkills") {
          return localResultSchema.omit({ mcpServers: true }).parse(result);
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
          harnesses: inspectionSchema.parse(result),
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
    run(method: HarnessMethod, value?: unknown) {
      const result = queue.then(() => perform(method, value));
      if (method === "listModels") return result;
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
