import type { LoadUser } from "../../types.ts";
import type { CrmCommand } from "./crm.ts";
import { apiUrl, origin, password } from "./data.ts";
import { clearCookies, call, setOrganization } from "./http.ts";
import { check, fail } from "k6";
import http from "k6/http";

export async function login(user: LoadUser) {
  clearCookies();
  if (!(await call("auth.signIn", { email: user.email, password })))
    fail("CRM smoke sign-in failed");
  setOrganization(user.organizationId);
  if (!(await call("auth.setActive", { organizationId: user.organizationId })))
    fail("CRM smoke workspace selection failed");
}

/** Expected denials are correctness checks, not throughput API failures. */
export async function rejected(
  path: string,
  input: Record<string, string>,
  status: number,
  secret = "",
) {
  const query = Object.entries(input)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return expectRejection(path, "GET", `?${query}`, null, status, secret);
}

export function rejectedMutation(
  input: CrmCommand & { organizationId: string },
  status: number,
  secret = "",
) {
  return expectRejection("crm/mutations", "POST", "", JSON.stringify(input), status, secret);
}

async function expectRejection(
  path: string,
  method: "GET" | "POST",
  query: string,
  body: string | null,
  status: number,
  secret: string,
) {
  const response = await http.asyncRequest(method, `${apiUrl}/api/v1/${path}${query}`, body, {
    headers: { Origin: origin, "Content-Type": "application/json" },
    tags: { name: `crm.correctness.${status}`, endpoint: path },
    responseCallback: http.expectedStatuses(status),
  });
  let code = "NOT_FOUND";
  if (status === 409) code = "CONFLICT";
  if (status === 403) code = "WORKSPACE_CHANGED";
  check(response, {
    [`CRM rejects ${path} with ${status} and no record data`]: (row) =>
      row.status === status &&
      row.json("success") === false &&
      row.json("error.code") === code &&
      !row.json("data") &&
      (!secret || !JSON.stringify(row.json()).includes(secret)),
  });
}
