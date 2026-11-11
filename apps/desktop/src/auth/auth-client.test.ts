import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

async function scenario(name: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(new URL("./auth-client.test-helper.ts", import.meta.url)),
      name,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`Auth signal scenario failed: ${stderr}`);
  return JSON.parse(stdout);
}

test.concurrent("native cookie replacement reports a session change, not sign-out", async () => {
  expect(await scenario("replaced-cookie")).toEqual({ invalidated: 0, changed: 1 });
});

test.concurrent("sign-out invalidates immediately before its response without reporting a session change", async () => {
  expect(await scenario("sign-out")).toEqual({
    beforeResponse: { invalidated: 1, changed: 0 },
    invalidated: 1,
    changed: 0,
  });
});
