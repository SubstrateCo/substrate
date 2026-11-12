import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { RepositoryContext } from "../repository-context";
import { organizationRepository } from "./repository";
import { organization } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

function repository(db: RepositoryContext["db"], userId: string, organizationId = f.orgA) {
  const actorEntityId = userId === "alice" ? f.alice : f.bob;
  return organizationRepository(new RepositoryContext(db, { organizationId, actorEntityId }), {
    userId,
    organizationId,
  });
}

test("the summary reads the organization and the viewer's own role in one statement", async () => {
  await f.db.update(organization).set({ logo: "/logo.png" }).where(eq(organization.id, f.orgA));
  const { db, queries } = recordQueries();
  expect(await repository(db, "bob").summary()).toEqual({
    id: f.orgA,
    name: "A",
    logo: "/logo.png",
    role: "member",
  });
  expect(queries).toHaveLength(1);
  expect(await repository(f.db, "alice").summary()).toMatchObject({ role: "owner" });
});

test("the summary rejects a person who is not a member", async () => {
  expect(await rejection(repository(f.db, "outsider").summary())).toBeInstanceOf(AccessDeniedError);
});

test("people lists only the organization's members", async () => {
  await f.verifyEmails();
  const repositories = await f.forSession("bob");
  expect(
    (await repositories.organizations.people()).sort((a, b) => a.name.localeCompare(b.name)),
  ).toEqual([
    { userId: "alice", name: "Alice", email: "alice@example.com", image: null },
    { userId: "bob", name: "Bob", email: "bob@example.com", image: null },
  ]);
});
