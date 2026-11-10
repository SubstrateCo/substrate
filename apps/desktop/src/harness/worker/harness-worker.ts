import { createHarnessHost, type RuntimeHarnessHost } from "@startup-os/harness-runtime";

import type { HarnessWorkerRequest, HarnessWorkerResult } from "./protocol.ts";
import {
  createLocalToolProxy,
  createWorkspaceProxy,
  type LocalToolResponse,
  type WorkspaceApiResponse,
} from "./workspace-proxy.ts";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-runtime-typeof -- Rejections arrive untyped; only a well-formed code string crosses the process boundary. */

/** Forwards only fixed error codes, never native output or local paths. */
function errorCode(error: unknown) {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^[a-zA-Z][a-zA-Z_-]{0,63}$/.test(code)
    ? code
    : "harness-error";
}

// This dedicated process receives messages only from the trusted main-process controller.
const port = process.parentPort;
let host: RuntimeHarnessHost | undefined;
let queue = Promise.resolve();
const workspaceProxy = createWorkspaceProxy((message) => port.postMessage(message));
const localToolProxy = createLocalToolProxy((message) => port.postMessage(message));

function reply(id: number, task: () => Promise<HarnessWorkerResult>) {
  return task().then(
    (result) => port.postMessage({ id, result }),
    (error: unknown) =>
      port.postMessage({ id, error: "Harness operation failed.", code: errorCode(error) }),
  );
}

port.on(
  "message",
  ({ data }: { data: HarnessWorkerRequest | WorkspaceApiResponse | LocalToolResponse }) => {
    if ("apiResponse" in data) {
      workspaceProxy.receive(data);
      return;
    }
    if ("localResponse" in data) {
      localToolProxy.receive(data);
      return;
    }
    if (data.method === "dispose") {
      workspaceProxy.dispose();
      localToolProxy.dispose();
      void reply(data.id, async () => host?.dispose());
      return;
    }
    // An organization's sessions close at once, also while the next organization configures.
    // Without a host, nothing is open.
    if (data.method === "closeOrganization") {
      const current = host;
      void reply(data.id, async () => current?.closeOrganization(data.value));
      return;
    }
    // Session commands, model discovery and profile reads do not wait behind configuration
    // work. The host orders commands per session; interrupt and respond reach a live turn at once.
    if (
      data.method === "execute" ||
      data.method === "listModels" ||
      data.method === "readProfile"
    ) {
      const current = host;
      if (!current) {
        port.postMessage({
          id: data.id,
          error: "Harness not initialized.",
          code: "not-initialized",
        });
        return;
      }
      if (data.method === "execute") void reply(data.id, () => current.execute(data.value));
      else if (data.method === "listModels")
        void reply(data.id, () => current.listModels(data.value));
      else void reply(data.id, () => current.readProfile(data.value));
      return;
    }
    queue = queue.then(() =>
      reply(data.id, async () => {
        if (data.method === "initialize") {
          const initialized = await createHarnessHost({
            accountDirectory: data.value,
            workspaceProxy: workspaceProxy.request,
            localTools: localToolProxy.request,
          });
          host = initialized;
          initialized.subscribe((event) => port.postMessage({ event }));
          return undefined;
        }
        if (!host) throw new Error("Harness not initialized.");
        switch (data.method) {
          case "configure":
            return host.configure(data.value);
          case "inspect":
            return host.inspect();
          case "scanConfiguration":
            return host.scanConfiguration(data.value);
          case "saveSkill":
            return host.saveSkill(data.value);
          case "deleteSkill":
            return host.deleteSkill(data.value);
          case "resetDefaults":
            return host.resetDefaults(data.value);
          case "saveMcpServer":
            return host.saveMcpServer(data.value);
          case "deleteMcpServer":
            return host.deleteMcpServer(data.value);
          default:
            throw new Error("Unsupported harness operation.", { cause: data satisfies never });
        }
      }),
    );
  },
);
