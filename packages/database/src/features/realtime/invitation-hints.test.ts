import { realtimeKeys } from "@substrate/contracts/realtime";

import { messagingConversations, messagingInvitations, user } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { sharingInvitationsHints } from "./routing";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("sharing invitation hints batch verified recipients without widening the audience", async () => {
  await f.db.update(user).set({ emailVerified: true }).where(eq(user.id, "bob"));
  const [conversation] = await f.db
    .insert(messagingConversations)
    .values({
      organizationId: f.orgA,
      kind: "channel",
      name: "Partners",
      createdBy: "alice",
    })
    .returning();
  const invitations = await f.db
    .insert(messagingInvitations)
    .values(
      ["bob@example.com", "outside@example.com", "unknown@example.com"].map((email) => ({
        conversationId: conversation!.id,
        hostOrganizationId: f.orgA,
        senderOrganizationId: f.orgA,
        inviterId: "alice",
        email,
        purpose: "person" as const,
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    )
    .returning();
  const tracked = recordQueries();
  await sharingInvitationsHints(tracked.db, invitations.slice(0, 1));
  const singleCount = tracked.queries.length;
  tracked.queries.length = 0;
  const hints = await sharingInvitationsHints(tracked.db, invitations);
  expect(tracked.queries.length).toBe(singleCount);
  expect(hints).toContainEqual({ audience: realtimeKeys.user("bob"), domain: "access" });
  expect(hints).toContainEqual({ audience: realtimeKeys.user("alice"), domain: "access" });
  expect(hints).toContainEqual({ audience: realtimeKeys.organization(f.orgA), domain: "access" });
  expect(hints).not.toContainEqual({ audience: realtimeKeys.user("outsider"), domain: "access" });
  expect(hints).not.toContainEqual({
    audience: realtimeKeys.organization(f.orgB),
    domain: "access",
  });
});
