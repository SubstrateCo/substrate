import { applicationURL } from "../src/shell/navigation.ts";
import { backendURL } from "../src/transport/bundled-renderer.ts";
import { developmentServices, ensureDevelopmentServices } from "./dev-services.js";
import { bundleHarnessWorker } from "./harness-worker.ts";
import { bundlePreload } from "./preload.js";
import electron from "electron";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const desktop = fileURLToPath(new URL("../", import.meta.url));
const services: ReturnType<typeof Bun.spawn>[] = [];
let windowProcess: ReturnType<typeof Bun.spawn> | undefined;
const state = { stopping: false };

function stop() {
  state.stopping = true;
  windowProcess?.kill();
  for (const service of services) service.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  await bundlePreload();
  await bundleHarnessWorker();
  await ensureDevelopmentServices(
    developmentServices(applicationURL, backendURL(process.env.SUBSTRATE_API_URL, false)),
    (service) => {
      console.log(`Starting the ${service.name} server at ${service.url}.`);
      const child = Bun.spawn([process.execPath, "run", "--no-orphans", service.script], {
        cwd: root,
        stdout: "inherit",
        stderr: "inherit",
      });
      services.push(child);
      return child;
    },
    () => state.stopping,
  );
  if (!state.stopping) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    // Electron's Node entry returns its executable path, not its declared API namespace.
    const executable: unknown = electron;
    // oxlint-disable-next-line deslop/no-runtime-typeof -- Validate Electron's Node entry at the package boundary; its declarations describe the Electron runtime instead.
    if (typeof executable !== "string")
      throw new Error("Electron did not provide an executable path.");
    windowProcess = Bun.spawn(
      [executable, fileURLToPath(new URL("../src/main.ts", import.meta.url))],
      {
        cwd: desktop,
        env,
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    process.exitCode = await windowProcess.exited;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stop();
  await Promise.all(services.map((service) => service.exited));
}
