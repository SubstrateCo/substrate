import {
  createPrivateFileManager,
  privateScopePath,
  safeFilename,
  sharePrivateFile,
  type TemporaryFileInput,
} from "./resources";
import { expect, test } from "bun:test";

const scope = { userId: "one", organizationId: "team" };
const request = {
  scope,
  filename: "../report.pdf",
  mimeType: "application/pdf",
  load: async () => new Uint8Array([1, 2, 3]),
};

test("private temporary files are scoped, sanitize names, and release on workspace exit", async () => {
  const saved: TemporaryFileInput[] = [];
  let deleted = 0;
  const files = createPrivateFileManager(async (input) => {
    saved.push(input);
    return {
      uri: "file:///private/report.pdf",
      release: () => {
        deleted++;
      },
    };
  });
  const file = await files.load(request);
  expect(saved[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  expect(saved[0]?.filename).toBe("_report.pdf");
  const scopePath = privateScopePath(scope);
  expect(scopePath).not.toBe(privateScopePath({ ...scope, userId: "two" }));
  expect(scopePath).not.toBe(privateScopePath({ ...scope, organizationId: "other" }));
  files.clear();
  file.release();
  expect(deleted).toBe(1);
  expect(safeFilename("../../../")).not.toContain("/");
});

test("a delayed download cannot create a private file after account exit", async () => {
  const bytes = Promise.withResolvers<Uint8Array>();
  let created = false;
  const files = createPrivateFileManager(async () => {
    created = true;
    return { uri: "file:///private", release() {} };
  });
  const pending = files.load({ ...request, load: () => bytes.promise });
  files.clear();
  bytes.resolve(new Uint8Array([1]));
  expect(pending).rejects.toThrow();
  await Promise.resolve();
  expect(created).toBe(false);
});

test("account exit during an asynchronous file write deletes the late file too", async () => {
  const written = Promise.withResolvers<{ uri: string; release: () => void }>();
  let deleted = false;
  const files = createPrivateFileManager(() => written.promise);
  const pending = files.load(request);
  await Promise.resolve();
  files.clear();
  written.resolve({
    uri: "file:///late",
    release: () => {
      deleted = true;
    },
  });
  expect(pending).rejects.toThrow();
  await Promise.resolve();
  expect(deleted).toBe(true);
});

test("share cancellation or failure does not retain the downloaded private file", async () => {
  let deleted = false;
  const result = sharePrivateFile(
    {
      uri: "file:///private/report.pdf",
      release: () => {
        deleted = true;
      },
    },
    async () => {
      throw new Error("Sharing failed");
    },
  );
  expect(result).rejects.toThrow("Sharing failed");
  await Promise.resolve();
  expect(deleted).toBe(true);
});
