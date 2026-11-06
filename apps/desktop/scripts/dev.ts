import electron from "electron";
import { fileURLToPath } from "node:url";
import { applicationURL } from "../src/navigation.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const desktop = fileURLToPath(new URL("../", import.meta.url));
let web: ReturnType<typeof Bun.spawn> | undefined;
let windowProcess: ReturnType<typeof Bun.spawn> | undefined;
const state = { stopping: false };

function stop() {
  state.stopping = true;
  windowProcess?.kill();
  web?.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function webIsReady() {
  try {
    const response = await fetch(`${applicationURL}/login`, {
      signal: AbortSignal.timeout(2_000),
      redirect: "manual",
    });
    await response.text();
    return response.ok || response.status === 302 || response.status === 307;
  } catch {
    return false;
  }
}

try {
  if (await webIsReady()) {
    console.log(`Using the existing web server at ${applicationURL}.`);
  } else {
    web = Bun.spawn([process.execPath, "run", "dev"], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    });
    const deadline = Date.now() + 60_000;
    while (!(await webIsReady())) {
      if (state.stopping) break;
      if (web.exitCode !== null) throw new Error("The web server exited before it was ready.");
      if (Date.now() > deadline)
        throw new Error("The web server did not become ready within 60 seconds.");
      await Bun.sleep(500);
    }
  }
  if (!state.stopping) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    // Electron's Node entry returns its executable path, not its declared API namespace.
    const executable: unknown = electron;
    // oxlint-disable-next-line deslop/no-runtime-typeof -- Validate Electron's Node entry at the package boundary; its declarations describe the Electron runtime instead.
    if (typeof executable !== "string")
      throw new Error("Electron did not provide an executable path.");
    windowProcess = Bun.spawn(
      [executable, fileURLToPath(new URL("../src/main.js", import.meta.url))],
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
}
