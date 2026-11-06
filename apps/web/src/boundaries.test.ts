import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("web composes UI views without defining presentation markup or styles", async () => {
  const root = resolve(import.meta.dir);
  const violations: string[] = [];
  const transpiler = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  });
  for await (const path of new Bun.Glob("**/*.tsx").scan(root)) {
    if (path.endsWith(".test.tsx")) continue;
    const source = await readFile(resolve(root, path), "utf8");
    const compiled = transpiler.transformSync(source);
    if (
      /React\.createElement\(\s*["'][a-z]/.test(compiled) ||
      /\b(?:className|style)\s*=/.test(source) ||
      /["']@startup-os\/ui\/primitives\//.test(source)
    )
      violations.push(path);
  }
  expect(violations).toEqual([]);
});
