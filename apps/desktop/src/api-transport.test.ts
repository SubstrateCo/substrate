import { expect, test } from "bun:test";
import { desktopAPITransport } from "./api-transport.js";

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
  ]) {
    const response = await transport(`https://api.example.com/api/auth/${path}`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
  }
  expect(called).toBe(false);
});
