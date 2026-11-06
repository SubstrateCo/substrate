import { availablePort } from "./server";
import { createTestBucket } from "../../packages/storage/src/testing/bucket";
import { createTestDatabases } from "../../packages/database/src/testing/databases";
import { createDatabase } from "../../packages/database/src/client";
import { migrateDatabase } from "../../packages/database/src/migrations";
import { fileURLToPath } from "node:url";
import { staticFilePath } from "./static";

async function run(command: string[], env: Record<string, string | undefined>) {
  const child = Bun.spawn([process.execPath, "run", ...command], {
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const cancel = () => child.kill();
  process.on("SIGINT", cancel);
  try {
    return await child.exited;
  } finally {
    process.off("SIGINT", cancel);
  }
}

async function main() {
  const preparation = await Promise.all([
    run(["test:unit"], { ...process.env, TEST_DATABASE_SHARDS: "3" }),
    run(["turbo", "run", "@startup-os/web#build"], { ...process.env }),
  ]);
  const failure = preparation.find((code) => code !== 0);
  if (failure !== undefined) return failure;

  const [webPort, apiPort] = await Promise.all([availablePort(), availablePort()]);
  const webURL = `http://localhost:${webPort}`;
  const apiURL = `http://localhost:${apiPort}`;
  const databases = await createTestDatabases(1);
  try {
    const databaseURL = databases.connections[0]!;
    const connection = createDatabase({ connectionString: databaseURL });
    try {
      await connection.db.execute("SET client_min_messages TO WARNING");
      await migrateDatabase(connection.db);
    } finally {
      await connection.close();
    }
    const storage = await createTestBucket([webURL, "https://desktop.startup-os.local"]);
    try {
      const env = {
        ...process.env,
        DATABASE_URL: databaseURL,
        APP_URL: webURL,
        BETTER_AUTH_URL: apiURL,
        FRONTEND_ORIGINS: `${webURL},https://desktop.startup-os.local`,
        SERVER_PORT: String(apiPort),
        PLAYWRIGHT_BASE_URL: webURL,
        PLAYWRIGHT_API_URL: apiURL,
        STARTUP_OS_WEB_URL: webURL,
        STARTUP_OS_API_URL: apiURL,
        DESKTOP_BUNDLED_RENDERER: "true",
        S3_BUCKET: storage.bucket,
      };
      const directory = new URL("../../apps/web/dist/", import.meta.url);
      const index = Bun.file(new URL("index.html", directory));
      const backend = Bun.spawn([process.execPath, "apps/server/src/main.ts"], {
        env,
        stdout: "ignore",
        stderr: "inherit",
      });
      try {
        const web = Bun.serve({
          hostname: "localhost",
          port: webPort,
          async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname.startsWith("/api/")) {
              return fetch(new Request(new URL(url.pathname + url.search, apiURL).href, request), {
                redirect: "manual",
              });
            }
            const path = staticFilePath(fileURLToPath(directory), url.pathname);
            if (!path) return new Response(null, { status: 403 });
            const file = Bun.file(path);
            return new Response((await file.exists()) ? file : index);
          },
        });
        try {
          const deadline = performance.now() + 10_000;
          for (;;) {
            const ready = await fetch(`${apiURL}/api/v1/session`).then(
              (response) => response.ok,
              () => false,
            );
            if (ready) break;
            if (performance.now() > deadline || backend.exitCode !== null)
              throw new Error("The test API did not start.");
            await Bun.sleep(50);
          }
          return await run(["turbo", "run", "test:e2e"], env);
        } finally {
          await web.stop(true);
        }
      } finally {
        backend.kill();
        await backend.exited;
      }
    } finally {
      await storage.close();
    }
  } finally {
    await databases.close();
  }
}

const started = performance.now();
try {
  process.exitCode = await main();
} finally {
  console.log(`Full-suite wall time: ${((performance.now() - started) / 1000).toFixed(2)}s`);
}
