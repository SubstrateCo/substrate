import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("ownership coverage creates and transfers its dedicated private fixture", () => {
  // These k6 adapter mocks must not replace the real cache used by other regression suites.
  const result = Bun.spawnSync([
    process.execPath,
    "--no-env-file",
    "test",
    fileURLToPath(new URL("./rare-admin.case.ts", import.meta.url)),
  ]);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
});
