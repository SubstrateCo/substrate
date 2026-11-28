import type { FilePurpose, UploadTicket } from "@substrate/contracts/files/input";

import { result } from "./api";
import { appOrigin } from "./environment";
import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const origin = appOrigin;
export const root = "/api/v1/files";

export type APIClient = { request: APIRequestContext };
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

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
  let response: APIResponse;
  try {
    response = await anonymous.put(ticket.uploadUrl, { headers: ticket.headers, data: bytes });
  } catch {
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
  const response = await page.request.get("/api/auth/get-session?disableCookieCache=true");
  expect(response.ok()).toBe(true);
  const session: { user: { image?: string | null } } = await response.json();
  return session.user.image ?? null;
}
