import { failure, success } from "@substrate/contracts/result";

import { createTestScopes } from "../../test-support";
import { createFilesRoutes } from "./routes";
import type { FileService } from "./service";
import { expect, test } from "bun:test";

function service(): FileService {
  return {
    createUpload: async () =>
      success({ uploadId: crypto.randomUUID(), uploadUrl: "https://s3.test/upload", headers: {} }),
    completeUpload: async (_headers, id) => success({ fileId: id }),
    content: async () => success({ url: "https://s3.test/signed" }),
    deleteFile: async (_headers, id) => success({ fileId: id }),
    cleanup: async () => {},
  };
}

test("content redirects only after access checks, without caching", async () => {
  const services = service();
  const app = createFilesRoutes(services, createTestScopes());
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
