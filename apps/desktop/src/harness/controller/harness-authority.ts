import { harnessKinds } from "@startup-os/contracts/harness";

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
    agents: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        instructions: z.string(),
        harness: z.enum(harnessKinds),
        model: z.string().optional(),
        enabled: z.boolean(),
        useStartupDefaults: z.boolean(),
      }),
    ),
  }),
});

const sessionResultSchema = z.object({ success: z.literal(true), data: verifiedSessionSchema });

export async function readVerifiedSession(
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>,
  backend: string,
) {
  const response = await fetchAPI(new URL("/api/v1/session", backend).href, {
    method: "GET",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Session unavailable.");
  return sessionResultSchema.parse(await response.json()).data;
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
      if (!membership.ok) throw new Error("Organization unavailable.");
      z.object({ role: z.string().min(1) }).parse(await membership.json());
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
