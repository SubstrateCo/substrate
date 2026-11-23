import { rejected, result } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { expect, type APIRequestContext } from "@playwright/test";

const origin = appOrigin;
const tickets = "/api/v1/integrations/google/link-tickets";
const start = (request: APIRequestContext, ticket: string) =>
  request.get("/api/v1/integrations/google/link/start", { params: { ticket }, maxRedirects: 0 });

test("link tickets need a verified session, a trusted origin and a known product", async ({
  actors: { owner },
  request: anonymous,
}) => {
  expect(
    (
      await anonymous.post(tickets, { headers: { origin }, data: { product: "calendar" } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await owner.request.post(tickets, {
        headers: { origin: "https://untrusted.example.test" },
        data: { product: "calendar" },
      })
    ).status(),
  ).toBe(403);
  await rejected(
    await owner.request.post(tickets, { headers: { origin }, data: { product: "mail" } }),
  );

  // The browser hop has no session. A ticket that was never issued shows the expired page.
  const unknown = await start(anonymous, "A".repeat(43));
  expect(unknown.status()).toBe(400);
  expect(unknown.headers()["content-type"]).toContain("text/html");
  expect(unknown.headers()["set-cookie"]).toBeUndefined();
});

test("a ticket opens Google's consent screen once, in a browser without a Substrate session", async ({
  actors: { owner },
  request: anonymous,
}) => {
  const probe = await owner.request.post("/api/auth/link-social", {
    headers: { origin },
    data: { provider: "google", callbackURL: "/", disableRedirect: true },
  });
  test.skip(!probe.ok(), "The server under test has no Google client.");

  const { ticket } = await result<{ ticket: string }>(
    await owner.request.post(tickets, { headers: { origin }, data: { product: "calendar" } }),
  );
  const first = await start(anonymous, ticket);
  expect(first.status()).toBe(302);
  expect(new URL(first.headers()["location"] ?? "").origin).toBe("https://accounts.google.com");
  const cookies = first
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie");
  expect(cookies.map((cookie) => cookie.value.split("=")[0])).toEqual([
    expect.stringMatching(/(^|\.)better-auth\.state$/),
  ]);
  expect(cookies.some((cookie) => cookie.value.includes("session_token"))).toBe(false);

  const replay = await start(anonymous, ticket);
  expect(replay.status()).toBe(400);
  expect(replay.headers()["location"]).toBeUndefined();
});
