import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { createS3Storage } from "./s3";

test("read validates byte limits and enforces them", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests++;
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
    for (const limit of [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await rejects(storage.read("key", limit), {
        name: "RangeError",
        message: "maxBytes must be a non-negative safe integer.",
      });
    }
    expect(requests).toBe(0);
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
