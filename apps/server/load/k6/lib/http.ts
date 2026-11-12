import { withConnection } from "./connections.ts";
import { apiUrl, origin } from "./data.ts";
import { trace } from "./debug.ts";
import { endpoints, failureCodes, type EndpointName, type FailureCode } from "./endpoints.ts";
import { apiCalls, apiDuration, apiFailures, writes } from "./metrics.ts";
import type { JSONValue } from "k6";
import http from "k6/http";

type Data = Record<string, JSONValue | undefined>;

let organizationId = "";

/** The session's active organization, added to every workspace request. */
export function setOrganization(id: string) {
  organizationId = id;
}

function queryString(data: Data) {
  const pairs = Object.entries(data).filter(([, value]) => value !== undefined && value !== null);
  return pairs.length
    ? `?${pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(queryValue(value!))}`).join("&")}`
    : "";
}

function queryValue(value: JSONValue): string {
  if (Array.isArray(value)) return value.map(queryValue).join(",");
  // oxlint-disable-next-line deslop/no-runtime-typeof -- HTTP serialization boundary: objects need JSON; scalars use their string value.
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

function failureCode(status: number, code: JSONValue): FailureCode {
  const known = failureCodes.find((value) => value === code);
  if (known) return known;
  if (status === 0) return "NETWORK";
  if (status >= 500) return "HTTP_5XX";
  if (status >= 400) return "HTTP_4XX";
  return "BAD_BODY";
}

const reported = new Set<string>();

/**
 * Calls one endpoint with the VU's cookie session and the trusted Origin. Workspace routes get
 * `organizationId` added. Resolves the unwrapped `data` (plain JSON for auth routes), `true` when
 * a route succeeds without data, or null after a failure, which is counted by endpoint and code
 * and logged once per VU and endpoint/code.
 */
export async function call<T = JSONValue>(name: EndpointName, data: Data = {}): Promise<T | null> {
  const endpoint = endpoints[name];
  const input = endpoint.scope === "workspace" ? { organizationId, ...data } : data;
  const get = endpoint.method === "GET";
  const url = `${apiUrl}${endpoint.path}${get ? queryString(input) : ""}`;
  const started = Date.now();
  const headers: http.Params["headers"] = { Origin: origin };
  if (!get) headers["Content-Type"] = "application/json";
  const response = await withConnection(() =>
    http.asyncRequest(endpoint.method, url, get ? null : JSON.stringify(input), {
      headers,
      tags: { name, endpoint: name },
      timeout: "30s",
    }),
  );
  const tags = { endpoint: name };
  apiCalls.add(1, tags);
  apiDuration.add(response.timings.duration, tags);
  let body: JSONValue = null;
  let errorCode: JSONValue = null;
  try {
    body = response.body ? response.json() : null;
    errorCode = response.body ? response.json("error.code") : null;
  } catch {
    body = null;
  }
  // SAFETY: workspace and user endpoints use the server's data envelope; callers supply the endpoint's data type.
  const envelope = body as { success?: boolean; data?: T } | null;
  const ok =
    response.status >= 200 &&
    response.status < 300 &&
    (endpoint.scope === "auth" || envelope?.success === true);
  trace("http", `${endpoint.method} ${name} ${response.status} ${Date.now() - started}ms`);
  if (!ok) {
    const code = failureCode(response.status, errorCode);
    apiFailures.add(1, { endpoint: name, code });
    const key = `${name} ${code}`;
    if (!reported.has(key)) {
      reported.add(key);
      console.warn(
        `[vu ${__VU}] ${endpoint.method} ${name} failed: ${response.status} ${code} ${JSON.stringify(response.body ?? response.error).slice(0, 200)}`,
      );
    }
    return null;
  }
  if ("write" in endpoint && endpoint.write) writes.add(1, tags);
  const result = endpoint.scope === "auth" ? body : envelope!.data;
  // Some routes succeed without data; `true` keeps them distinct from a failure.
  // SAFETY: callers use the endpoint's response type; no-data writes use only the truthiness of the result.
  return (result ?? true) as T;
}

/** Drops the session cookie, so the next sign-in starts clean. */
export function clearCookies() {
  http.cookieJar().clear(apiUrl);
}
