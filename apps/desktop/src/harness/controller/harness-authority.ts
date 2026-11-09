import { harnessAgentSchema } from "@startup-os/contracts/harness";

import { createHash } from "node:crypto";
import { z } from "zod";

const verifiedSessionSchema = z.object({
  user: z.object({ id: z.string().min(1), emailVerified: z.literal(true) }),
  session: z.object({
    activeOrganizationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  }),
});
const catalogSchema = z.object({
  success: z.literal(true),
  data: z.object({
    agents: z.array(harnessAgentSchema),
  }),
});

const sessionResultSchema = z.object({ success: z.literal(true), data: verifiedSessionSchema });

/**
 * The backend answered that this account or membership is no longer valid. Other failures,
 * such as network errors and 5xx answers, are transient.
 */
export class HarnessAccessDenied extends Error {}

const deniedStatuses = new Set([401, 403, 404]);

export async function readVerifiedSession(
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>,
  backend: string,
) {
  const response = await fetchAPI(new URL("/api/v1/session", backend).href, {
    method: "GET",
    redirect: "error",
  });
  if (deniedStatuses.has(response.status)) throw new HarnessAccessDenied("Session ended.");
  if (!response.ok) throw new Error("Session unavailable.");
  const result = sessionResultSchema.safeParse(await response.json());
  // A valid answer without a verified user and an active organization denies access.
  if (!result.success) throw new HarnessAccessDenied("Session is not verified.");
  return result.data.data;
}

export function createHarnessAuthority(options: {
  backend: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
}) {
  return {
    async verify() {
      const data = await readVerifiedSession(options.fetchAPI, options.backend);
      const organizationId = data.session.activeOrganizationId;
      const membershipURL = new URL(
        "/api/auth/organization/get-active-member-role",
        options.backend,
      );
      membershipURL.searchParams.set("organizationId", organizationId);
      const membership = await options.fetchAPI(membershipURL.href, {
        method: "GET",
        redirect: "error",
      });
      if (deniedStatuses.has(membership.status))
        throw new HarnessAccessDenied("Organization membership ended.");
      if (!membership.ok) throw new Error("Organization unavailable.");
      if (!z.object({ role: z.string().min(1) }).safeParse(await membership.json()).success)
        throw new HarnessAccessDenied("Organization membership ended.");
      const accountKey = createHash("sha256")
        .update(JSON.stringify([new URL(options.backend).origin, data.user.id]))
        .digest("hex");
      return { accountKey, organizationId, userId: data.user.id, identity: accountKey };
    },
    async catalog() {
      const response = await options.fetchAPI(
        new URL("/api/v1/agents/list", options.backend).href,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          redirect: "error",
        },
      );
      const result = catalogSchema.parse(await response.json());
      if (!response.ok) throw new Error("Catalog unavailable.");
      return result.data.agents;
    },
  };
}
