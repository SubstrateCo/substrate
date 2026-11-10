import { createApp } from "./app";
import { expect, test } from "bun:test";

test("unknown API versions fail with the standard response", async () => {
  const response = await createApp().request("/api/v99/tasks/projects");
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "NOT_FOUND", message: "Endpoint not found." },
  });
});

test("malformed JSON does not escape the application error envelope", async () => {
  const response = await createApp().request("/api/v1/tasks/mutations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: "{",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "INVALID_INPUT", message: "Invalid request body." },
  });
});

test("rejects oversized API payloads with a safe, standard error", async () => {
  const response = await createApp().request("/api/v1/tasks/mutations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": String(1024 * 1024 + 1) },
    body: JSON.stringify({ body: "x".repeat(1024 * 1024) }),
  });
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." },
  });
});

async function pictureUpload(bytes: number) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }));
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return createApp().request("/api/v1/files/pictures/avatar", {
    method: "POST",
    headers: {
      "Content-Type": encoded.headers.get("Content-Type")!,
      "Content-Length": String(body.byteLength),
    },
    body,
  });
}

test("picture uploads use their own size limit instead of the API limit", async () => {
  const allowed = await pictureUpload(2 * 1024 * 1024);
  expect(allowed.status).not.toBe(413);
  const oversized = await pictureUpload(6 * 1024 * 1024 + 1);
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toEqual({
    success: false,
    error: { code: "PAYLOAD_TOO_LARGE", message: "Use a picture up to 5 MB." },
  });
});
