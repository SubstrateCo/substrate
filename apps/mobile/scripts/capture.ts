import { writeReviewGallery } from "./review-gallery";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const child = Bun.spawn(
  [
    "node",
    require.resolve("@playwright/test/cli"),
    "test",
    "--config",
    resolve(import.meta.dirname, "../playwright.config.ts"),
    ...process.argv.slice(2),
  ],
  {
    cwd: resolve(import.meta.dirname, "../../.."),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  },
);
const exitCode = await child.exited;
await writeReviewGallery();
process.exitCode = exitCode;
