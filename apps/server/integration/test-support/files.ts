import type { FilePurpose, UploadTicket } from "@substrate/contracts/files/input";
import type { ServiceResult } from "@substrate/contracts/result";

import { appOrigin } from "./environment";
import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const origin = appOrigin;
export const root = "/api/v1/files";

export type APIClient = { request: APIRequestContext };
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

export async function result<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), "The authorized file operation succeeds").toBe(true);
  const body: ServiceResult<T> = await response.json();
  expect(body.success, "The operation returns successful application data").toBe(true);
  if (!body.success) throw new Error("The file operation did not succeed.");
  return body.data;
}

export async function rejected(response: APIResponse, privateValues: readonly string[] = []) {
  expect(response.status(), "The operation is rejected, not a server error").toBeGreaterThanOrEqual(
    400,
  );
  expect(response.status()).toBeLessThan(500);
  const text = await response.text();
  for (const value of privateValues) {
    expect(text.includes(value), "The rejection does not disclose private file data").toBe(false);
  }
  if (response.headers()["content-type"]?.includes("application/json")) {
    const body = JSON.parse(text);
    expect(body.data ?? null, "Rejected operations expose no successful resource data").toBeNull();
    expect(body.success).not.toBe(true);
  }
}

export async function createUpload(
  page: APIClient,
  purpose: FilePurpose,
  filename: string,
  contentType: string,
  bytes: Buffer,
) {
  return result<UploadTicket>(
    await page.request.post(`${root}/uploads`, {
      headers: { origin },
      data: { purpose, filename, contentType, size: bytes.length },
    }),
  );
}

export async function putBytes(anonymous: APIRequestContext, ticket: UploadTicket, bytes: Buffer) {
  // This context has no user cookies; signed storage requests must not carry app credentials.
  let response: APIResponse;
  try {
    response = await anonymous.put(ticket.uploadUrl, { headers: ticket.headers, data: bytes });
  } catch {
    // Do not include a credential-bearing signed URL in failure output.
    throw new Error("The signed storage upload could not be sent.");
  }
  expect(response.ok(), "The signed upload accepts the supplied bytes").toBe(true);
}

export async function complete(page: APIClient, ticket: UploadTicket) {
  return page.request.post(`${root}/uploads/${ticket.uploadId}/complete`, { headers: { origin } });
}

export function uploadPicture(page: APIClient, purpose: "avatar" | "organization-logo") {
  return page.request.post(`${root}/pictures/${purpose}`, {
    headers: { origin },
    multipart: { file: { name: "picture.png", mimeType: "image/png", buffer: png } },
  });
}

export async function image(page: APIClient) {
  const session = await result<{ user: { image?: string | null } }>(
    await page.request.get("/api/v1/session"),
  );
  return session.user.image ?? null;
}
