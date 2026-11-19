import type { PictureKind } from "@substrate/contracts/files/pictures";

import { withConnection } from "./connections.ts";
import { apiUrl, origin } from "./data.ts";
import { trace } from "./debug.ts";
import { endpoints, type EndpointName } from "./endpoints.ts";
import { apiCalls, apiDuration, recordApiFailure, writes } from "./metrics.ts";
import http from "k6/http";

/**
 * Requests that call() cannot make: a path parameter, a byte response, and the PUT to the signed
 * storage URL. Server requests count in the same metrics as call(); the storage PUT does not,
 * because it never reaches the API.
 */

const reported = new Set<string>();

function report(name: string, status: number, body: http.Response["body"] | string) {
  let code = "NETWORK";
  if (status >= 500) code = "HTTP_5XX";
  else if (status) code = "HTTP_4XX";
  recordApiFailure(name, code);
  if (reported.has(name)) return;
  reported.add(name);
  console.warn(`[vu ${__VU}] ${name} failed: ${status} ${JSON.stringify(body).slice(0, 200)}`);
}

/** A JSON text body, a multipart form (an object with http.file values), or none. */
type Body =
  | { kind: "json"; value: string }
  | { kind: "multipart"; value: Record<string, string | http.FileData> }
  | null;

async function raw(name: EndpointName, url: string, body: Body, json: boolean, redirect = false) {
  const endpoint = endpoints[name];
  const started = Date.now();
  const headers: http.Params["headers"] = { Origin: origin };
  if (body?.kind === "json") headers["Content-Type"] = "application/json";
  const response = await withConnection(() =>
    http.asyncRequest(endpoint.method, url, body?.value ?? null, {
      // k6 sets the multipart Content-Type with its boundary.
      headers,
      tags: { name, endpoint: name },
      timeout: "30s",
      // The content route answers with the file; a redirect would leave the API.
      redirects: 0,
      responseType: json ? "text" : "none",
    }),
  );
  apiCalls.add(1, { endpoint: name });
  apiDuration.add(response.timings.duration, { endpoint: name });
  trace("http", `${endpoint.method} ${name} ${response.status} ${Date.now() - started}ms`);
  // Picture routes redirect to signed storage; the browser follows it outside the API.
  const ok =
    (response.status >= 200 && response.status < 300) || (redirect && response.status === 302);
  if (!ok) {
    report(name, response.status, response.body ?? response.error);
    return null;
  }
  if ("write" in endpoint && endpoint.write) writes.add(1, { endpoint: name });
  return response;
}

/** Finishes an upload after its bytes are stored. Resolves the file ID, or null. */
export async function completeUpload(uploadId: string) {
  const path = endpoints["files.uploads.complete"].path.replace(":id", uploadId);
  const response = await raw(
    "files.uploads.complete",
    `${apiUrl}${path}`,
    { kind: "json", value: "" },
    true,
  );
  if (!response) return null;
  // SAFETY: files.uploads.complete responds with the file ID in the API data envelope.
  const envelope = response.json() as { data?: { fileId?: string } } | null;
  return envelope?.data?.fileId ?? null;
}

/** Downloads a task attachment, as opening it in the attachment list does. */
export async function taskAttachmentContent(input: {
  organizationId: string;
  projectEntityId: string;
  taskEntityId: string;
  attachmentId: string;
}) {
  const query = Object.entries(input)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const path = endpoints["files.taskAttachmentContent"].path;
  return !!(await raw("files.taskAttachmentContent", `${apiUrl}${path}?${query}`, null, false));
}

/** Downloads a message attachment, as its link in the timeline does. */
export async function messageAttachmentContent(input: {
  organizationId: string;
  conversationId: string;
  messageId: string;
  attachmentId: string;
}) {
  const query = Object.entries(input)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const path = endpoints["files.messageAttachmentContent"].path;
  return !!(await raw("files.messageAttachmentContent", `${apiUrl}${path}?${query}`, null, false));
}

/** Loads an <img> source such as `/api/v1/files/pictures/avatar/<id>?v=...`. */
export async function pictureContent(path: string) {
  return !!(await raw("files.picture", `${apiUrl}${path}`, null, false, true));
}

/**
 * Uploads a picture as multipart form data (api/files/pictures.ts uploadPictureBytes). Resolves
 * the picture URL to save, or null.
 */
export async function uploadPicture(
  purpose: PictureKind,
  bytes: ArrayBuffer,
  fields: Record<string, string> = {},
) {
  const path = endpoints["files.pictures.upload"].path.replace(":purpose", purpose);
  const form = { ...fields, file: http.file(bytes, "picture.png", "image/png") };
  const response = await raw(
    "files.pictures.upload",
    `${apiUrl}${path}`,
    { kind: "multipart", value: form },
    true,
  );
  if (!response) return null;
  // SAFETY: files.pictures.upload responds with the saved picture URL in the data envelope.
  const envelope = response.json() as { data?: { url?: string } } | null;
  return envelope?.data?.url ?? null;
}

/** PUTs the bytes to the signed URL with the ticket's headers, without cookies. */
export async function putObject(url: string, headers: Record<string, string>, bytes: ArrayBuffer) {
  const response = await http.asyncRequest("PUT", url, bytes, {
    headers,
    tags: { name: "storage.put" },
    timeout: "60s",
    jar: new http.CookieJar(),
    responseType: "none",
  });
  trace("http", `PUT storage ${response.status} ${response.timings.duration.toFixed(0)}ms`);
  if (response.status >= 200 && response.status < 300) return true;
  // Counted under the upload it belongs to, so the summary shows it.
  recordApiFailure("files.uploads", response.status >= 500 ? "HTTP_5XX" : "HTTP_4XX");
  if (!reported.has("storage.put")) {
    reported.add("storage.put");
    console.warn(`[vu ${__VU}] storage PUT failed: ${response.status} ${String(response.error)}`);
  }
  return false;
}
