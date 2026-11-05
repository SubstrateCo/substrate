import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("shared UI does not import application, query, auth, or database code", async () => {
  const root = resolve(import.meta.dir);
  const violations: string[] = [];
  for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(root)) {
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) continue;
    const source = await readFile(resolve(root, path), "utf8");
    if (
      /from\s+["'](?:@\/|@tanstack\/|better-auth|@startup-os\/(?:auth|database)|.*apps\/)/.test(
        source,
      )
    )
      violations.push(path);
  }
  expect(violations).toEqual([]);
});
