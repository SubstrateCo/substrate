import { createSkillCatalogService, retryDelay } from "./skill-catalog-service";
import { expect, test } from "bun:test";

const entry = { name: "web-design-guidelines", source: "vercel-labs/agent-skills", installs: 100 };
const result = () => Response.json({ skills: [entry] });

test("search caches public results but limits each user independently", async () => {
  let calls = 0;
  let now = 1000;
  const service = createSkillCatalogService({
    now: () => now,
    fetch: async () => {
      calls++;
      return result();
    },
  });
  expect((await service.search("owner", "design")).result).toEqual({
    success: true,
    data: { skills: [entry] },
  });
  for (let index = 0; index < 19; index++) await service.search("owner", "design");
  expect(await service.search("owner", "design")).toMatchObject({ retryAfterSeconds: 60 });
  expect((await service.search("other", "design")).result.success).toBe(true);
  expect(calls).toBe(1);
  now += 60_001;
  expect((await service.search("owner", "design")).result.success).toBe(true);
  expect(calls).toBe(2);
});

test("a provider 429 pauses all users without retrying upstream", async () => {
  let calls = 0;
  let now = 1000;
  const service = createSkillCatalogService({
    now: () => now,
    fetch: async () => {
      calls++;
      return calls === 1
        ? new Response(null, { status: 429, headers: { "Retry-After": "90" } })
        : result();
    },
  });
  expect(await service.search("owner", "design")).toMatchObject({ retryAfterSeconds: 90 });
  expect(await service.search("other", "testing")).toMatchObject({ retryAfterSeconds: 90 });
  expect(calls).toBe(1);
  now += 90_001;
  expect((await service.search("other", "testing")).result.success).toBe(true);
  expect(calls).toBe(2);
});

test("exhausted quota on a successful response pauses the next uncached search", async () => {
  let calls = 0;
  const service = createSkillCatalogService({
    now: () => 1000,
    fetch: async () => {
      calls++;
      return Response.json(
        { skills: [entry] },
        {
          headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "35" },
        },
      );
    },
  });
  expect((await service.search("owner", "design")).result.success).toBe(true);
  expect(await service.search("owner", "testing")).toMatchObject({ retryAfterSeconds: 35 });
  expect((await service.search("other", "design")).result.success).toBe(true);
  expect(calls).toBe(1);
});

test("one user's in-flight search cannot create a second upstream request", async () => {
  const pending = Promise.withResolvers<Response>();
  const service = createSkillCatalogService({ fetch: () => pending.promise });
  const first = service.search("owner", "design");
  expect(await service.search("owner", "testing")).toMatchObject({ retryAfterSeconds: 60 });
  pending.resolve(result());
  expect((await first).result.success).toBe(true);
});

test("unsafe result sources are excluded rather than offered for installation", async () => {
  const service = createSkillCatalogService({
    fetch: async () => Response.json({ skills: [entry, { ...entry, source: "../../private" }] }),
  });
  expect((await service.search("owner", "design")).result).toEqual({
    success: true,
    data: { skills: [entry] },
  });
});

test("retry headers support HTTP dates and epoch resets", () => {
  expect(retryDelay(new Headers({ "Retry-After": "Thu, 01 Jan 1970 00:02:00 GMT" }), 60_000)).toBe(
    60,
  );
  expect(retryDelay(new Headers({ "X-RateLimit-Reset": "1800000060" }), 1800000000000)).toBe(60);
});
