import { FlowSkipped, workflowOutcome } from "./k6/flows/flow.ts";
import { createWorld, linkedWorkForMessage, type Message } from "./k6/lib/world.ts";
import {
  activityWeight,
  averageSignedInUsers,
  estimateActiveFraction,
  organizationSlug,
  maxConcurrentUsers,
  organizationProfile,
  rankUsers,
  Rng,
  selectResource,
  selectUser,
  userProfile,
} from "./workload.ts";
import { describe, expect, test } from "bun:test";

describe("load workload", () => {
  test("unavailable workflows are skipped, not completed; unexpected errors still fail", async () => {
    const emptyProjects: string[] = [];
    expect(
      await workflowOutcome(async () => {
        if (!emptyProjects.length) throw new FlowSkipped("No accessible projects");
      }),
    ).toBe("skipped");
    expect(await workflowOutcome(async () => {})).toBe("completed");
    expect(
      workflowOutcome(async () => {
        throw new Error("Unexpected setup failure");
      }),
    ).rejects.toThrow("Unexpected setup failure");
  });
  test("account slots are stable, unique, prefix-stable and bounded", () => {
    const users = Array.from({ length: 400 }, (_, index) => ({
      userId: `user-${index}`,
      email: `user-${index}@load.test`,
      organizationId: `org-${Math.floor(index / 20)}`,
    }));
    const organizations = Array.from({ length: 20 }, (_, index) => ({
      id: `org-${index}`,
      slug: `stable-org-${index}`,
    }));
    const ranked = rankUsers(users, organizations);
    expect(rankUsers([...users].reverse(), organizations)).toEqual(ranked);
    const selected = Array.from({ length: maxConcurrentUsers }, (_, index) =>
      selectUser(users, index + 1, organizations),
    );
    expect(new Set(selected.map((row) => row.userId)).size).toBe(200);
    expect(selected).toEqual(ranked.slice(0, 200));
    expect(() => selectUser(users, 201, organizations)).toThrow("No unique load account");
    expect(() => selectUser(users.slice(0, 2), 3, organizations)).toThrow();
  });

  test("fresh database IDs do not change personas, assignment, resource hotness or occupancy", () => {
    const make = (prefix: string) => {
      const organizations = Array.from({ length: 8 }, (_, index) => ({
        id: `${prefix}-org-${index}`,
        slug: `stable-org-${index}`,
      }));
      const users = Array.from({ length: 200 }, (_, index) => ({
        userId: `${prefix}-user-${index}`,
        email: `load-${index}@load.test`,
        organizationId: organizations[index % 8]!.id,
      }));
      const ranked = rankUsers(users, organizations);
      const profiles = users.map((row) =>
        userProfile(row.email, organizationSlug(row.organizationId, organizations)),
      );
      const resources = Array.from({ length: 50 }, (_, index) => ({
        id: `${prefix}-resource-${index}`,
        title: `Seeded work ${index}`,
      }));
      if (prefix === "fresh-database") resources.reverse();
      const random = new Rng("stable-actions");
      const picks = Array.from(
        { length: 1000 },
        () =>
          selectResource(resources, {
            seed: organizations[0]!.slug,
            random,
            id: (row) => row.title,
          })!.title,
      );
      return {
        organizationProfiles: organizations.map((row) => organizationProfile(row.slug)),
        profiles,
        assignment: ranked.map((row) => row.email),
        picks,
        occupancy: estimateActiveFraction(users, organizations, 200),
      };
    };
    expect(make("first-database")).toEqual(make("fresh-database"));
    expect(() => organizationSlug("missing", [])).toThrow("Missing load organization");
  });

  test("200 account slots have a lower modeled signed-in mean, reported separately from slots", () => {
    const slugs = [
      "northstar-labs",
      "meridian-health",
      "cedar-commerce",
      "atlas-logistics",
      "brightside-energy",
      "harbor-design",
      "fieldwork-analytics",
      "juniper-studio",
    ];
    const organizations = slugs.map((slug, index) => ({ id: `db-${index}`, slug: `load-${slug}` }));
    let index = 0;
    const users = [60, 40, 30, 25, 20, 12, 8, 5].flatMap((count, org) =>
      Array.from({ length: count }, () => ({
        email: `load-${String(++index).padStart(4, "0")}@load.test`,
        organizationId: organizations[org]!.id,
      })),
    );
    const fraction = estimateActiveFraction(users, organizations, 2000);
    console.log(
      `Modeled 200-account steady-state presence: ${(fraction * 100).toFixed(2)}%, ${(fraction * 200).toFixed(2)} signed-in users`,
    );
    expect(fraction).toBeGreaterThan(0.25);
    expect(fraction).toBeLessThan(0.35);
    const byActivity = [...users].sort((a, b) => {
      const profileA = userProfile(a.email, organizationSlug(a.organizationId, organizations));
      const profileB = userProfile(b.email, organizationSlug(b.organizationId, organizations));
      return (
        profileB.activity * profileB.organizationActivity -
        profileA.activity * profileA.organizationActivity
      );
    });
    expect(estimateActiveFraction(byActivity.slice(0, 20), organizations)).toBeGreaterThan(
      estimateActiveFraction(byActivity.slice(-20), organizations) * 3,
    );
    expect(estimateActiveFraction([...users].reverse(), organizations, 2000)).toBeCloseTo(
      fraction,
      12,
    );
    expect(averageSignedInUsers(60_000 * 25, 60_000)).toBe(25);
    expect(averageSignedInUsers(0, 0)).toBe(0);
  });

  test("power law keeps a meaningful head and a nonzero tail", () => {
    const weights = Array.from({ length: 100 }, (_, rank) => activityWeight(rank, 100));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    expect(weights.slice(0, 10).reduce((sum, weight) => sum + weight, 0) / total).toBeGreaterThan(
      0.6,
    );
    expect(weights[99]).toBeGreaterThan(0);
    expect(weights[0]! / weights[99]!).toBeGreaterThan(150);
  });

  test("user and organization activity are heavy-tailed without superhuman tempo", () => {
    const people = Array.from({ length: 1000 }, (_, index) => userProfile(`user-${index}`, "org"));
    const orgs = Array.from({ length: 1000 }, (_, index) => organizationProfile(`org-${index}`));
    for (const activities of [people.map((row) => row.activity), orgs.map((row) => row.activity)]) {
      activities.sort((a, b) => a - b);
      expect(activities[950]! / activities[500]!).toBeGreaterThan(3);
    }
    expect(people.every((row) => row.tempo >= 0.85 && row.tempo <= 1.15)).toBe(true);
    expect(userProfile("user-1", "org")).toEqual(userProfile("user-1", "org"));
    expect(userProfile("user-1", "org").flowBias).not.toEqual(
      userProfile("user-1", "other-org").flowBias,
    );
  });

  test("resource selection is deterministic, skewed, context-aware and explores the tail", () => {
    const items = Array.from({ length: 100 }, (_, id) => ({ id: String(id) }));
    const sample = (seed: string, relevant?: string) => {
      const random = new Rng("actions");
      const counts = new Map<string, number>();
      const sequence = Array.from(
        { length: 20_000 },
        () =>
          selectResource(items, {
            seed,
            random,
            id: (row) => row.id,
            relevance: (row) => (row.id === relevant ? 12 : 1),
          })!.id,
      );
      for (const id of sequence) counts.set(id, (counts.get(id) ?? 0) + 1);
      return { counts, sequence };
    };
    const baseline = sample("org");
    expect(sample("org").sequence).toEqual(baseline.sequence);
    expect(baseline.counts.size).toBe(100);
    const sorted = [...baseline.counts.values()].sort((a, b) => b - a);
    expect(sorted.slice(0, 10).reduce((sum, count) => sum + count, 0) / 20_000).toBeGreaterThan(
      0.5,
    );
    const cold = [...baseline.counts].sort((a, b) => a[1] - b[1])[0]![0];
    expect(sample("org", cold).counts.get(cold)!).toBeGreaterThan(baseline.counts.get(cold)! * 2);
    expect(sample("other-org").sequence).not.toEqual(baseline.sequence);
    expect(
      selectResource([], {
        seed: "org",
        random: new Rng("empty"),
        id: (row: { id: string }) => row.id,
      }),
    ).toBeUndefined();
  });

  test("resource selection never invents inaccessible resources", () => {
    const allowed = [{ id: "visible-a" }, { id: "visible-b" }];
    const random = new Rng("isolation");
    const chosen = Array.from({ length: 1000 }, () =>
      selectResource(allowed, { seed: "private-org", random, id: (row) => row.id }),
    );
    expect(chosen.every((row) => allowed.includes(row!))).toBe(true);
    expect(new Set(chosen).size).toBe(2);
  });

  test("linked-work reads use this message's accessible cards, not unrelated or CRM targets", () => {
    const world = createWorld({
      email: "a@example.com",
      name: "A",
      userId: "a",
      organizationId: "org",
    });
    const message: Message = {
      id: "message",
      conversationId: "chat",
      threadId: null,
      authorActorEntityId: "author",
      authorImage: null,
      body: "Hello",
      createdAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
      canModify: false,
      replyCount: 0,
      reactions: [],
      attachments: [],
    };
    world.tasks.push({ entityId: "unrelated", title: "Not linked", projectEntityId: "project" });
    expect(linkedWorkForMessage(world, message)).toEqual([]);
    world.contextIds.set(
      "chat",
      new Map([
        [
          "message",
          {
            messageId: "message",
            links: [
              { entityId: "task", entityType: "task", title: "Linked", projectEntityId: "project" },
              {
                entityId: "contact",
                entityType: "contact",
                title: "Person",
                projectEntityId: null,
              },
              { entityId: "missing-project", entityType: "task", title: "Invalid" },
            ],
          },
        ],
      ]),
    );
    expect(linkedWorkForMessage(world, message)).toEqual([
      { id: "task", title: "Linked", projectEntityId: "project", kind: "task" },
    ]);
    expect(linkedWorkForMessage(world, { ...message, conversationId: "other-chat" })).toEqual([]);
    expect(linkedWorkForMessage(world, { ...message, id: "other-message" })).toEqual([]);
  });
});
