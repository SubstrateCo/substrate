import { createAuthenticatedFetch } from "./transport";
import { describe, expect, test } from "bun:test";

describe("mobile API credentials", () => {
  test("an offline write fails immediately and is not replayed on reconnect", async () => {
    let online = false;
    let requests = 0;
    const transport = createAuthenticatedFetch({
      baseURL: "https://api.example.com",
      native: true,
      origin: "substrate-mobile://",
      getCookie: () => "session=private",
      isOnline: () => online,
      fetch: async () => {
        requests++;
        return new Response();
      },
    });
    expect(
      transport("https://api.example.com/api/mobile/tasks", { method: "POST" }),
    ).rejects.toThrow("offline");
    expect(requests).toBe(0);
    online = true;
    await Promise.resolve();
    expect(requests).toBe(0);
    await transport("https://api.example.com/api/mobile/tasks", { method: "POST" });
    expect(requests).toBe(1);
  });

  test("a connection lost while loading the cookie cannot send a write", async () => {
    const cookie = Promise.withResolvers<string>();
    let online = true;
    let sent = false;
    const transport = createAuthenticatedFetch({
      baseURL: "https://api.example.com",
      native: true,
      origin: "substrate-mobile://",
      getCookie: () => cookie.promise,
      isOnline: () => online,
      fetch: async () => {
        sent = true;
        return new Response();
      },
    });
    const request = transport("https://api.example.com/api/mobile/tasks", { method: "POST" });
    online = false;
    cookie.resolve("session=private");
    expect(request).rejects.toThrow("offline");
    await Promise.resolve();
    expect(sent).toBe(false);
  });
  test("only the configured API gets the native cookie and explicit origin", async () => {
    const requests: RequestInit[] = [];
    const transport = createAuthenticatedFetch({
      baseURL: "https://api.example.com",
      native: true,
      origin: "substrate-mobile://",
      getCookie: () => "session=private",
      fetch: async (_input, init) => {
        requests.push(init ?? {});
        return new Response();
      },
    });
    await transport("https://api.example.com/api/v1/tasks", { method: "POST" });
    expect(new Headers(requests[0]?.headers).get("cookie")).toBe("session=private");
    expect(new Headers(requests[0]?.headers).get("origin")).toBe("substrate-mobile://");
    expect(requests[0]?.credentials).toBe("omit");
    expect(requests[0]?.redirect).toBe("error");
    expect(transport("https://storage.example.com/api/upload")).rejects.toThrow("only accepts");
    expect(transport("https://api.example.com/public/file")).rejects.toThrow("only accepts");
    expect(requests).toHaveLength(1);
  });

  test("web uses browser credentials and never reads native cookies or forges Origin", async () => {
    let captured: RequestInit | undefined;
    const transport = createAuthenticatedFetch({
      baseURL: "http://localhost:3101",
      native: false,
      origin: "substrate-mobile://",
      getCookie: () => {
        throw new Error("Native storage must not be read on web");
      },
      fetch: async (_input, init) => {
        captured = init;
        return new Response();
      },
    });
    await transport("http://localhost:3101/api/v1/tasks");
    expect(captured?.credentials).toBe("include");
    expect(new Headers(captured?.headers).has("cookie")).toBe(false);
    expect(new Headers(captured?.headers).has("origin")).toBe(false);
  });

  test("unauthorized responses clear the private access boundary", async () => {
    let revoked = false;
    const transport = createAuthenticatedFetch({
      baseURL: "https://api.example.com",
      native: true,
      origin: "substrate-mobile://",
      getCookie: () => "",
      onUnauthorized: () => {
        revoked = true;
      },
      fetch: async () => new Response(null, { status: 401 }),
    });
    await transport("https://api.example.com/api/v1/tasks");
    expect(revoked).toBe(true);
  });
});
