import { googleProductScopes } from "@substrate/contracts/integrations/google";

import { createGoogleLinkTickets, googleLinkTicketTTL } from "./google-link";
import { betterAuth, getAuthStateVerificationIdentifier } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, expect, setSystemTime, test } from "bun:test";

const apiURL = "https://api.example.test";
const handoff = `${apiURL}/desktop/open?path=%2Fsettings%2Fuser%2Fcalendars`;

afterEach(() => setSystemTime());

/** A real Better Auth with in-memory storage and a Google client that is never called. */
async function fixture() {
  const db = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: apiURL,
    secret: "google-link-test-secret-with-32-characters",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: {
        clientId: "client-id",
        clientSecret: "client-secret",
        disableDefaultScope: true,
        scope: ["openid", "email", "profile"],
      },
    },
    logger: { disabled: true },
  });
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: "Alice", email: "alice@example.test", emailVerified: true },
    { method: "email-password" },
  );
  const session = await context.internalAdapter.createSession(user.id);
  const tickets = createGoogleLinkTickets(auth, { apiURL });
  return { db, context, user, session, tickets };
}

test("a ticket starts one Google link as its session and sends the browser only the state cookie", async () => {
  const { context, user, session, tickets } = await fixture();
  const { ticket } = await tickets.create(session, "calendar");

  const started = await tickets.start(ticket);
  if (!started) throw new Error("The ticket did not start a link.");
  const consent = new URL(started.url);
  expect(consent.origin).toBe("https://accounts.google.com");
  expect(consent.searchParams.get("redirect_uri")).toBe(`${apiURL}/api/auth/callback/google`);
  expect(consent.searchParams.get("scope")?.split(" ")).toContain(googleProductScopes.calendar[0]);

  const names = started.cookies.map((cookie) => cookie.slice(0, cookie.indexOf("=")));
  expect(names).toEqual([context.createAuthCookie("state").name]);
  expect(started.cookies.join("\n")).not.toContain(session.token);

  // The flow links to the ticket's user and returns through the fixed desktop handoff.
  const state = consent.searchParams.get("state") ?? "";
  const stored = await context.internalAdapter.findVerificationValue(
    getAuthStateVerificationIdentifier(state),
  );
  expect(JSON.parse(stored?.value ?? "{}")).toMatchObject({
    callbackURL: handoff,
    link: { userId: user.id },
  });

  expect(await tickets.start(ticket)).toBeNull();
});

test("tickets are stored as digests, not as the ticket or the session token", async () => {
  const { db, session, tickets } = await fixture();
  const { ticket } = await tickets.create(session, "calendar");
  const stored = JSON.stringify(db.verification);
  expect(stored).not.toContain(ticket);
  expect(stored).not.toContain(session.token);
});

test("an expired ticket cannot start a link", async () => {
  const { session, tickets } = await fixture();
  const { ticket } = await tickets.create(session, "calendar");
  setSystemTime(new Date(Date.now() + googleLinkTicketTTL + 1_000));
  expect(await tickets.start(ticket)).toBeNull();
});

test("a ticket whose session was revoked cannot start a link", async () => {
  const { context, session, tickets } = await fixture();
  const { ticket } = await tickets.create(session, "calendar");
  await context.internalAdapter.deleteSession(session.token);
  expect(await tickets.start(ticket)).toBeNull();
});

test("unknown and malformed tickets cannot start a link", async () => {
  const { session, tickets } = await fixture();
  const { ticket } = await tickets.create(session, "calendar");
  const unknown = `${ticket.slice(0, -1)}${ticket.endsWith("A") ? "B" : "A"}`;
  for (const value of [unknown, "", "short", `${ticket}x`, "https://accounts.google.com/"])
    expect(await tickets.start(value)).toBeNull();
  // Failed attempts do not use up the real ticket.
  expect(await tickets.start(ticket)).not.toBeNull();
});
