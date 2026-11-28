import { AccessDeniedError } from "../../errors";
import { createRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { member } from "../organizations/schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const alice = () => ({ userId: "alice", organizationId: f.orgA });

test("a burst of session reads resolves the workspace once, then again after the cache time", async () => {
  await f.verifyEmails();
  const { db, queries } = recordQueries();
  let now = 0;
  const repositories = createRepositories(db, { workspaceCacheMs: 5000, now: () => now });
  await Promise.all([repositories.forSession(alice()), repositories.forSession(alice())]);
  await repositories.forSession(alice());
  expect(queries).toHaveLength(1);
  now = 5000;
  await repositories.forSession(alice());
  expect(queries).toHaveLength(2);
});

test("without a cache time every session resolves the workspace", async () => {
  await f.verifyEmails();
  const { db, queries } = recordQueries();
  const repositories = createRepositories(db);
  await repositories.forSession(alice());
  await repositories.forSession(alice());
  expect(queries).toHaveLength(2);
});

test("a cached workspace is kept per user and organization, and a denied one is not kept", async () => {
  const repositories = createRepositories(f.db, { workspaceCacheMs: 5000 });
  expect(await rejection(repositories.forSession(alice()))).toBeInstanceOf(AccessDeniedError);
  await f.verifyEmails();
  await repositories.forSession(alice());
  expect(
    await rejection(repositories.forSession({ userId: "bob", organizationId: f.orgB })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(repositories.forSession({ userId: "alice", organizationId: f.orgB })),
  ).toBeInstanceOf(AccessDeniedError);
});

test("a removed member reads until the cache is forgotten or expires, and can never write", async () => {
  await f.verifyEmails();
  let now = 0;
  const repositories = createRepositories(f.db, { workspaceCacheMs: 5000, now: () => now });
  const session = await repositories.forSession(alice());
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect(await rejection(session.projects.create({ name: "Denied" }))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection((await repositories.forSession(alice())).projects.create({ name: "Denied" })),
  ).toBeInstanceOf(AccessDeniedError);
  repositories.forgetWorkspaces();
  expect(await rejection(repositories.forSession(alice()))).toBeInstanceOf(AccessDeniedError);
});

test("an expired cached workspace denies a removed member", async () => {
  await f.verifyEmails();
  let now = 0;
  const repositories = createRepositories(f.db, { workspaceCacheMs: 5000, now: () => now });
  await repositories.forSession(alice());
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  now = 5000;
  expect(await rejection(repositories.forSession(alice()))).toBeInstanceOf(AccessDeniedError);
});
