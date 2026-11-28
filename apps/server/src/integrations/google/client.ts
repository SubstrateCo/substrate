import type { GoogleProduct } from "@substrate/contracts/integrations/google";

import {
  GoogleError,
  GoogleGone,
  GoogleNotFound,
  GoogleRateLimited,
  GoogleReauthRequired,
  GoogleScopeMissing,
  GoogleUnavailable,
} from "./errors";
import { z } from "zod";

export type GoogleFetch = (url: string, init: RequestInit) => Promise<Response>;

type GoogleJson = string | number | boolean | null | GoogleJson[] | { [key: string]: GoogleJson };

export interface GoogleClient {
  get<T>(url: string | URL, schema: z.ZodType<T>): Promise<T>;
  /** Retries only rate limits: Google did not run a rate-limited request. */
  post<T>(url: string | URL, body: GoogleJson, schema: z.ZodType<T>): Promise<T>;
}

const requestTimeoutMs = 30_000;
export const googleMaxRetries = 3;
const baseDelayMs = 500;
const maxDelayMs = 30_000;

const scopeReasons = new Set(["insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"]);
const rateLimitReasons = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

const reasons = z
  .array(z.object({ reason: z.string().optional() }))
  .default([])
  .transform((entries) => entries.flatMap((entry) => (entry.reason ? [entry.reason] : [])));
/** API errors are objects with reasons; OAuth errors are a bare code such as `invalid_grant`. */
const errorBody = z
  .object({
    error: z.union([
      z.string().transform((code) => ({ code, reasons: [] })),
      z
        .object({ status: z.string().optional(), errors: reasons, details: reasons })
        .transform((error) => ({
          code: error.status ?? null,
          reasons: [...error.errors, ...error.details],
        })),
    ]),
  })
  .transform((body) => body.error)
  .catch({ code: null, reasons: [] });

interface GoogleFailure {
  status: number;
  retryAfter: string | null;
  code: string | null;
  reasons: string[];
}

function assertGoogleApiURL(url: string | URL): URL {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const allowed =
    parsed.protocol === "https:" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    (host === "googleapis.com" || host.endsWith(".googleapis.com"));
  if (!allowed) throw new TypeError("Google requests must use an https://*.googleapis.com URL.");
  return parsed;
}

/** `Retry-After` in seconds or as an HTTP date. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function classifyGoogleFailure(product: GoogleProduct, failure: GoogleFailure) {
  const { status } = failure;
  const has = (candidates: Set<string>) => failure.reasons.some((reason) => candidates.has(reason));
  if (status === 401 || failure.code === "invalid_grant") return new GoogleReauthRequired();
  if (status === 403 && has(scopeReasons)) return new GoogleScopeMissing(product);
  if (status === 429 || (status === 403 && has(rateLimitReasons)))
    return new GoogleRateLimited(retryAfterMs(failure.retryAfter));
  if (status === 403)
    return new GoogleUnavailable("provider_forbidden", "Google refused the request.", status);
  if (status === 404) return new GoogleNotFound();
  if (status === 410) return new GoogleGone();
  return new GoogleUnavailable(`provider_http_${status}`, "The Google request failed.", status);
}

function retryable(error: GoogleError, method: string) {
  if (error instanceof GoogleRateLimited) return true;
  const serverError = error instanceof GoogleUnavailable && (error.status ?? 0) >= 500;
  return serverError && method === "GET";
}

function retryDelay(error: GoogleError, retry: number, random: () => number) {
  const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** retry) * (0.5 + random() / 2);
  const requested = error instanceof GoogleRateLimited ? (error.retryAfterMs ?? 0) : 0;
  return Math.max(backoff, requested);
}

export function createGoogleClient(options: {
  token: string;
  product: GoogleProduct;
  fetch?: GoogleFetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}): GoogleClient {
  const {
    token,
    product,
    fetch: fetcher = fetch,
    sleep = (ms) => Bun.sleep(ms),
    random = Math.random,
  } = options;

  async function attempt<T>(
    method: string,
    url: URL,
    body: GoogleJson | undefined,
    schema: z.ZodType<T>,
  ) {
    const headers = new Headers({ authorization: `Bearer ${token}`, accept: "application/json" });
    if (body !== undefined) headers.set("content-type", "application/json");
    let response: Response;
    try {
      response = await fetcher(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // A redirect could carry the bearer token to another host.
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new GoogleUnavailable("provider_unreachable", "Google is unreachable.");
    }
    const json = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok)
      throw classifyGoogleFailure(product, {
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
        ...errorBody.parse(json),
      });
    return schema.parse(json);
  }

  async function request<T>(
    method: string,
    target: string | URL,
    body: GoogleJson | undefined,
    schema: z.ZodType<T>,
  ) {
    const url = assertGoogleApiURL(target);
    for (let retry = 0; ; retry++) {
      try {
        return await attempt(method, url, body, schema);
      } catch (error) {
        const last = retry >= googleMaxRetries;
        if (!(error instanceof GoogleError) || last || !retryable(error, method)) throw error;
        const delay = retryDelay(error, retry, random);
        if (delay > maxDelayMs) throw error;
        await sleep(delay);
      }
    }
  }

  return {
    get: (url, schema) => request("GET", url, undefined, schema),
    post: (url, body, schema) => request("POST", url, body, schema),
  };
}
