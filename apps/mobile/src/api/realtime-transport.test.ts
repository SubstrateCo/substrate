import { createAuthenticatedRealtime, type RealtimeSocket } from "./realtime-transport";
import { expect, test } from "bun:test";

function socket(): RealtimeSocket {
  return { onmessage: null, onclose: null, onerror: null, close() {} };
}

test("native realtime waits for the secure cookie and uses only the mobile API websocket", async () => {
  const opened: { url: string; headers?: Record<string, string> }[] = [];
  const realtime = createAuthenticatedRealtime({
    baseURL: "https://api.example.com",
    native: true,
    origin: "substrate-mobile://",
    getCookie: async () => "session=secret",
    createSocket(url, headers) {
      opened.push({ url, headers });
      return socket();
    },
  });
  await realtime.connect({ organizationId: "team" });
  expect(opened).toEqual([
    {
      url: "wss://api.example.com/api/mobile/realtime?organizationId=team",
      headers: { Cookie: "session=secret", Origin: "substrate-mobile://" },
    },
  ]);
  await realtime.disconnect();
});

test("a delayed secure cookie cannot reopen realtime after sign-out", async () => {
  const cookie = Promise.withResolvers<string>();
  let opened = false;
  const realtime = createAuthenticatedRealtime({
    baseURL: "https://api.example.com",
    native: true,
    origin: "substrate-mobile://",
    getCookie: () => cookie.promise,
    createSocket() {
      opened = true;
      return socket();
    },
  });
  const pending = realtime.connect({ organizationId: "team" });
  await realtime.disconnect();
  cookie.resolve("session=previous-account");
  await pending;
  expect(opened).toBe(false);
});

test("web realtime leaves authentication to browser cookies, without reading SecureStore", async () => {
  let headers: Record<string, string> | undefined;
  const realtime = createAuthenticatedRealtime({
    baseURL: "http://localhost:3101",
    native: false,
    origin: "substrate-mobile://",
    getCookie: async () => {
      throw new Error("Must not read native storage");
    },
    createSocket(_url, values) {
      headers = values;
      return socket();
    },
  });
  await realtime.connect({ organizationId: null });
  expect(headers).toBeUndefined();
  await realtime.disconnect();
});
