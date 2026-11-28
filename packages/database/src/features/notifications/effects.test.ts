import { realtimeKeys } from "@substrate/contracts/realtime";

import { ensureHumanActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { commit } from "../../core/effects";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { member } from "../../core/organizations/schema";
import { RepositoryContext } from "../../core/repository-context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { messagingParticipants } from "../messaging/schema";
import { notify } from "./effects";
import { notifications } from "./schema";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();
const aliceContext = (tx: DatabaseExecutor) =>
  new RepositoryContext(tx, { organizationId: f.orgA, actorEntityId: f.alice });

async function person(id: string, organizationId = f.orgA) {
  await f.db.insert(user).values({ id, name: id, email: `${id}@example.com`, emailVerified: true });
  await f.db.insert(member).values({ id: `${id}-${organizationId}`, userId: id, organizationId });
  return (await ensureHumanActor(f.db, { userId: id, organizationId })).entityId;
}

const statements = (queries: string[]) =>
  queries.filter((query) => !/^\s*(begin|commit|rollback|savepoint|release)/i.test(query));

const byText = (a: string, b: string) => a.localeCompare(b);

async function stored(eventKey: string) {
  return (await f.db.select().from(notifications).where(eq(notifications.eventKey, eventKey)))
    .map((row) => `${row.organizationId}:${row.recipientActorEntityId}:${row.kind}`)
    .sort(byText);
}

function notificationAudiences(hints: { domain: string; audience: unknown }[]) {
  return hints
    .flatMap((hint) => (hint.domain === "notifications" ? [String(hint.audience)] : []))
    .sort(byText);
}

test("grouped entity alerts insert in one access-checked statement, and the first group wins", async () => {
  await f.verifyEmails();
  const one = await person("one");
  const unverified = await person("unverified");
  const disabled = await person("disabled");
  const deleted = await person("deleted");
  const departed = await person("departed");
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Alerts" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Alert" });
  for (const actorEntityId of [f.bob, unverified, disabled, deleted, departed])
    await alice.permissions.grant({ entityId: project.entityId, actorEntityId, level: "view" });
  await f.db.update(user).set({ emailVerified: false }).where(eq(user.id, "unverified"));
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, disabled));
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, deleted));
  await f.db.delete(member).where(eq(member.userId, "departed"));
  const { db, queries } = recordQueries();
  const eventKey = crypto.randomUUID();
  const { result, hints } = await commit(db, (tx) =>
    notify(
      aliceContext(tx),
      [
        { kind: "reply", recipients: [{ userId: "bob" }, { userId: "alice" }] },
        { kind: "mention", recipients: [{ actorEntityId: f.bob }] },
        {
          kind: "assignment",
          recipients: [
            { actorEntityId: f.bob },
            { actorEntityId: f.alice },
            { actorEntityId: f.alice },
            { actorEntityId: one },
            { actorEntityId: unverified },
            { actorEntityId: disabled },
            { actorEntityId: deleted },
            { actorEntityId: departed },
            { actorEntityId: f.outsider },
          ],
        },
      ],
      { entityId: task.entityId, eventKey },
    ),
  );
  expect(statements(queries)).toHaveLength(1);
  expect(statements(queries)[0]).toMatch(/^\s*insert into "notifications".*\bselect\b/is);
  expect(await stored(eventKey)).toEqual(
    [`${f.orgA}:${f.alice}:assignment`, `${f.orgA}:${f.bob}:mention`].sort(byText),
  );
  expect(result.map((row) => row.actorId).sort(byText)).toEqual([f.alice, f.bob].sort(byText));
  expect(notificationAudiences(hints)).toEqual(
    [realtimeKeys.actor(f.orgA, f.alice), realtimeKeys.actor(f.orgA, f.bob)]
      .map(String)
      .sort(byText),
  );
});

