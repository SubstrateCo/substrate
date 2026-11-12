import { createS3Storage } from "./s3";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("read enforces byte limits", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname.endsWith("/empty")) return new Response("");
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
