import { catalogSkillSchema, type SkillSearch } from "@substrate/contracts/agents/skill-catalog";
import { failure, publicFailure, success, type ServiceResult } from "@substrate/contracts/result";

import { z } from "zod";

const publicSearch = z.object({ skills: z.array(z.unknown()) });
type SearchReply = { result: ServiceResult<SkillSearch>; retryAfterSeconds?: number };

/** Header resets may be epoch seconds, an HTTP date, or seconds from now. */
export function retryDelay(headers: Headers, now: number) {
  const retry = headers.get("retry-after");
  if (retry !== null) {
    const seconds = Number(retry);
    if (Number.isFinite(seconds)) return Math.max(1, seconds);
    const date = Date.parse(retry);
    if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  }
  const reset = Number(headers.get("x-ratelimit-reset") ?? headers.get("ratelimit-reset"));
  if (reset > 0) return Math.max(1, Math.ceil(reset > 1_000_000_000 ? reset - now / 1000 : reset));
  return 60;
}

export function createSkillCatalogService(
  options: {
    fetch?: (input: URL, init: RequestInit) => Promise<Response>;
    now?: () => number;
  } = {},
) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const users = new Map<string, { start: number; count: number; busy: boolean }>();
  const cache = new Map<string, { expires: number; data: SkillSearch }>();
  const pending = new Map<string, Promise<SearchReply>>();
  let upstreamAvailableAt = 0;
  let windowStart = 0;
  let upstreamRequests = 0;

  function limited(seconds: number): SearchReply {
    return {
      result: publicFailure("RATE_LIMITED", `Search is paused. Try again in ${seconds} seconds.`),
      retryAfterSeconds: seconds,
    };
  }

  async function searchUpstream(query: string): Promise<SearchReply> {
    try {
      // Same unauthenticated endpoint as `skills find`; no search telemetry call.
      const url = new URL("https://skills.sh/api/search");
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "25");
      const response = await request(url, {
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      const time = now();
      const remaining =
        response.headers.get("x-ratelimit-remaining") ??
        response.headers.get("ratelimit-remaining");
      if (response.status === 429 || remaining === "0")
        upstreamAvailableAt = Math.max(
          upstreamAvailableAt,
          time + retryDelay(response.headers, time) * 1000,
        );
      if (response.status === 429) return limited(retryDelay(response.headers, time));
      if (!response.ok) throw new Error("Catalog unavailable");
      const body = publicSearch.parse(await response.json());
      const skills = body.skills
        .flatMap((entry) => {
          const parsed = catalogSkillSchema.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        })
        .slice(0, 25);
      const data = { skills };
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(query, { data, expires: time + 60_000 });
      const reply: SearchReply = { result: success(data) };
      if (upstreamAvailableAt > time)
        reply.retryAfterSeconds = Math.ceil((upstreamAvailableAt - time) / 1000);
      return reply;
    } catch {
      upstreamAvailableAt = Math.max(upstreamAvailableAt, now() + 5000);
      return {
        result: failure(
          "INTERNAL_ERROR",
          "Skill search is unavailable. You can still import a repository.",
        ),
      };
    }
  }

  return {
    async search(userId: string, query: string): Promise<SearchReply> {
      const time = now();
      // Bound retained user state, without an extra cleanup timer.
      for (const [id, state] of users)
        if (!state.busy && time - state.start >= 60_000) users.delete(id);
      let user = users.get(userId);
      if (!user) {
        if (users.size >= 10_000) return limited(60);
        user = { start: time, count: 0, busy: false };
        users.set(userId, user);
      }
      if (user.busy || user.count >= 20)
        return limited(Math.max(1, Math.ceil((user.start + 60_000 - time) / 1000)));
      user.count++;
      const key = query.trim().toLowerCase();
      const cached = cache.get(key);
      if (cached && cached.expires > time) return { result: success(cached.data) };
      if (upstreamAvailableAt > time)
        return limited(Math.ceil((upstreamAvailableAt - time) / 1000));
      if (time - windowStart >= 60_000) {
        windowStart = time;
        upstreamRequests = 0;
      }
      if (!pending.has(key) && (upstreamRequests >= 60 || pending.size >= 4))
        return limited(Math.max(1, Math.ceil((windowStart + 60_000 - time) / 1000)));
      // At most one request per user, and one upstream fetch per distinct query.
      user.busy = true;
      try {
        let work = pending.get(key);
        if (!work) {
          upstreamRequests++;
          work = searchUpstream(key);
          pending.set(key, work);
          void work.finally(() => pending.delete(key));
        }
        return await work;
      } finally {
        user.busy = false;
      }
    },
  };
}
export type SkillCatalogService = ReturnType<typeof createSkillCatalogService>;
