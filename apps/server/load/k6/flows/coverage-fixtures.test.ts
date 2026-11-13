import type { LoadUser } from "../../types.ts";
import {
  coverageChannel,
  coverageHelpers,
  coverageProject,
  ownedFixture,
  seededChannel,
} from "./coverage-fixtures.ts";
import { expect, test } from "bun:test";

function cohort(organizationId: string, count: number): LoadUser[] {
  return Array.from({ length: count }, (_, index) => ({
    organizationId,
    userId: `${organizationId}-${index}`,
    actorEntityId: `actor-${organizationId}-${index}`,
    email: `${organizationId}-${index}@load.test`,
    name: `${organizationId} ${index}`,
  }));
}

test("temporary channel invites and project share actors exclude all active coverage slots", () => {
  const users = cohort("first", 60);
  const helpers = coverageHelpers(users, 8);
  expect(helpers.length).toBe(52);
  expect(helpers.map((helper) => helper.userId)).toEqual(users.slice(8).map((user) => user.userId));
  const fixture = coverageChannel(
    "coverage-customer-success",
    helpers.slice(0, 5).map((user) => user.email),
  );
  expect(fixture).toEqual({
    kind: "channel",
    name: "coverage-customer-success",
    private: true,
    emails: users.slice(8, 13).map((user) => user.email),
  });
  const remainingMemberPeers = helpers.filter((user) => !fixture.emails.includes(user.email));
  expect(remainingMemberPeers.length).toBeGreaterThanOrEqual(3);
  expect(
    helpers.some((helper) =>
      users.slice(0, 8).some((active) => active.actorEntityId === helper.actorEntityId),
    ),
  ).toBe(false);
});

test("every active organization needs a full helper cohort, not just the first organization", () => {
  const first = cohort("first", 10);
  const second = cohort("second", 8);
  expect(() =>
    coverageHelpers([...first.slice(0, 2), second[0]!, ...first.slice(2), ...second.slice(1)], 3),
  ).toThrow("second needs at least 8 inactive helpers");
  second.push(...cohort("third", 1).map((user) => ({ ...user, organizationId: "second" })));
  expect(
    coverageHelpers([...first.slice(0, 2), second[0]!, ...first.slice(2), ...second.slice(1)], 3)
      .length,
  ).toBe(16);
});

test("missing project actor identities fail setup instead of omitting direct-share coverage", () => {
  const users = cohort("first", 16);
  delete users[15]!.actorEntityId;
  expect(() => coverageHelpers(users, 8)).toThrow("inactive helpers with actor IDs");
  expect(() => coverageHelpers(cohort("first", 15), 8)).toThrow("at least 8");
});

test("join and leave candidates are seeded channels, not another actor's public temporary channel", () => {
  const rows = [
    { id: "seed", kind: "channel", name: "product", private: false },
    { id: "other-temp", kind: "channel", name: "coverage-product-launch", private: false },
    { id: "private-seed", kind: "channel", name: "engineering", private: true },
    { id: "group", kind: "group", name: "product", private: false },
  ];
  expect(rows.flatMap((row) => (!row.private && seededChannel(row) ? [row.id] : []))).toEqual([
    "seed",
  ]);
});

test("admin access does not make another actor's fixture eligible for member management or sharing", () => {
  const rows = [
    { id: "own-temp", canManage: true, level: "owner" },
    { id: "other-temp", canManage: true, level: "owner" },
    { id: "seed", canManage: true, level: "owner" },
  ];
  expect(
    rows.flatMap((row) =>
      row.canManage && ownedFixture(row.id, new Set(["own-temp"])) ? [row.id] : [],
    ),
  ).toEqual(["own-temp"]);
  expect(
    rows.flatMap((row) =>
      row.level === "owner" && coverageProject(row.id, ["own-temp"], "seed", true) ? [row.id] : [],
    ),
  ).toEqual(["own-temp"]);
  expect(
    rows.flatMap((row) => (coverageProject(row.id, ["own-temp"], "seed", false) ? [row.id] : [])),
  ).toEqual(["own-temp", "seed"]);
});