test("message alerts reach cross-organization participants and skip people who cannot see it", async () => {
  await f.verifyEmails();
  await Promise.all(["unverified", "disabled", "departed", "absent"].map((id) => person(id)));
  const messaging = f.messaging("alice");
  const conversation = await messaging.createConversation({
    kind: "group",
    emails: [
      "bob@example.com",
      "outside@example.com",
      "unverified@example.com",
      "disabled@example.com",
      "departed@example.com",
    ],
  });
  const sent = await messaging.sendMessage(conversation.id, "hello");
  await f.db.update(user).set({ emailVerified: false }).where(eq(user.id, "unverified"));
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.userId, "disabled"));
  const [departed] = await f.db.select().from(actors).where(eq(actors.userId, "departed"));
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(messagingParticipants.conversationId, conversation.id),
        eq(messagingParticipants.actorEntityId, departed!.entityId),
      ),
    );
  const { db, queries } = recordQueries();
  const eventKey = crypto.randomUUID();
  const { result, hints } = await commit(db, (tx) =>
    notify(
      aliceContext(tx),
      [
        { kind: "mention", recipients: [{ userId: "outsider" }] },
        { kind: "reply", recipients: [{ actorEntityId: f.bob }, { userId: "outsider" }] },
        {
          kind: "message",
          recipients: ["bob", "alice", "unverified", "disabled", "departed", "absent"].map(
            (userId) => ({ userId }),
          ),
        },
      ],
      {
        messageId: sent.id,
        conversationId: conversation.id,
        conversationOrganizationId: f.orgA,
        eventKey,
      },
    ),
  );
  expect(statements(queries)).toHaveLength(1);
  expect(statements(queries)[0]).toMatch(/^\s*insert into "notifications".*\bselect\b/is);
  expect(await stored(eventKey)).toEqual(
    [
      `${f.orgA}:${f.alice}:message`,
      `${f.orgA}:${f.bob}:reply`,
      `${f.orgB}:${f.outsider}:mention`,
    ].sort(byText),
  );
  expect(result.map((row) => `${row.organizationId}:${row.actorId}`).sort(byText)).toEqual(
    [`${f.orgA}:${f.alice}`, `${f.orgA}:${f.bob}`, `${f.orgB}:${f.outsider}`].sort(byText),
  );
  expect(notificationAudiences(hints)).toEqual(
    [
      realtimeKeys.actor(f.orgA, f.alice),
      realtimeKeys.actor(f.orgA, f.bob),
      realtimeKeys.actor(f.orgB, f.outsider),
    ]
      .map(String)
      .sort(byText),
  );
});

test("a repeated event, an inaccessible target, or no eligible names inserts no rows or hints", async () => {
  await f.verifyEmails();
  const project = await f.forActor(f.alice).projects.create({ name: "Alerts" });
  const foreign = await f.forActor(f.outsider, f.orgB).projects.create({ name: "Foreign alerts" });
  const eventKey = crypto.randomUUID();
  const run = async (
    entityId: string,
    groups: Parameters<typeof notify>[1],
    key = crypto.randomUUID(),
  ) => {
    const { db, queries } = recordQueries();
    const committed = await commit(db, (tx) =>
      notify(aliceContext(tx), groups, { entityId, eventKey: key }),
    );
    return { ...committed, statements: statements(queries) };
  };
  const alice = [{ kind: "assignment" as const, recipients: [{ actorEntityId: f.alice }] }];
  expect((await run(project.entityId, alice, eventKey)).result).toHaveLength(1);
  for (const repeated of [
    await run(project.entityId, alice, eventKey),
    await run(foreign.entityId, alice),
    await run(project.entityId, [{ kind: "mention", recipients: [{ userId: "alice" }] }]),
  ]) {
    expect(repeated.statements).toHaveLength(1);
    expect(repeated.result).toEqual([]);
    expect(notificationAudiences(repeated.hints)).toEqual([]);
  }
  expect(await stored(eventKey)).toEqual([`${f.orgA}:${f.alice}:assignment`]);
  expect(
    await f.db.select().from(notifications).where(eq(notifications.entityId, foreign.entityId)),
  ).toEqual([]);

  const { db, queries } = recordQueries();
  const { result } = await commit(db, (tx) =>
    notify(aliceContext(tx), [{ kind: "mention", recipients: [] }], {
      entityId: project.entityId,
      eventKey: crypto.randomUUID(),
    }),
  );
  expect(result).toEqual([]);
  expect(statements(queries)).toEqual([]);
});

test("alerts roll back with the caller's transaction", async () => {
  await f.verifyEmails();
  const project = await f.forActor(f.alice).projects.create({ name: "Alerts" });
  const eventKey = crypto.randomUUID();
  const { db } = recordQueries();
  let inserted: unknown[] = [];
  const failure = new Error("caller failed");
  expect(
    await rejection(
      commit(db, async (tx) => {
        inserted = await notify(
          aliceContext(tx),
          [{ kind: "assignment", recipients: [{ actorEntityId: f.alice }] }],
          { entityId: project.entityId, eventKey },
        );
        throw failure;
      }),
    ),
  ).toBe(failure);
  expect(inserted).toHaveLength(1);
  expect(await stored(eventKey)).toEqual([]);
});
