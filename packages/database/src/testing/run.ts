import { createTestDatabases } from "./databases";
import { testDatabaseURL } from "./environment";

const count = Number(process.env.TEST_DATABASE_SHARDS ?? "1");
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
  const databases = await createTestDatabases(count);
  try {
    const children = databases.connections.map((connection, shard) => {
      return Bun.spawn(
        [process.execPath, "test", "--timeout", "30000", `--shard=${shard + 1}/${count}`, ...args],
        {
          env: { ...process.env, TEST_DATABASE_URL: connection },
          stdout: "inherit",
          stderr: "inherit",
        },
      );
    });
    const cancel = () => children.forEach((child) => child.kill());
    process.on("SIGINT", cancel);
    const codes = await Promise.all(children.map((child) => child.exited));
    process.off("SIGINT", cancel);
    process.exitCode = codes.find((code) => code !== 0) ?? 0;
  } finally {
    await databases.close();
  }
}
