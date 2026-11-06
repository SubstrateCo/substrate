import { storageOrigins, storageRequest } from "./storage.js";
import { expect, test } from "bun:test";

test("storage origins are explicit, normalized, and HTTPS-only in packages", () => {
  expect(storageOrigins(undefined, true)).toEqual([]);
  expect(storageOrigins("https://storage.example.test,https://cdn.example.test/", true)).toEqual([
    "https://storage.example.test",
    "https://cdn.example.test",
  ]);
  expect(storageOrigins(["http://127.0.0.1:9000", "http://[::1]:9000"], false)).toEqual([
    "http://127.0.0.1:9000",
    "http://[::1]:9000",
  ]);
  for (const value of [
    "https:*",
    "https://*.example.test",
    "http://storage.example.test",
    "http://localhost.evil.test",
    "https://user:secret@storage.example.test",
    "https://storage.example.test/bucket",
    "https://storage.example.test/?signature=secret",
    "https://storage.example.test/#fragment",
    "https://storage.example.test; img-src *",
    "https://storage.example.test;",
    "",
    [42],
    {},
  ])
    expect(() => storageOrigins(value, false)).toThrow();
  expect(() => storageOrigins("http://localhost:9000", true)).toThrow();
});

test("storage transport preserves signed targets and bytes without forwarding credentials", async () => {
  let forwarded: Request | undefined;
  let options: RequestInit | undefined;
  const send = storageRequest(["https://storage.example.test"], async (request, init) => {
    options = init;
    forwarded = new Request(request, init);
    return new Response("stored");
  });
  const response = await send(
    new Request("https://storage.example.test/bucket/image?signature=abc", {
      method: "PUT",
      body: "image bytes",
      headers: {
        cookie: "session=secret",
        authorization: "Bearer secret",
        "content-type": "image/png",
      },
    }),
  );
  expect(response.status).toBe(200);
  expect(forwarded?.url).toBe("https://storage.example.test/bucket/image?signature=abc");
  expect(forwarded?.headers.get("cookie")).toBeNull();
  expect(forwarded?.headers.get("authorization")).toBeNull();
  expect(forwarded?.headers.get("content-type")).toBe("image/png");
  expect(options?.credentials).toBe("omit");
  expect(options?.redirect).toBe("error");
  expect(await forwarded?.text()).toBe("image bytes");
  forwarded = undefined;
  expect((await send(new Request("https://storage.example.test.evil.test/image"))).status).toBe(
    403,
  );
  expect(
    (await send(new Request("https://storage.example.test/image", { method: "DELETE" }))).status,
  ).toBe(403);
  expect(forwarded).toBeUndefined();
});
