import { staticFilePath } from "./static";
import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("static test servers resolve assets inside their bundle", () => {
  const root = resolve("bundle");
  expect(staticFilePath(root, "/")).toBe(resolve(root, "index.html"));
  expect(staticFilePath(root, "/assets/font%20name.woff2")).toBe(
    resolve(root, "assets/font name.woff2"),
  );
});

test("static test servers reject encoded traversal and malformed paths", () => {
  for (const path of ["/../private", "/..%2fprivate", "/..%5cprivate", "/%00", "/%", "private"]) {
    expect(staticFilePath(resolve("bundle"), path), path).toBeUndefined();
  }
});
