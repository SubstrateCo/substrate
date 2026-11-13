import type { LoadFixture } from "../types";
import {
  channelCount,
  channelMessages,
  fixtureCounts,
  localTarget,
  provisioningTarget,
  requireNotificationMembers,
  seedRequest,
  SEED_PROFILE,
  SEED_VERSION,
} from "./fixture";
import { sizes } from "./organizations";
import { validateFixture } from "./validate";
import { expect, test } from "bun:test";

export function sampleFixture(apiUrl = "http://localhost:3201"): LoadFixture {
  const distribution = sizes(80);
  const organizationIndexes = distribution.flatMap((size, index) =>
    Array.from({ length: size }, () => index),
  );
  const users = organizationIndexes.map((orgIndex, index) => ({
    email: `load-${index}@load.test`,
    name: `Load ${index}`,
    userId: `user-${index}`,
    organizationId: `org-${orgIndex}`,
    actorEntityId: seedRequest(`actor-${index}`),
    crm: {
      accountEntityId: seedRequest(`account-${index}`),
      contactEntityId: seedRequest(`contact-${index}`),
      dealEntityId: seedRequest(`deal-${index}`),
      projectEntityId: seedRequest(`project-${index}`),
    },
    workspace: {
      conversationId: seedRequest(`channel-${orgIndex}`),
      projectEntityId: seedRequest(`project-${index}`),
      taskEntityId: seedRequest(`task-${index}`),
      discussionId: seedRequest(`discussion-${index}`),
    },
  }));
  const withNotifications = users.map((user, index) => {
    const sender = users.find(
      (row) => row.organizationId === user.organizationId && row.userId !== user.userId,
    )!;
    return {
      ...user,
      notification: {
        messageId: seedRequest(`notification-${index}`),
        conversationId: user.workspace.conversationId,
        senderUserId: sender.userId,
        senderActorEntityId: sender.actorEntityId,
      },
    };
  });
  return {
    apiUrl,
    origin: "http://localhost:3200",
    password: "test-password",
    seed: {
      version: SEED_VERSION,
      profile: SEED_PROFILE,
      complete: true,
      countBasis: "planned-minimum",
      counts: fixtureCounts(distribution),
    },
    users: withNotifications,
    organizations: distribution.map((_, index) => ({
      id: `org-${index}`,
      slug: `org-${index}`,
      name: `Org ${index}`,
      ownerEmail: users.find((row) => row.organizationId === `org-${index}`)!.email,
      memberEmails: users
        .filter((row) => row.organizationId === `org-${index}`)
        .map((row) => row.email),
    })),
  };
}

test("established fixture has bounded data volume, organization skew, and hot history", () => {
  const distribution = sizes(200);
  expect(distribution).toEqual([60, 40, 30, 25, 20, 12, 8, 5]);
  const counts = fixtureCounts(distribution);
  expect(counts).toMatchObject({
    users: 200,
    organizations: 8,
    accounts: 600,
    contacts: 600,
    deals: 600,
    followUps: 800,
    channels: 47,
    directMessages: 105,
    groups: 24,
    discussions: 233,
    projects: 233,
    tasks: 1491,
    messages: 6045,
    notifications: 200,
  });
  expect(counts.tasks).toBeGreaterThan(1200);
  expect(counts.messages).toBeGreaterThan(5200);
  expect(counts.messages).toBeLessThan(6500);
  for (const size of distribution) {
    const histories = Array.from({ length: channelCount(size) }, (_, index) =>
      channelMessages(size, index),
    );
    expect(histories.reduce((a, b) => a + b, 0)).toBe(size * 20);
    expect(histories[0]).toBeGreaterThan(Math.max(...histories.slice(1)));
  }
  expect(seedRequest("repeatable")).toBe(seedRequest("repeatable"));
  expect(seedRequest("different")).not.toBe(seedRequest("repeatable"));
});

test("fixture validation rejects stale, incomplete, missing and mis-scoped resources", () => {
  const fixture = sampleFixture();
  const target = { apiUrl: fixture.apiUrl, origin: fixture.origin };
  expect(validateFixture(fixture, target)).toEqual(fixture);
  for (const change of [
    (row: LoadFixture) => {
      row.seed.version++;
    },
    (row: LoadFixture) => {
      row.seed.profile = "other";
    },
    (row: LoadFixture) => {
      row.seed.complete = false;
    },
    (row: LoadFixture) => {
      row.seed.counts.tasks--;
    },
    (row: LoadFixture) => {
      delete row.users[0]!.crm;
    },
    (row: LoadFixture) => {
      delete row.users[0]!.workspace;
    },
    (row: LoadFixture) => {
      row.users[0]!.organizationId = row.users.at(-1)!.organizationId;
    },
    (row: LoadFixture) => {
      row.users[0]!.workspace!.projectEntityId = seedRequest("wrong");
    },
    (row: LoadFixture) => {
      delete row.users[0]!.notification;
    },
    (row: LoadFixture) => {
      row.users[0]!.notification!.senderUserId = row.users[0]!.userId;
    },
  ]) {
    const invalid = structuredClone(fixture);
    change(invalid);
    expect(() => validateFixture(invalid, target)).toThrow();
  }
  expect(() => validateFixture(fixture, { ...target, apiUrl: "http://localhost:9999" })).toThrow(
    "target",
  );
});

test("notification coverage rejects single-member organization distributions before provisioning", () => {
  expect(() => requireNotificationMembers(sizes(8))).toThrow("at least two");
  expect(() => requireNotificationMembers(sizes(80))).not.toThrow();
  expect(() => requireNotificationMembers(sizes(200))).not.toThrow();
});

test("load targets cannot be remote, implicit-port, redirected-path or credential URLs", () => {
  for (const url of [
    "https://localhost:3201",
    "http://localhost",
    "http://example.com:3201",
    "http://localhost:3201/api",
    "http://user@localhost:3201",
    "http://localhost:3201?target=remote",
  ])
    expect(() => localTarget(url)).toThrow();
  expect(localTarget("http://127.0.0.1:3201")).toBe("http://127.0.0.1:3201");
  const target = {
    apiUrl: "http://localhost:3201",
    origin: "http://localhost:3200",
    mailpitUrl: "http://localhost:8026",
  };
  expect(() => provisioningTarget(target)).not.toThrow();
  expect(() => provisioningTarget({ ...target, apiUrl: "http://localhost:3001" })).toThrow("3201");
  expect(() => provisioningTarget({ ...target, mailpitUrl: "http://localhost:8025" })).toThrow(
    "8026",
  );
});
