import { desktopAPITransport } from "./api-transport.js";
import { expect, test } from "bun:test";

test("desktop auth requests stop when the API proxy aborts them", async () => {
  const controller = new AbortController();
  const transport = desktopAPITransport({
    getCookie: () => "",
    authFetch: async (_path, options) => {
      controller.abort(new Error("API request cancelled"));
      options.signal?.throwIfAborted();
      await options.onResponse({ response: Response.json({ session: null }) });
    },
  });
  const result = await transport("https://api.example.com/api/auth/get-session", {
    method: "GET",
    signal: controller.signal,
  }).then(
    () => "completed",
    (error: Error) => error.message,
  );
  expect(result).toBe("API request cancelled");
});

test("API requests name this installation and the renderer cannot name another", async () => {
  let sent = new Headers();
  const transport = desktopAPITransport({
    getCookie: () => "session=main-only",
    authFetch: async () => {},
    installationId: "11111111-1111-4111-8111-111111111111",
    fetchUpstream: async (_url, init) => {
      sent = new Headers(init.headers);
      return Response.json({});
    },
  });
  await transport("https://api.example.com/api/v1/agents/list", {
    method: "POST",
    headers: { "x-substrate-installation": "22222222-2222-4222-8222-222222222222" },
  });
  expect(sent.get("x-substrate-installation")).toBe("11111111-1111-4111-8111-111111111111");
});

test("desktop auth transport stores cookies through the official client and hides credentials", async () => {
  let path = "";
  const transport = desktopAPITransport({
    getCookie: () => "session=main-only",
    authFetch: async (value, options) => {
      path = value;
      const response = Response.json({
        session: { id: "session-1", token: "secret" },
        user: { id: "user-1" },
      });
      response.headers.set("set-cookie", "session=secret");
      await options.onResponse({ response });
    },
  });
  const response = await transport("https://api.example.com/api/auth/get-session", {
    method: "GET",
  });
  expect(path).toBe("/get-session");
  expect(await response.json()).toEqual({ session: { id: "session-1" }, user: { id: "user-1" } });
  expect(response.headers.has("set-cookie")).toBe(false);
});

test("desktop application requests use main-owned credentials, never renderer credentials", async () => {
  let headers = new Headers();
  const transport = desktopAPITransport({
    getCookie: () => "session=main-only",
    authFetch: async () => {
      throw new Error("Not an auth endpoint");
    },
    fetchUpstream: async (_url, options) => {
      headers = new Headers(options.headers);
      return Response.json({ ok: true });
    },
  });
  await transport("https://api.example.com/api/v1/session", {
    headers: { cookie: "forged", authorization: "Bearer forged" },
  });
  expect(headers.get("cookie")).toBe("session=main-only");
  expect(headers.has("authorization")).toBe(false);
});

test("desktop renderer cannot initiate password auth or exchange tokens through the API proxy", async () => {
  let called = false;
  const transport = desktopAPITransport({
    getCookie: () => "",
    authFetch: async () => {
      called = true;
    },
  });
  for (const path of [
    "sign-in/email",
    "sign-up/email",
    "electron/token",
    "sign-out",
    "reset-password",
    "update-user/extra",
  ]) {
    const response = await transport(`https://api.example.com/api/auth/${path}`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
  }
  expect(called).toBe(false);
});

test("native profile updates use the main auth client without exposing credentials", async () => {
  let forwarded:
    | { path: string; method?: string; body?: string; headers: Record<string, string> }
    | undefined;
  const transport = desktopAPITransport({
    getCookie: () => "session=main-only",
    authFetch: async (path, options) => {
      forwarded = { path, method: options.method, body: options.body, headers: options.headers };
      const response = Response.json({
        status: true,
        user: { image: "/api/v1/files/file-1/content", token: "secret" },
      });
      response.headers.set("set-cookie", "session=secret");
      await options.onResponse({ response });
    },
  });
  const body = JSON.stringify({ image: "/api/v1/files/file-1/content" });
  const response = await transport("https://api.example.com/api/auth/update-user", {
    method: "POST",
    body,
    headers: { cookie: "renderer-secret", authorization: "Bearer renderer-secret" },
  });
  expect(response.status).toBe(200);
  expect(forwarded?.path).toBe("/update-user");
  expect(forwarded?.method).toBe("POST");
  expect(forwarded?.body).toBe(body);
  expect(new Headers(forwarded?.headers).has("cookie")).toBe(false);
  expect(new Headers(forwarded?.headers).has("authorization")).toBe(false);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(await response.json()).toEqual({
    status: true,
    user: { image: "/api/v1/files/file-1/content" },
  });
  forwarded = undefined;
  expect(
    (await transport("https://api.example.com/api/auth/update-user", { method: "GET" })).status,
  ).toBe(403);
  expect(forwarded).toBeUndefined();
});
