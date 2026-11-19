import { createS3Storage } from "./s3";
import { ObjectNotFoundError } from "./types";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("signed downloads preserve attachment filenames and serve pictures inline", async () => {
  const storage = createS3Storage({
    endpoint: "https://s3.test",
    region: "us-east-1",
    bucket: "test",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  const attachment = new URL(
    await storage.signDownload("file", { kind: "attachment", filename: "résumé (final).txt" }),
  );
  expect(attachment.searchParams.get("response-content-disposition")).toBe(
    "attachment; filename=\"download\"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%28final%29.txt",
  );
  expect(attachment.searchParams.get("response-content-type")).toBe("application/octet-stream");
  expect(attachment.searchParams.get("response-cache-control")).toBe("private, no-store");

  const inline = new URL(await storage.signDownload("picture", { kind: "inline" }));
  expect(inline.searchParams.get("response-content-disposition")).toBe("inline");
  expect(inline.searchParams.has("response-content-type")).toBe(false);
  expect(inline.searchParams.get("response-cache-control")).toBe("private, no-store");
});

test("read enforces byte limits", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname.endsWith("/empty")) return new Response("");
      if (new URL(request.url).pathname.endsWith("/missing"))
        return new Response(
          "<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>",
          { status: 404, headers: { "content-type": "application/xml" } },
        );
      return new Response("object");
    },
  });
  try {
    const storage = createS3Storage({
      endpoint: server.url.href,
      region: "us-east-1",
      bucket: "test",
      accessKeyId: "test",
      secretAccessKey: "test",
    });
    expect(await storage.read("empty", 0)).toEqual(new Uint8Array());
    expect(await storage.read("key", 6)).toEqual(new TextEncoder().encode("object"));
    await rejects(storage.read("key", 5), {
      name: "RangeError",
      message: "Object exceeds size limit.",
    });
    await rejects(storage.read("missing", 5), ObjectNotFoundError);
  } finally {
    await server.stop(true);
  }
});

test("batch cleanup returns only requested keys whose deletion succeeded", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      requests++;
      return new Response(
        '<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Deleted><Key>one</Key></Deleted><Deleted><Key>unrequested</Key></Deleted><Error><Key>two</Key><Code>AccessDenied</Code></Error></DeleteResult>',
        { headers: { "content-type": "application/xml" } },
      );
    },
  });
  try {
    const storage = createS3Storage({
      endpoint: server.url.href,
      region: "us-east-1",
      bucket: "test",
      accessKeyId: "test",
      secretAccessKey: "test",
    });
    expect(await storage.removeMany([])).toEqual([]);
    expect(requests).toBe(0);
    expect(await storage.removeMany(["one", "two"])).toEqual(["one"]);
    expect(requests).toBe(1);
  } finally {
    await server.stop(true);
  }
});
