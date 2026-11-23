import { rejected, result } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = appOrigin;

async function enableApps(owner: Actor, enabledApps: string[]) {
  await result(
    await owner.request.patch("/api/v1/organizations/apps", {
      headers: { origin },
      data: { organizationId: owner.organizationId, enabledApps },
    }),
  );
}

const settings = (actor: Actor, organizationId = actor.organizationId) =>
  actor.request.get("/api/v1/calendar/settings", { params: { organizationId } });

// No Google account can be linked here, so no event exists, whether or not a Google client is set.
// These cases cover the HTTP boundary: session, membership, origin, app and record access.
test("calendar routes are member-scoped, origin-checked, and gated by the calendar app", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const organizationId = owner.organizationId;
  await enableApps(owner, ["messages", "agents", "calendar"]);

  // Providers depend on the server's configuration; a new member has no accounts either way.
  for (const actor of [owner, member]) {
    const view = await result<{ providers: string[] }>(await settings(actor));
    expect(view).toMatchObject({ accounts: [], detachedCalendars: [] });
    expect(["google"]).toEqual(expect.arrayContaining(view.providers));
  }
  expect(
    (await anonymous.get("/api/v1/calendar/settings", { params: { organizationId } })).status(),
  ).toBe(401);
  await rejected(await settings(outsider, organizationId));

  const missing = randomUUID();
  for (const response of [
    await member.request.get(`/api/v1/calendar/events/${missing}`, { params: { organizationId } }),
    await outsider.request.get(`/api/v1/calendar/events/${missing}`, {
      params: { organizationId },
    }),
    await member.request.patch(`/api/v1/calendar/calendars/${missing}`, {
      headers: { origin },
      data: { organizationId, paused: true },
    }),
    await member.request.post(`/api/v1/calendar/calendars/${missing}/backfill`, {
      headers: { origin },
      data: { organizationId },
    }),
  ])
    await rejected(response);
  expect(
    (
      await member.request.get(`/api/v1/calendar/events/${missing}`, {
        params: { organizationId },
      })
    ).status(),
  ).toBe(404);

  // A provider account the session user does not own is never used, whatever its ID.
  const foreignAccount = randomUUID();
  const listed = await owner.request.get(`/api/v1/calendar/accounts/${foreignAccount}/calendars`, {
    params: { organizationId },
  });
  expect(listed.status()).toBe(404);
  const connected = await owner.request.post("/api/v1/calendar/connect", {
    headers: { origin },
    data: { organizationId, credentialAccountId: foreignAccount, providerCalendarIds: ["primary"] },
  });
  expect(connected.status()).toBe(404);

  expect(
    await result(
      await member.request.post("/api/v1/calendar/interaction-sources", {
        headers: { origin },
        data: { organizationId, interactionEntityIds: [randomUUID()] },
      }),
    ),
  ).toEqual({});
  expect(
    (
      await member.request.post("/api/v1/calendar/interaction-sources", {
        headers: { origin },
        data: {
          organizationId,
          interactionEntityIds: Array.from({ length: 101 }, () => randomUUID()),
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await member.request.get("/api/v1/calendar/events", {
        params: {
          organizationId,
          from: "2026-11-01T00:00:00.000Z",
          until: "2027-01-01T00:00:00.000Z",
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    await result(
      await member.request.get("/api/v1/calendar/events", {
        params: {
          organizationId,
          from: "2026-11-01T00:00:00.000Z",
          until: "2026-11-08T00:00:00.000Z",
        },
      }),
    ),
  ).toEqual([]);

  // Mutations require a trusted origin.
  expect(
    (
      await owner.request.post("/api/v1/calendar/interaction-sources", {
        headers: { origin: "https://untrusted.example.test" },
        data: { organizationId, interactionEntityIds: [randomUUID()] },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.request.patch(`/api/v1/calendar/calendars/${missing}`, {
        headers: { origin: "https://untrusted.example.test" },
        data: { organizationId, paused: true },
      })
    ).status(),
  ).toBe(403);

  await enableApps(owner, ["messages", "agents"]);
  const disabled = await settings(owner);
  expect(disabled.status()).toBe(403);
  expect(await disabled.json()).toMatchObject({ success: false, error: { code: "APP_DISABLED" } });
});

test("Google cannot be used to sign in", async ({ request: anonymous }) => {
  const response = await anonymous.post("/api/auth/sign-in/social", {
    headers: { origin },
    data: { provider: "google", callbackURL: "/" },
  });
  expect(response.status()).toBe(403);
});
