import { checkFiles, generateFiles } from "./generate.ts";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const output = new URL("packages/design-tokens/", root);
const source = await readFile(new URL("apps/web/src/components/styles.css", root), "utf8");
const defaults = await readFile(
  fileURLToPath(import.meta.resolve("tailwindcss/theme.css")),
  "utf8",
);
const expected = await generateFiles(source, defaults);

if (process.argv.includes("--check")) {
  const actual = Object.fromEntries(
    await Promise.all(
      Object.keys(expected).map(async (path) => [
        path,
        await readFile(new URL(path, output), "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        }),
      ]),
    ),
  );
  checkFiles(expected, actual);
  console.log("Design tokens match the web source.");
} else {
  for (const [path, content] of Object.entries(expected)) {
    const target = new URL(path, output);
    await mkdir(fileURLToPath(new URL(".", target)), { recursive: true });
    await writeFile(target, content);
  }
  console.log("Generated native design tokens.");
}
