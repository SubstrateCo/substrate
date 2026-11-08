import { expect, test } from "bun:test";

for (const [name, env, message] of [
  [
    "rejects a non-E2E database before connecting or resetting tables",
    { NODE_ENV: "test", DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/development" },
    "E2E requires a dedicated database ending in _e2e_test.",
  ],
  [
    "rejects a non-test runtime before connecting or resetting tables",
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/isolated_e2e_test",
    },
    "E2E requires NODE_ENV=test.",
  ],
] as const) {
  test(name, async () => {
    const process = Bun.spawn([Bun.argv[0]!, `${import.meta.dir}/start-e2e.ts`], {
      env: { ...Bun.env, ...env },
      stdout: "ignore",
      stderr: "pipe",
    });
    const error = await new Response(process.stderr).text();
    expect(await process.exited).not.toBe(0);
    expect(error).toContain(message);
  });
}
