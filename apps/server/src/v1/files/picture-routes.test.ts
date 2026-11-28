import { failure, success } from "@substrate/contracts/result";

import { createTestScopes } from "../../test-support";
import { createPictureRoutes } from "./picture-routes";
import type { PictureService } from "./pictures";
import { expect, test } from "bun:test";

test("picture uploads accept multipart bytes and return the URL without saving a profile", async () => {
  const app = createPictureRoutes(
    {
      upload: async (_headers, purpose, file) =>
        success({ url: `${purpose}:${file.contentType}:${new TextDecoder().decode(file.bytes)}` }),
      content: async () => failure("NOT_FOUND", "Not found."),
      bytes: async () => failure("NOT_FOUND", "Not found."),
    },
    createTestScopes(),
  );
  const form = new FormData();
  form.set("file", new File(["pixels"], "image.png", { type: "image/png" }));
  const response = await app.request("/avatar", { method: "POST", body: form });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    data: { url: "avatar:image/png:pixels" },
  });
});

test("picture content redirects only after authorization and is not cached", async () => {
  let allowed = true;
  const service: PictureService = {
    upload: async () => failure("FORBIDDEN", "Access denied."),
    bytes: async () => failure("NOT_FOUND", "Not found."),
    content: async (_headers, purpose, owner) =>
      allowed
        ? success({ url: `https://s3.test/${purpose}/${owner}` })
        : failure("NOT_FOUND", "Not found."),
  };
  const app = createPictureRoutes(service, createTestScopes());
  const response = await app.request("/avatar/alice");
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://s3.test/avatar/alice");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  allowed = false;
  const denied = await app.request("/avatar/alice");
  expect(denied.status).toBe(404);
  expect(denied.headers.get("location")).toBeNull();
});

test("a versioned picture is sent as bytes that only this session's browser may keep", async () => {
  let allowed = true;
  const app = createPictureRoutes(
    {
      upload: async () => failure("FORBIDDEN", "Access denied."),
      content: async () => success({ url: "https://storage.test/private" }),
      bytes: async (_scope, purpose, owner) =>
        allowed && purpose === "avatar" && owner === "alice"
          ? success({ bytes: new TextEncoder().encode("webp-pixels") })
          : failure("NOT_FOUND", "Not found."),
    },
    createTestScopes(),
  );
  const response = await app.request("/avatar/alice?v=one");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("webp-pixels");
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("cache-control")).toBe("private, max-age=86400, immutable");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  allowed = false;
  const denied = await app.request("/avatar/alice?v=one");
  expect(denied.status).toBe(404);
  expect(denied.headers.get("cache-control")).toBeNull();
});

test("native picture bytes preserve access and private headers without a storage redirect", async () => {
  let allowed = true;
  const app = createPictureRoutes(
    {
      upload: async () => failure("FORBIDDEN", "Access denied."),
      content: async () => success({ url: "https://storage.test/private" }),
      bytes: async (_scope, purpose, owner) =>
        allowed && purpose === "avatar" && owner === "alice"
          ? success({ bytes: new TextEncoder().encode("webp-pixels") })
          : failure("NOT_FOUND", "Not found."),
    },
    createTestScopes(),
  );
  const response = await app.request("/avatar/alice/bytes?v=one");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("webp-pixels");
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  allowed = false;
  expect((await app.request("/avatar/alice/bytes")).status).toBe(404);
});
