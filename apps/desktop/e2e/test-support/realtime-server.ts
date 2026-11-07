import { createTestDatabases } from "../../../../packages/database/src/testing/databases.ts";
import { availablePort } from "../../../../scripts/testing/server.ts";
import { createRealtimeGateway } from "./realtime-gateway.js";
import { expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const rootURL = new URL("../../../../", import.meta.url);
const root = fileURLToPath(rootURL);
const execute = promisify(execFile);

function start(args: string[], env: NodeJS.ProcessEnv, executable = "bun", cwd = root) {
  const running = execute(executable, args, { cwd, env, maxBuffer: 1024 * 1024 });
  return {
    child: running.child,
    completed: running.then(
      () => true,
      () => false,
    ),
  };
}
type OwnedProcess = ReturnType<typeof start>;

async function stop({ child, completed }: OwnedProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await completed;
}

async function ready(origin: string, { child }: OwnedProcess) {
  await expect
    .poll(
      async () => {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null)
          throw new Error("The test-owned application process exited before becoming ready.");
        try {
          return (await fetch(`${origin}/api/v1/session`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);
}

export async function createRealtimeServer() {
  const databases = await createTestDatabases(1);
  const processes = new Set<OwnedProcess>();
  let cacheDirectory: string | undefined;
  let gateway: Awaited<ReturnType<typeof createRealtimeGateway>> | undefined;
  try {
    cacheDirectory = await mkdtemp(join(tmpdir(), "startup-os-vite-"));
    const backendPort = await availablePort();
    const gatewayPort = await availablePort();
    const webPort = await availablePort();
    const backend = `http://localhost:${backendPort}`;
    const apiOrigin = `http://localhost:${gatewayPort}`;
    const webOrigin = `http://localhost:${webPort}`;
    const environment = {
      ...process.env,
      DATABASE_URL: databases.connections[0],
      SERVER_PORT: String(backendPort),
      BETTER_AUTH_URL: apiOrigin,
      APP_URL: webOrigin,
      FRONTEND_ORIGINS: `${webOrigin},${new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin},https://desktop.startup-os.local`,
      SERVER_URL: apiOrigin,
      WEB_PORT: String(webPort),
      VITE_CACHE_DIR: cacheDirectory,
      STARTUP_OS_API_URL: apiOrigin,
      STARTUP_OS_WEB_URL: webOrigin,
    };
    const migration = start(["--env-file=.env", "packages/database/src/migrate.ts"], environment);
    if (!(await migration.completed)) throw new Error("Could not migrate the test-owned database.");
    const launchBackend = async () => {
      const child = start(["--env-file=.env", "apps/server/src/main.ts"], environment);
      processes.add(child);
      await ready(backend, child);
      return child;
    };
    let server = await launchBackend();
    gateway = await createRealtimeGateway(backend, gatewayPort);
    const web = start(
      ["node_modules/vite/bin/vite.js"],
      environment,
      process.execPath,
      fileURLToPath(new URL("apps/web/", rootURL)),
    );
    processes.add(web);
    await ready(webOrigin, web);
    const network = gateway;
    return {
      webOrigin,
      environment: { STARTUP_OS_API_URL: apiOrigin, STARTUP_OS_WEB_URL: webOrigin },
      network,
      async stopBackend() {
        await stop(server);
      },
      async restartBackend() {
        await stop(server);
        server = await launchBackend();
      },
      async close() {
        await network.close();
        await Promise.all([...processes].map(stop));
        await rm(cacheDirectory!, { recursive: true, force: true });
        await databases.close();
      },
    };
  } catch (error) {
    if (gateway) await gateway.close();
    await Promise.all([...processes].map(stop));
    if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true });
    await databases.close();
    throw error;
  }
}
