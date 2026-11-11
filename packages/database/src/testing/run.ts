import { createTestDatabases } from "./databases";
import { testDatabaseURL } from "./environment";
import { mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";

const count = Number(
  process.env.TEST_DATABASE_SHARDS ?? Math.min(8, Math.ceil(availableParallelism() / 2)),
);
if (!Number.isInteger(count) || count < 1 || count > 8)
  throw new Error("TEST_DATABASE_SHARDS must be between 1 and 8.");
testDatabaseURL();
const args = process.argv.slice(2);
if (count === 1) {
  const child = Bun.spawn([process.execPath, "test", "--timeout", "30000", ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await child.exited;
} else {
  // Bun gives the slowest files to the workers first when it knows the last durations.
  mkdirSync("node_modules/.cache", { recursive: true });
  // An interrupt while the databases are created must still let close drop them.
  const interrupt = new AbortController();
  let child: Bun.Subprocess | undefined;
  const cancel = () => {
    interrupt.abort();
    child?.kill();
  };
  process.on("SIGINT", cancel);
  try {
    const databases = await createTestDatabases(count);
    try {
      // Each worker runs its files serially against its own database.
      if (!interrupt.signal.aborted)
        child = Bun.spawn(
          [
            process.execPath,
            "test",
            "--timeout",
            "30000",
            `--parallel=${count}`,
            "--timings=node_modules/.cache/test-timings.json",
            "--update-timings",
            ...args,
          ],
          {
            env: { ...process.env, TEST_DATABASE_WORKER_URLS: databases.connections.join(" ") },
            stdout: "inherit",
            stderr: "inherit",
          },
        );
      process.exitCode = child ? await child.exited : 130;
    } finally {
      await databases.close();
    }
  } finally {
    process.off("SIGINT", cancel);
  }
}
