import {
  googleLinkStartQuery,
  googleLinkTicketInput,
} from "@substrate/contracts/integrations/google-link";

import { htmlPage, setHtmlPageHeaders } from "../../shared/html-page";
import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { IdentityScope } from "../../shared/scope-types";
import type { IntegrationService } from "./service";
import { Hono } from "hono";

export function createIntegrationRoutes(service: IntegrationService, scopes: Scopes) {
  return (
    new Hono<ScopeEnv<IdentityScope>>()
      .post(
        "/google/link-tickets",
        v("json", googleLinkTicketInput),
        scopes.identity(),
        async (c) =>
          respond(
            c,
            await service.createGoogleLinkTicket(c.var.scope, c.req.valid("json").product),
          ),
      )
      // A top-level browser navigation: no session cookie or Origin. The ticket is the credential.
      .get("/google/link/start", v("query", googleLinkStartQuery), async (c) => {
        setHtmlPageHeaders(c);
        const link = await service.startGoogleLink(c.req.valid("query").ticket);
        if (!link)
          return c.html(
            htmlPage({
              title: "This link expired",
              paragraphs: ["Return to Substrate and try again."],
              actions: [{ label: "Return to Substrate", href: service.returnURL, primary: true }],
            }),
            400,
          );
        for (const cookie of link.cookies) c.header("Set-Cookie", cookie, { append: true });
        return c.redirect(link.url, 302);
      })
  );
}
