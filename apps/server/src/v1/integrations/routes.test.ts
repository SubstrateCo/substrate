import { createApp } from "../../app";
import { appFixture, createTestScopes } from "../../test-support";
import { expect, test } from "bun:test";

const origin = "http://localhost:3000";
const ticket = "t".repeat(43);

function fixture() {
  const deps = appFixture();
  const created: { userId: string; product: string }[] = [];
  deps.services.integrations.createGoogleLinkTicket = async (scope, product) => {
    created.push({ userId: scope.userId, product });
    return { success: true, data: { ticket, expiresAt: "2026-01-01T00:02:00.000Z" } };
  };
  return { deps, created };
}

const createTicket = (
  app: ReturnType<typeof createApp>,
  body: { product?: string; userId?: string },
  headers = { origin },
) =>
  app.request("/api/v1/integrations/google/link-tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("a ticket needs a verified session, a trusted origin and a known product", async () => {
  const { deps, created } = fixture();
  const app = createApp(deps);
  expect(
    (await createTicket(app, { product: "calendar" }, { origin: "https://evil.test" })).status,
  ).toBe(403);
  for (const body of [{ product: "gmail" }, {}, { product: "calendar", userId: "other" }]) {
    const response = await createTicket(app, body);
    if (response.status === 200) expect(created.at(-1)?.userId).toBe("user-1");
    else expect(response.status).toBe(400);
  }
  expect(created.every((entry) => entry.product === "calendar")).toBe(true);

  const response = await createTicket(app, { product: "calendar" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, data: { ticket } });
  expect(created.at(-1)).toEqual({ userId: "user-1", product: "calendar" });

  const anonymous = createApp({
    ...deps,
    scopes: createTestScopes({
      api: { getSession: async () => null, getActiveMemberRole: async () => ({ role: "owner" }) },
    }),
  });
  expect((await createTicket(anonymous, { product: "calendar" })).status).toBe(401);
  expect(created).toHaveLength(2);
});

test("the start page redirects to Google with the state cookie, or shows an expired page", async () => {
  const { deps } = fixture();
  const state = "__Secure-better-auth.state=signed; Path=/; HttpOnly; Secure; SameSite=Lax";
  const seen: string[] = [];
  deps.services.integrations.startGoogleLink = async (value) => {
    seen.push(value);
    return value === ticket
      ? { url: "https://accounts.google.com/o/oauth2/v2/auth?state=s", cookies: [state] }
      : null;
  };
  const app = createApp(deps);

  // A browser navigation sends no Origin and no session cookie.
  const started = await app.request(`/api/v1/integrations/google/link/start?ticket=${ticket}`);
  expect(started.status).toBe(302);
  expect(started.headers.get("location")).toBe(
    "https://accounts.google.com/o/oauth2/v2/auth?state=s",
  );
  expect(started.headers.getSetCookie()).toEqual([state]);
  expect(started.headers.get("referrer-policy")).toBe("no-referrer");

  for (const path of ["?ticket=unknown", ""]) {
    const expired = await app.request(`/api/v1/integrations/google/link/start${path}`);
    expect(expired.status).toBe(400);
    expect(expired.headers.get("content-type")).toContain("text/html");
    expect(expired.headers.get("content-security-policy")).toStartWith(
      "default-src 'none'; style-src 'sha256-",
    );
    expect(expired.headers.get("location")).toBeNull();
    expect(expired.headers.getSetCookie()).toEqual([]);
  }
  expect(seen).toEqual([ticket, "unknown", ""]);
});
