import { createGoogleClient, googleMaxRetries, retryAfterMs, type GoogleFetch } from "./client";
import {
  GoogleError,
  GoogleGone,
  GoogleNotFound,
  GoogleRateLimited,
  GoogleReauthRequired,
  GoogleScopeMissing,
  GoogleUnavailable,
} from "./errors";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Reply = { status?: number; body?: Json; headers?: Record<string, string> } | "network";

const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const json = z.json();

function client(replies: Reply[], options: { random?: () => number } = {}) {
  const requests: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  const fetch: GoogleFetch = async (target, init) => {
    requests.push({ url: target, init });
    const reply = replies.shift();
    if (!reply) throw new Error("No more fixture replies.");
    if (reply === "network") throw new TypeError("fetch failed");
    return Response.json(reply.body ?? null, {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  };
  const google = createGoogleClient({
    token: "secret-token",
    product: "calendar",
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: options.random ?? (() => 0.5),
  });
  return { google, requests, sleeps };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected a failure.");
}

const reasons = (...values: string[]) => ({
  error: { errors: values.map((reason) => ({ reason })) },
});

describe("Google failures", () => {
  // Each reply fails once; retryable ones fail on every retry too.
  const classify = async (reply: Exclude<Reply, "network">) => {
    const error = await failure(
      client(Array(googleMaxRetries + 1).fill(reply)).google.get(url, json),
    );
    if (!(error instanceof GoogleError)) throw error;
    return error;
  };

  test("classify by status and Google's reasons, without the response body", async () => {
    expect(await classify({ status: 401, body: reasons("authError") })).toBeInstanceOf(
      GoogleReauthRequired,
    );
    expect(await classify({ status: 400, body: { error: "invalid_grant" } })).toBeInstanceOf(
      GoogleReauthRequired,
    );
    for (const body of [
      reasons("insufficientPermissions"),
      {
        error: {
          status: "PERMISSION_DENIED",
          details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
        },
      },
    ]) {
      const missing = await classify({ status: 403, body });
      expect(missing).toBeInstanceOf(GoogleScopeMissing);
      expect(missing).toMatchObject({ product: "calendar", errorCode: "calendar_scope_missing" });
    }
    for (const reply of [
      { status: 403, body: reasons("rateLimitExceeded") },
      { status: 403, body: reasons("userRateLimitExceeded") },
      { status: 429, body: null },
    ])
      expect(await classify(reply)).toBeInstanceOf(GoogleRateLimited);
    expect(await classify({ status: 403, body: reasons("forbidden") })).toMatchObject({
      errorCode: "provider_forbidden",
    });
    expect(await classify({ status: 404, body: reasons("notFound") })).toBeInstanceOf(
      GoogleNotFound,
    );
    expect(await classify({ status: 410, body: reasons("fullSyncRequired") })).toBeInstanceOf(
      GoogleGone,
    );
    const outage = await classify({ status: 503, body: "<html>down</html>" });
    expect(outage).toBeInstanceOf(GoogleUnavailable);
    expect(outage).toMatchObject({ errorCode: "provider_http_503", status: 503 });
  });

  test("never carry the token or the body in the error", async () => {
    const error = await classify({ status: 500, body: { error: { message: "secret-body" } } });
    const text = `${String(error)} ${JSON.stringify(error)} ${error.stack ?? ""}`;
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("secret-body");
  });

  test("an unreachable Google is unavailable and not retried", async () => {
    const { google, requests } = client(["network"]);
    expect(await failure(google.get(url, json))).toMatchObject({
      errorCode: "provider_unreachable",
    });
    expect(requests).toHaveLength(1);
  });
});

describe("Google requests", () => {
  test("send the bearer token and return parsed JSON", async () => {
    const { google, requests } = client([{ body: { items: [] } }]);
    expect(await google.get(url, json)).toEqual({ items: [] });
    const headers = new Headers(requests[0]?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer secret-token");
    expect(requests[0]?.init.method).toBe("GET");
  });

  test("a response that does not match the caller's schema is rejected", async () => {
    const { google } = client([{ body: { items: "not a list" } }]);
    const page = z.object({ items: z.array(z.string()) });
    expect(await failure(google.get(url, page))).toBeInstanceOf(z.ZodError);
  });

  test("post a JSON body", async () => {
    const { google, requests } = client([{ body: { id: "created" } }]);
    expect(await google.post(url, { title: "x" }, json)).toEqual({ id: "created" });
    expect(requests[0]?.init).toMatchObject({ method: "POST", body: '{"title":"x"}' });
    expect(new Headers(requests[0]?.init.headers).get("content-type")).toBe("application/json");
  });

  test("only reach https Google API hosts", async () => {
    for (const target of [
      "http://www.googleapis.com/calendar/v3",
      "https://googleapis.com.example.test/calendar/v3",
      "https://evilgoogleapis.com/x",
      "https://www.googleapis.com:8443/x",
      "https://user@www.googleapis.com/x",
      "https://accounts.google.com/o/oauth2/token",
    ]) {
      const { google, requests } = client([{ body: {} }]);
      expect(await failure(google.get(target, json))).toBeInstanceOf(TypeError);
      expect(requests).toEqual([]);
    }
    const { google } = client([{ body: {} }, { body: {} }]);
    expect(
      await google.get("https://gmail.googleapis.com/gmail/v1/users/me/profile", json),
    ).toEqual({});
    expect(await google.get("https://googleapis.com/x", json)).toEqual({});
  });
});

describe("Google retries", () => {
  test("rate limits and server errors back off exponentially with jitter, then succeed", async () => {
    const { google, requests, sleeps } = client([
      { status: 429 },
      { status: 503 },
      { status: 403, body: reasons("userRateLimitExceeded") },
      { body: { ok: true } },
    ]);
    expect(await google.get(url, json)).toEqual({ ok: true });
    expect(requests).toHaveLength(4);
    // random() = 0.5 waits 75% of each step: 500 ms, 1 s, 2 s.
    expect(sleeps).toEqual([375, 750, 1500]);
  });

  test("jitter stays between half and all of the step", async () => {
    const low = client([{ status: 500 }, { body: {} }], { random: () => 0 });
    const high = client([{ status: 500 }, { body: {} }], { random: () => 1 });
    await low.google.get(url, json);
    await high.google.get(url, json);
    expect([...low.sleeps, ...high.sleeps]).toEqual([250, 500]);
  });

  test("give up after the bounded retries with the last error", async () => {
    const { google, requests, sleeps } = client(Array(googleMaxRetries + 1).fill({ status: 500 }));
    expect(await failure(google.get(url, json))).toMatchObject({ errorCode: "provider_http_500" });
    expect(requests).toHaveLength(googleMaxRetries + 1);
    expect(sleeps).toHaveLength(googleMaxRetries);
  });

  test("other failures are not retried", async () => {
    for (const status of [400, 401, 404, 410]) {
      const { google, requests } = client([{ status }, { body: {} }]);
      await failure(google.get(url, json));
      expect(requests).toHaveLength(1);
    }
  });

  test("a post retries a rate limit but not a server error, which may have run it", async () => {
    const limited = client([{ status: 429 }, { body: {} }]);
    expect(await limited.google.post(url, {}, json)).toEqual({});
    const failed = client([{ status: 500 }, { body: {} }]);
    expect(await failure(failed.google.post(url, {}, json))).toMatchObject({
      errorCode: "provider_http_500",
    });
    expect(failed.requests).toHaveLength(1);
  });

  test("Retry-After sets a longer wait, and a wait too long for one request is returned", async () => {
    const honoured = client([{ status: 429, headers: { "retry-after": "7" } }, { body: {} }]);
    await honoured.google.get(url, json);
    expect(honoured.sleeps).toEqual([7000]);

    const shorter = client([{ status: 429, headers: { "retry-after": "0" } }, { body: {} }]);
    await shorter.google.get(url, json);
    expect(shorter.sleeps).toEqual([375]);

    const long = client([{ status: 429, headers: { "retry-after": "3600" } }, { body: {} }]);
    const error = await failure(long.google.get(url, json));
    expect(error).toBeInstanceOf(GoogleRateLimited);
    expect(error).toMatchObject({ retryAfterMs: 3_600_000 });
    expect(long.sleeps).toEqual([]);
    expect(long.requests).toHaveLength(1);
  });

  test("Retry-After accepts seconds or an HTTP date", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");
    expect(retryAfterMs("120", now)).toBe(120_000);
    expect(retryAfterMs("Sun, 22 Nov 2026 12:00:30 GMT", now)).toBe(30_000);
    expect(retryAfterMs("Sun, 22 Nov 2026 11:00:00 GMT", now)).toBe(0);
    expect(retryAfterMs("soon", now)).toBeNull();
    expect(retryAfterMs(null, now)).toBeNull();
  });
});
