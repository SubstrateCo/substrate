import type {
  HarnessHost,
  HarnessCommand,
  HarnessConfiguration,
  HarnessLocalScope,
  HarnessSkill,
  HarnessMcpServer,
  HarnessInspection,
  HarnessSessionRef,
  HarnessLocalConfiguration,
  HarnessModelCatalog,
} from "@startup-os/contracts/harness";
import {
  workspaceApiResult,
  type WorkspaceApiResult,
  type WorkspaceApiProxy,
} from "@startup-os/contracts/harness/mcp";
import { createHarnessHost } from "@startup-os/harness-runtime";

import { fileURLToPath } from "node:url";

type Request = { id: number } & (
  | { method: "initialize"; value: string }
  | { method: "configure"; value: HarnessConfiguration }
  | { method: "inspect" }
  | { method: "dispose" }
  | { method: "execute"; value: HarnessCommand }
  | { method: "scanConfiguration"; value: HarnessLocalScope }
  | { method: "listModels"; value: HarnessLocalScope }
  | { method: "scanSkills"; value: HarnessLocalScope }
  | { method: "saveSkill"; value: HarnessLocalScope & { skill: HarnessSkill } }
  | { method: "saveMcpServer"; value: HarnessLocalScope & { server: HarnessMcpServer } }
  | { method: "deleteSkill" | "deleteMcpServer"; value: HarnessLocalScope & { id: string } }
);
type Result =
  | { directory: string }
  | HarnessInspection[]
  | HarnessSessionRef
  | HarnessLocalConfiguration
  | HarnessModelCatalog
  | Pick<HarnessLocalConfiguration, "organizationId" | "harness" | "skills">
  | void;
// This dedicated process receives messages only from the trusted main-process controller.
const port = process.parentPort;
let host: HarnessHost | undefined;
let queue = Promise.resolve();
let nextApiID = 0;
const pendingApi = new Map<
  number,
  {
    resolve: (value: WorkspaceApiResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const workspaceProxy: WorkspaceApiProxy = (request) =>
  new Promise((resolve, reject) => {
    const id = ++nextApiID;
    const timer = setTimeout(() => {
      pendingApi.delete(id);
      reject(new Error("Workspace request timed out."));
    }, 30_000);
    pendingApi.set(id, { resolve, reject, timer });
    port.postMessage({ id, api: request });
  });
port.on(
  "message",
  ({ data }: { data: Request | { apiResponse: number; result?: unknown; error?: string } }) => {
    if ("apiResponse" in data) {
      const pending = pendingApi.get(data.apiResponse);
      if (!pending) return;
      pendingApi.delete(data.apiResponse);
      clearTimeout(pending.timer);
      if (data.error) pending.reject(new Error(data.error));
      else {
        const parsed = workspaceApiResult.safeParse(data.result);
        if (parsed.success) pending.resolve(parsed.data);
        else pending.reject(new Error("Invalid workspace response."));
      }
      return;
    }
    if (data.method === "listModels" && host) {
      void host.listModels(data.value).then(
        (result) => port.postMessage({ id: data.id, result }),
        () => port.postMessage({ id: data.id, error: "Model discovery failed." }),
      );
      return;
    }
    if (data.method === "dispose") {
      for (const pending of pendingApi.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Harness shutdown."));
      }
      pendingApi.clear();
      void Promise.resolve(host?.dispose()).then(
        () => port.postMessage({ id: data.id }),
        () => port.postMessage({ id: data.id, error: "Harness shutdown failed." }),
      );
      return;
    }
    queue = queue.then(async () => {
      try {
        let result: Result = undefined;
        if (data.method === "initialize") {
          const initialized: HarnessHost = await createHarnessHost({
            accountDirectory: data.value,
            migrationsDirectory: fileURLToPath(new URL("./harness-migrations/", import.meta.url)),
            workspaceProxy,
          });
          host = initialized;
          initialized.subscribe((event) => port.postMessage({ event }));
        } else if (!host) throw new Error("Harness not initialized.");
        else if (data.method === "configure") result = await host.configure(data.value);
        else if (data.method === "inspect") result = await host.inspect();
        else if (data.method === "execute") result = await host.execute(data.value);
        else if (data.method === "listModels") result = await host.listModels(data.value);
        else if (data.method === "scanConfiguration")
          result = await host.scanConfiguration(data.value);
        else if (data.method === "scanSkills") result = await host.scanSkills(data.value);
        else if (data.method === "saveSkill") result = await host.saveSkill(data.value);
        else if (data.method === "deleteSkill") result = await host.deleteSkill(data.value);
        else if (data.method === "saveMcpServer") result = await host.saveMcpServer(data.value);
        else result = await host.deleteMcpServer(data.value);
        port.postMessage({ id: data.id, result });
      } catch {
        port.postMessage({ id: data.id, error: "Harness operation failed." });
      }
    });
  },
);
