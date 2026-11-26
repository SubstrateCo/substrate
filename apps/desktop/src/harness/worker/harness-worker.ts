import { agentToolProvider } from "@substrate/contracts/agent-tools";
import { isHarnessErrorCode } from "@substrate/contracts/harness-runtime";
import { createHarnessHost, type RuntimeHarnessHost } from "@substrate/harness-runtime";

import {
  HarnessWorkerError,
  type HarnessWorkerRequest,
  type HarnessWorkerResult,
} from "./protocol.ts";
import {
  createLocalToolProxy,
  createWorkspaceProxy,
  type LocalToolResponse,
  type WorkspaceApiResponse,
} from "./workspace-proxy.ts";

/** Forwards only fixed error codes, never native output or local paths. */
function errorCode(cause: unknown) {
  const code = cause instanceof Error && "code" in cause ? cause.code : undefined;
  return isHarnessErrorCode(code) ? code : "harness-error";
}

/** Methods that run at once instead of waiting behind configuration work. */
const immediateMethods = [
  "execute",
  "listModels",
  "signIn",
  "readSignIn",
  "sendSignInInput",
  "cancelSignIn",
  "signOut",
] as const;

function isImmediate(
  request: HarnessWorkerRequest,
): request is Extract<HarnessWorkerRequest, { method: (typeof immediateMethods)[number] }> {
  return immediateMethods.some((method) => method === request.method);
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
    (cause: unknown) =>
      port.postMessage({ id, error: "Harness operation failed.", code: errorCode(cause) }),
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
    // Session commands and model discovery do not wait behind configuration
    // work. The host orders commands per session; interrupt and respond reach a live turn at once.
    // Sign-in reads and input also do not wait: a terminal login streams while other work runs.
    if (isImmediate(data)) {
      const current = host;
      if (!current) {
        void reply(data.id, async () => {
          throw new HarnessWorkerError("not-initialized");
        });
        return;
      }
      switch (data.method) {
        case "execute":
          void reply(data.id, () => current.execute(data.value));
          return;
        case "listModels":
          void reply(data.id, () => current.listModels(data.value));
          return;
        case "signIn":
          void reply(data.id, () => current.signIn(data.value));
          return;
        case "readSignIn":
          void reply(data.id, () => current.readSignIn(data.value));
          return;
        case "sendSignInInput":
          void reply(data.id, () => current.sendSignInInput(data.value));
          return;
        case "cancelSignIn":
          void reply(data.id, () => current.cancelSignIn(data.value));
          return;
        case "signOut":
          void reply(data.id, () => current.signOut(data.value));
          return;
      }
    }
    queue = queue.then(() =>
      reply(data.id, async () => {
        if (data.method === "initialize") {
          const initialized = await createHarnessHost({
            accountDirectory: data.value,
            tools: agentToolProvider({
              workspace: workspaceProxy.request,
              local: localToolProxy.request,
            }),
          });
          host = initialized;
          initialized.subscribe((event) => port.postMessage({ event }));
          return undefined;
        }
        if (!host) throw new HarnessWorkerError("not-initialized");
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
          default:
            throw new Error("Unsupported harness operation.", { cause: data satisfies never });
        }
      }),
    );
  },
);
