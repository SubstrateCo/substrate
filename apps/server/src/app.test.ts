import { success } from "@substrate/contracts/result";

import { createApp as createApplication } from "./app";
import { appFixture } from "./test-support";
import { describe, expect, test } from "bun:test";

const createApp = () => createApplication(appFixture());

test("health check reports that the server is up without caching", async () => {
  const response = await createApp().request("/health");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("unknown API versions fail with the standard response", async () => {
  const response = await createApp().request("/api/v99/tasks/projects");
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found.",
      userMessage: "Endpoint not found.",
    },
  });
});

describe.each(["/api/v1", "/api/mobile"])("%s product API", (prefix) => {
  test("malformed JSON does not escape the application error envelope", async () => {
    const response = await createApp().request(`${prefix}/tasks/mutations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "Invalid request body.",
        userMessage: "Invalid request body.",
      },
    });
  });

  test("rejects oversized API payloads with a safe, standard error", async () => {
    const response = await createApp().request(`${prefix}/tasks/mutations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(1024 * 1024 + 1) },
      body: JSON.stringify({ body: "x".repeat(1024 * 1024) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large.",
        userMessage: "Request body is too large.",
      },
    });
  });

  async function pictureUpload(bytes: number) {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }));
    const encoded = new Response(form);
    const body = await encoded.arrayBuffer();
    return createApp().request(`${prefix}/files/pictures/avatar`, {
      method: "POST",
      headers: {
        "Content-Type": encoded.headers.get("Content-Type")!,
        "Content-Length": String(body.byteLength),
        Origin: "http://localhost:3000",
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
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Use a picture up to 5 MB.",
        userMessage: "Use a picture up to 5 MB.",
      },
    });
  });

  test.each([undefined, "https://evil.example"])("rejects mutation origin %s", async (origin) => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (origin) headers.set("Origin", origin);
    const response = await createApp().request(`${prefix}/organizations/apps`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ organizationId: "org", enabledApps: ["messages", "agents"] }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN", message: "Invalid request origin." },
    });
  });

  test("trusted preview origins can preflight PATCH app settings", async () => {
    const dependencies = appFixture();
    dependencies.trustedOrigins.push("http://localhost:8081");
    const response = await createApplication(dependencies).request(`${prefix}/organizations/apps`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8081",
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8081");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Methods")?.split(",")).toContain("PATCH");
    expect(response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toBe(
      "content-type",
    );
  });

  test("large results are compressed for clients that accept it, and small ones are sent as they are", async () => {
    const dependencies = appFixture();
    const person = { userId: "user", name: "A member", email: "member@example.com", image: null };
    let people = Array.from({ length: 100 }, () => person);
    dependencies.services.organizations.people = async () => success(people);
    const read = () =>
      createApplication(dependencies).request(`${prefix}/organizations/people?organizationId=org`, {
        headers: { "Accept-Encoding": "gzip" },
      });
    const large = await read();
    expect(large.headers.get("Content-Encoding")).toBe("gzip");
    const decoded = new Response(large.body!.pipeThrough(new DecompressionStream("gzip")));
    expect(await decoded.json()).toEqual(success(people));
    people = [person];
    const small = await read();
    expect(small.headers.get("Content-Encoding")).toBeNull();
    expect(await small.json()).toEqual(success(people));
  });

  test("untrusted preview origins cannot preflight credentialed app updates", async () => {
    const response = await createApp().request(`${prefix}/organizations/apps`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "PATCH" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
