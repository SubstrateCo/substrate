import { expect, test } from "bun:test";
import { cookieBridge } from "./cookie-bridge.js";
import { bundledApplicationURL as origin } from "./navigation.js";
import type { CookiesSetDetails } from "electron";

test("forwards only native cookies scoped to the app request URL, ordered by path", async () => {
  let queried = "";
  const bridge = cookieBridge(
    {
      get: async ({ url }) => {
        queried = url!;
        return [
          { name: "session", value: "native", path: "/" },
          { name: "scoped", value: "specific", path: "/api" },
        ];
      },
      set: async () => {},
    },
    "https://api.example.com",
  );
  expect(await bridge.header(`${origin}/api/auth/get-session`)).toBe(
    "scoped=specific; session=native",
  );
  expect(queried).toBe(`${origin}/api/auth/get-session`);
  expect(
    await bridge.header("https://evil.test/api").then(
      () => false,
      () => true,
    ),
  ).toBe(true);
});

test("maps backend cookies into the app jar, preserving raw values and security attributes", async () => {
  const stored: CookiesSetDetails[] = [];
  const bridge = cookieBridge(
    {
      get: async () => [],
      set: async (cookie) => {
        stored.push(cookie);
      },
    },
    "https://api.example.com",
  );
  await bridge.store(`${origin}/api/auth/sign-in/email`, [
    "session=signed%2Fvalue; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600",
    "account=other; Domain=api.example.com; Path=/api; Secure; SameSite=None; Expires=Wed, 01 Jan 2031 00:00:00 GMT",
  ]);
  expect(stored).toHaveLength(2);
  expect(stored[0]).toMatchObject({
    url: `${origin}/api/auth/sign-in/email`,
    name: "session",
    value: "signed%2Fvalue",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  });
  expect(stored[0]!.domain).toBeUndefined();
  expect(stored[0]!.expirationDate).toBeGreaterThan(Date.now() / 1000 + 3500);
  expect(stored[1]).toMatchObject({
    name: "account",
    value: "other",
    path: "/api",
    sameSite: "no_restriction",
    expirationDate: Date.UTC(2031, 0, 1) / 1000,
  });
  expect(stored[1]!.domain).toBeUndefined();
});

test("rejects incompatible domains, confines storage to app URLs, and honors cookie deletion", async () => {
  const stored: CookiesSetDetails[] = [];
  const bridge = cookieBridge(
    {
      get: async () => [],
      set: async (cookie) => {
        stored.push(cookie);
      },
    },
    "https://api.example.com",
  );
  const accepted = await bridge.store(`${origin}/api/auth/sign-out`, [
    "session=; Path=/; Secure; HttpOnly; Max-Age=0; Expires=Wed, 01 Jan 2031 00:00:00 GMT",
    "foreign=secret; Domain=evil.test; Path=/",
    "parent=secret; Domain=example.com; Path=/",
    "app=secret; Domain=desktop.startup-os.local; Path=/",
  ]);
  expect(stored).toHaveLength(1);
  expect(accepted).toEqual([
    "session=; Path=/; Secure; HttpOnly; Max-Age=0; Expires=Wed, 01 Jan 2031 00:00:00 GMT",
  ]);
  expect(stored[0]).toMatchObject({ name: "session", value: "", path: "/", httpOnly: true });
  expect(stored[0]!.expirationDate).toBeLessThanOrEqual(Date.now() / 1000);
  expect(
    await bridge.store("https://evil.test/api", ["session=forged"]).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
  expect(stored).toHaveLength(1);
});

test("uses cookie default path and finishes native storage before resolving", async () => {
  const waiting = Promise.withResolvers<void>();
  let details: CookiesSetDetails | undefined;
  let finished = false;
  const bridge = cookieBridge(
    {
      get: async () => [],
      set: async (cookie) => {
        details = cookie;
        await waiting.promise;
      },
    },
    "https://api.example.com",
  );
  const storing = bridge
    .store(`${origin}/api/auth/callback`, ["session=value; Secure; HttpOnly; SameSite=Strict"])
    .then(() => {
      finished = true;
    });
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(details).toMatchObject({ path: "/api/auth", sameSite: "strict" });
  waiting.resolve();
  await storing;
  expect(finished).toBe(true);
});
