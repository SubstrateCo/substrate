import { failure, success } from "@startup-os/contracts/result";

import { createFilesRoutes } from "./routes";
import type { FileService } from "./service";
import { expect, test } from "bun:test";

function service(): FileService {
  return {
    createUpload: async () =>
      success({ uploadId: crypto.randomUUID(), uploadUrl: "https://s3.test/upload", headers: {} }),
    completeUpload: async (_headers, id) => success({ fileId: id }),
    setPicture: async (_headers, _purpose, fileId) => success({ fileId, url: null }),
    content: async () => success({ url: "https://s3.test/signed" }),
    deleteFile: async (_headers, id) => success({ fileId: id }),
    cleanup: async () => {},
  };
}

test("file routes validate upload limits and attachment identity", async () => {
  const app = createFilesRoutes(service());
  const upload = await app.request("/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      purpose: "avatar",
      filename: "a.svg",
      contentType: "image/svg+xml",
      size: 1,
    }),
  });
  expect(upload.status).toBe(400);
  const attach = await app.request("/avatar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileId: "https://evil.test/image" }),
  });
  expect(attach.status).toBe(400);
  const complete = await app.request(`/uploads/${crypto.randomUUID()}/complete`, {
    method: "POST",
  });
  expect(complete.status).toBe(200);
});

test("content redirects only after access checks, without caching", async () => {
  const services = service();
  const app = createFilesRoutes(services);
  const id = crypto.randomUUID();
  const response = await app.request(`/${id}/content`);
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://s3.test/signed");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  services.content = async () => failure("NOT_FOUND", "Not found.");
  const denied = await app.request(`/${id}/content`);
  expect(denied.status).toBe(404);
  expect(denied.headers.get("location")).toBeNull();
});
