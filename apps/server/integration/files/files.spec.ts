import type { CompletedUpload } from "@substrate/contracts/files/input";

import { rejected, result } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import {
  complete,
  createUpload,
  image,
  png,
  putBytes,
  root,
  uploadPicture,
} from "../test-support/files";
import { test } from "../test-support/fixtures";
import { expect, type APIResponse } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = appOrigin;
test("file endpoints reject unauthenticated requests without exposing upload data", async ({
  request: anonymous,
}) => {
  const id = randomUUID();
  const responses = await Promise.all([
    anonymous.post(`${root}/uploads`, {
      headers: { origin },
      data: {
        purpose: "avatar",
        filename: "private.png",
        contentType: "image/png",
        size: png.length,
      },
    }),
    anonymous.post(`${root}/uploads/${id}/complete`, { headers: { origin } }),
    uploadPicture({ request: anonymous }, "avatar"),
    uploadPicture({ request: anonymous }, "organization-logo"),
    anonymous.get(`${root}/pictures/avatar/alice`, { maxRedirects: 0 }),
    anonymous.delete(`${root}/${id}`, { headers: { origin } }),
    anonymous.get(`${root}/${id}/content`, { maxRedirects: 0 }),
  ]);
  for (const response of responses) {
    expect(response.status(), "Authentication is required before resource lookup").toBe(401);
    await rejected(response, ["uploadUrl", "uploadId"]);
  }
});

test("signed storage uploads enforce declared size and content type and keep objects private", async ({
  actors: { owner },
  request: anonymous,
}) => {
  const ticket = await createUpload(owner, "avatar", "storage-boundary.png", "image/png", png);
  const put = async (bytes: Buffer, headers: Record<string, string>) => {
    try {
      return await anonymous.put(ticket.uploadUrl, { headers, data: bytes });
    } catch {
      throw new Error("The signed storage boundary request could not be sent.");
    }
  };
  const wrongSize = await put(Buffer.concat([png, Buffer.from([0])]), ticket.headers);
  expect(
    wrongSize.status(),
    "A signed ticket rejects a different upload size",
  ).toBeGreaterThanOrEqual(400);
  expect(wrongSize.status()).toBeLessThan(500);

  const wrongTypeHeaders = Object.fromEntries(
    Object.entries(ticket.headers).filter(([name]) => name.toLowerCase() !== "content-type"),
  );
  wrongTypeHeaders["Content-Type"] = "text/plain";
  const wrongType = await put(png, wrongTypeHeaders);
  expect(
    wrongType.status(),
    "A signed ticket rejects a different content type",
  ).toBeGreaterThanOrEqual(400);
  expect(wrongType.status()).toBeLessThan(500);

  const correct = await put(png, ticket.headers);
  expect(correct.ok(), "The same ticket accepts its declared bytes and content type").toBe(true);
  const unsignedURL = new URL(ticket.uploadUrl);
  unsignedURL.search = "";
  unsignedURL.hash = "";
  let unsigned: APIResponse;
  try {
    unsigned = await anonymous.get(unsignedURL.href, { maxRedirects: 0 });
  } catch {
    throw new Error("The unsigned object privacy request could not be sent.");
  }
  expect(
    unsigned.status(),
    "Uploaded objects cannot be read without a signed request",
  ).toBeGreaterThanOrEqual(400);
  expect(unsigned.status()).toBeLessThan(500);
});

test("arbitrary files download as attachments and remain private to their uploader", async ({
  actors: { outsider: a, owner: b },
  request: anonymous,
}) => {
  const filename = `private-document-${randomUUID()}.txt`;
  const secret = `Uploader-only content ${randomUUID()}`;
  const bytes = Buffer.from(secret);
  const ticket = await createUpload(b, "file", filename, "text/plain", bytes);
  await putBytes(anonymous, ticket, bytes);
  const { fileId } = await result<CompletedUpload>(await complete(b, ticket));
  const response = await b.request.get(`${root}/${fileId}/content`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-disposition"]).toMatch(/^attachment(?:;|$)/i);
  expect(response.headers()["content-disposition"]).toContain(filename);
  expect(await response.body(), "Downloads preserve the uploaded arbitrary file bytes").toEqual(
    bytes,
  );
  for (const client of [a.request, anonymous]) {
    await rejected(await client.get(`${root}/${fileId}/content`, { maxRedirects: 0 }), [
      filename,
      secret,
    ]);
  }
  await rejected(
    await b.request.post("/api/auth/update-user", {
      headers: { origin },
      data: { image: `${root}/${fileId}/content` },
    }),
  );
  expect(await image(b), "A generic file cannot become an avatar").toBeNull();
  await rejected(await a.request.delete(`${root}/${fileId}`, { headers: { origin } }));
  await result(await b.request.delete(`${root}/${fileId}`, { headers: { origin } }));
  await rejected(await b.request.get(`${root}/${fileId}/content`, { maxRedirects: 0 }), [secret]);
});
