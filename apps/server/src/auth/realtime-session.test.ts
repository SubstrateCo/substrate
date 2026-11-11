import { createRealtimeAuthenticator } from "./realtime-session";
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
    async (identity) => ({ ...identity, actorId: "actor" }),
  );
  const headers = new Headers({ cookie: "session" });
  expect(await authenticate(headers, "org")).toEqual({
    userId: "user",
    organizationId: "org",
    actorId: "actor",
  });
  expect(await authenticate(headers, null)).toBeNull();
  expect(await authenticate(headers, "other")).toBeNull();
  current.user.emailVerified = false;
  expect(await authenticate(headers, "org")).toBeNull();
  current = null;
  expect(await authenticate(headers, "org")).toBeNull();
  expect(queries).toEqual(Array.from({ length: 5 }, () => ({ disableCookieCache: true })));
});

test("connect permission uses the database receiver resolver and supports account scope", async () => {
  let organizationId: string | null = "org";
  let allowed = false;
  const identities: unknown[] = [];
  const authenticate = createRealtimeAuthenticator(
    {
      getSession: async () => ({
        user: { id: "user", emailVerified: true },
        session: { activeOrganizationId: organizationId },
      }),
    },
    async (identity) => {
      identities.push(identity);
      return allowed ? { ...identity, actorId: identity.organizationId && "actor" } : null;
    },
  );
  expect(await authenticate(new Headers(), "org")).toBeNull();
  allowed = true;
  expect(await authenticate(new Headers(), "org")).toEqual({
    userId: "user",
    organizationId: "org",
    actorId: "actor",
  });
  organizationId = null;
  expect(await authenticate(new Headers(), null)).toEqual({
    userId: "user",
    organizationId: null,
    actorId: null,
  });
  expect(identities).toEqual([
    { userId: "user", organizationId: "org" },
    { userId: "user", organizationId: "org" },
    { userId: "user", organizationId: null },
  ]);
});
