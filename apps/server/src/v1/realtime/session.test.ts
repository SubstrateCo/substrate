import { realtimeKeys } from "@startup-os/contracts/realtime";

import { createRealtimeAuthenticator } from "./session";
import { expect, test } from "bun:test";

test("requires a fresh verified session with exact active-organization scope", async () => {
  let current: {
    user: { id: string; emailVerified: boolean };
    session: { activeOrganizationId: string | null };
  } | null = {
    user: { id: "user", emailVerified: true },
    session: { activeOrganizationId: "org" },
  };
  const queries: unknown[] = [];
  const authenticate = createRealtimeAuthenticator(
    {
      async getSession({ headers, query }) {
        // A stale cookie snapshot must not be used for authorization.
        queries.push(query);
        if (headers.get("cookie") !== "session") throw new Error("Fresh session lookup required");
        return current;
      },
    },
    async () => true,
  );
  const headers = new Headers({ cookie: "session" });
  expect(await authenticate(headers, "org")).toEqual({ userId: "user", organizationId: "org" });
  expect(await authenticate(headers, null)).toBeNull();
  expect(await authenticate(headers, "other")).toBeNull();
  current.user.emailVerified = false;
  expect(await authenticate(headers, "org")).toBeNull();
  current = null;
  expect(await authenticate(headers, "org")).toBeNull();
  expect(queries).toEqual(Array.from({ length: 5 }, () => ({ disableCookieCache: true })));
});

test("connect permission uses the database's membership/actor resolver and supports account scope", async () => {
  let organizationId: string | null = "org";
  let allowed = false;
  const audiences: unknown[] = [];
  const authenticate = createRealtimeAuthenticator(
    {
      getSession: async () => ({
        user: { id: "user", emailVerified: true },
        session: { activeOrganizationId: organizationId },
      }),
    },
    async (identity, audience) => {
      audiences.push({ identity, audience });
      return allowed;
    },
  );
  expect(await authenticate(new Headers(), "org")).toBeNull();
  allowed = true;
  expect(await authenticate(new Headers(), "org")).toEqual({
    userId: "user",
    organizationId: "org",
  });
  organizationId = null;
  expect(await authenticate(new Headers(), null)).toEqual({ userId: "user", organizationId: null });
  expect(audiences).toEqual([
    {
      identity: { userId: "user", organizationId: "org" },
      audience: realtimeKeys.organization("org"),
    },
    {
      identity: { userId: "user", organizationId: "org" },
      audience: realtimeKeys.organization("org"),
    },
    { identity: { userId: "user", organizationId: null }, audience: realtimeKeys.user("user") },
  ]);
});
