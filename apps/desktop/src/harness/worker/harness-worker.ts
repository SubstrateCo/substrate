import type { HarnessHost } from "@startup-os/contracts/harness";

import { createDesktopHarnessHost } from "./desktop-harness-host.ts";
import type { HarnessWorkerRequest, HarnessWorkerResult } from "./protocol.ts";
import { createWorkspaceProxy, type WorkspaceApiResponse } from "./workspace-proxy.ts";
import { fileURLToPath } from "node:url";

// This dedicated process receives messages only from the trusted main-process controller.
const port = process.parentPort;
let host: HarnessHost | undefined;
let queue = Promise.resolve();
const workspaceProxy = createWorkspaceProxy((message) => port.postMessage(message));
port.on("message", ({ data }: { data: HarnessWorkerRequest | WorkspaceApiResponse }) => {
  if ("apiResponse" in data) {
    workspaceProxy.receive(data);
    return;
  }
  if (data.method === "listModels") {
    if (!host) {
      port.postMessage({ id: data.id, error: "Harness not initialized." });
      return;
    }
    void host.listModels(data.value).then(
      (result) => port.postMessage({ id: data.id, result }),
      () => port.postMessage({ id: data.id, error: "Model discovery failed." }),
    );
    return;
  }
  if (data.method === "dispose") {
    workspaceProxy.dispose();
    void Promise.resolve(host?.dispose()).then(
      () => port.postMessage({ id: data.id }),
      () => port.postMessage({ id: data.id, error: "Harness shutdown failed." }),
    );
    return;
  }
  queue = queue.then(async () => {
    try {
      let result: HarnessWorkerResult = undefined;
      if (data.method === "initialize") {
        const initialized: HarnessHost = await createDesktopHarnessHost({
          accountDirectory: data.value,
          migrationsDirectory: fileURLToPath(
            new URL("./client-storage-migrations/", import.meta.url),
          ),
          workspaceProxy: workspaceProxy.request,
        });
        host = initialized;
        initialized.subscribe((event) => port.postMessage({ event }));
      } else if (!host) throw new Error("Harness not initialized.");
      else {
        switch (data.method) {
          case "configure":
            result = await host.configure(data.value);
            break;
          case "inspect":
            result = await host.inspect();
            break;
          case "execute":
            result = await host.execute(data.value);
            break;
          case "scanConfiguration":
            result = await host.scanConfiguration(data.value);
            break;
          case "saveSkill":
            result = await host.saveSkill(data.value);
            break;
          case "deleteSkill":
            result = await host.deleteSkill(data.value);
            break;
          case "resetDefaults":
            result = await host.resetDefaults(data.value);
            break;
          case "saveMcpServer":
            result = await host.saveMcpServer(data.value);
            break;
          case "deleteMcpServer":
            result = await host.deleteMcpServer(data.value);
            break;
          default:
            throw new Error("Unsupported harness operation.", { cause: data satisfies never });
        }
      }
      port.postMessage({ id: data.id, result });
    } catch {
      port.postMessage({ id: data.id, error: "Harness operation failed." });
    }
  });
});
