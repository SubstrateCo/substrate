import { result } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { complete, createUpload, png, putBytes, uploadPicture } from "../test-support/files";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

function bytesPath(value: string) {
  const url = new URL(value, appOrigin);
  url.pathname = `${url.pathname.replace("/api/v1/", "/api/mobile/").replace(/\/content$/, "")}/bytes`;
  return `${url.pathname}${url.search}`;
}

test("native avatar bytes require a live authorized account and never redirect cookies to storage", async ({
  actors: { owner, member, outsider },
  request: anonymous,
  workspace,
}) => {
  const { url } = await result<{ url: string }>(await uploadPicture(owner, "avatar"));
  const attached = await owner.request.post("/api/auth/update-user", {
    headers: { origin: appOrigin },
    data: { image: url },
  });
  expect(attached.ok()).toBe(true);
  const path = bytesPath(url);
  const response = await member.request.get(path, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["location"]).toBeUndefined();
  expect(response.headers()["content-type"]).toBe("image/webp");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["vary"]).toContain("Cookie");
  expect((await response.body()).byteLength).toBeGreaterThan(0);
  expect((await outsider.request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  expect((await anonymous.get(path, { maxRedirects: 0 })).status()).toBe(401);
  await workspace(member);
  expect((await member.request.get(path, { maxRedirects: 0 })).status()).toBe(404);
});

test("older managed pictures have an authorized byte path while generic uploads cannot render inline", async ({
  actors: { owner, outsider },
  request: anonymous,
}) => {
  const ticket = await createUpload(owner, "avatar", "avatar.png", "image/png", png);
  await putBytes(anonymous, ticket, png);
  const { fileId } = await result<{ fileId: string }>(await complete(owner, ticket));
  const path = `/api/mobile/files/${fileId}/bytes`;
  const response = await owner.request.get(path, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["location"]).toBeUndefined();
  expect(response.headers()["content-type"]).toBe("image/webp");
  expect((await response.body()).byteLength).toBeGreaterThan(0);
  expect((await outsider.request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  const file = await createUpload(owner, "file", "image.png", "image/png", png);
  await putBytes(anonymous, file, png);
  const completed = await result<{ fileId: string }>(await complete(owner, file));
  expect((await owner.request.get(`/api/mobile/files/${completed.fileId}/bytes`)).status()).toBe(
    404,
  );
});
