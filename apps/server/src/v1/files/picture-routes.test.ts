import { failure, success } from "@substrate/contracts/result";

import { createPictureRoutes } from "./picture-routes";
import type { PictureService } from "./pictures";
import { expect, test } from "bun:test";

test("picture uploads accept multipart bytes and return the URL without saving a profile", async () => {
  const app = createPictureRoutes({
    upload: async (_headers, purpose, file) => success({ url: `${purpose}:${await file.text()}` }),
    content: async () => failure("NOT_FOUND", "Not found."),
  });
  const form = new FormData();
  form.set("file", new File(["pixels"], "image.png", { type: "image/png" }));
  const response = await app.request("/avatar", { method: "POST", body: form });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: { url: "avatar:pixels" } });
});

test("picture content redirects only after authorization and is not cached", async () => {
  let allowed = true;
  const service: PictureService = {
    upload: async () => failure("FORBIDDEN", "Access denied."),
    content: async (_headers, purpose, owner) =>
      allowed
        ? success({ url: `https://s3.test/${purpose}/${owner}` })
        : failure("NOT_FOUND", "Not found."),
  };
  const app = createPictureRoutes(service);
  const response = await app.request("/avatar/alice?v=one");
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://s3.test/avatar/alice");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  allowed = false;
  const denied = await app.request("/avatar/alice?v=one");
  expect(denied.status).toBe(404);
  expect(denied.headers.get("location")).toBeNull();
});
