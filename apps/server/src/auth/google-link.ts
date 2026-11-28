import { desktopHandoffURL } from "@substrate/contracts/desktop/links";
import { googleProductScopes, type GoogleProduct } from "@substrate/contracts/integrations/google";
import {
  googleLinkTicket,
  googleProduct,
  googleProductSettingsPath,
  isGoogleConsentURL,
} from "@substrate/contracts/integrations/google-link";

import type { AuthSession } from "../shared/scope-types";
import type { AuthContext } from "better-auth";
import { APIError } from "better-auth/api";
import { setRequestCookie } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const googleLinkTicketTTL = 2 * 60_000;

type LinkContext = Pick<
  AuthContext,
  "internalAdapter" | "authCookies" | "secret" | "createAuthCookie"
>;

export interface GoogleLinkAuth {
  $context: Promise<LinkContext>;
  api: {
    linkSocialAccount(input: {
      headers: Headers;
      body: {
        provider: "google";
        scopes: string[];
        callbackURL: string;
        errorCallbackURL: string;
        disableRedirect: true;
      };
      returnHeaders: true;
    }): Promise<{ headers: Headers; response: { url?: string } }>;
  };
}

export interface GoogleLinkStart {
  url: string;
  cookies: string[];
}

const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
const ticketIdentifier = (ticket: string) => `google-link:${digest(ticket)}`;

const storedTicket = z.object({
  userId: z.string().min(1),
  sessionTokenHash: z.string().min(1),
  product: googleProduct,
});

function parseStored(value: string) {
  try {
    return storedTicket.safeParse(JSON.parse(value)).data ?? null;
  } catch {
    return null;
  }
}

export function createGoogleLinkTickets(auth: GoogleLinkAuth, options: { apiURL: string }) {
  return {
    async create(session: AuthSession["session"], product: GoogleProduct) {
      const context = await auth.$context;
      const ticket = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + googleLinkTicketTTL);
      await context.internalAdapter.createVerificationValue({
        identifier: ticketIdentifier(ticket),
        value: JSON.stringify({
          userId: session.userId,
          sessionTokenHash: digest(session.token),
          product,
        } satisfies z.infer<typeof storedTicket>),
        expiresAt,
      });
      return { ticket, expiresAt: expiresAt.toISOString() };
    },

    async start(ticket: string): Promise<GoogleLinkStart | null> {
      if (!googleLinkTicket.safeParse(ticket).success) return null;
      const context = await auth.$context;
      // Atomic: one caller gets the row; expired rows are deleted and return null.
      const row = await context.internalAdapter.consumeVerificationValue(ticketIdentifier(ticket));
      const grant = row ? parseStored(row.value) : null;
      if (!grant) return null;
      const now = Date.now();
      const sessions = await context.internalAdapter.listSessions(grant.userId);
      const source = sessions.find(
        (session) =>
          new Date(session.expiresAt).getTime() > now &&
          digest(session.token) === grant.sessionTokenHash,
      );
      if (!source) return null;

      const headers = new Headers();
      const signature = await makeSignature(source.token, context.secret);
      setRequestCookie(
        headers,
        context.authCookies.sessionToken.name,
        `${source.token}.${signature}`,
      );
      const callbackURL = desktopHandoffURL(
        googleProductSettingsPath[grant.product],
        options.apiURL,
      );
      let result: Awaited<ReturnType<GoogleLinkAuth["api"]["linkSocialAccount"]>>;
      try {
        result = await auth.api.linkSocialAccount({
          headers,
          body: {
            provider: "google",
            scopes: [...googleProductScopes[grant.product]],
            callbackURL,
            errorCallbackURL: callbackURL,
            disableRedirect: true,
          },
          returnHeaders: true,
        });
      } catch (error) {
        if (error instanceof APIError) return null;
        throw error;
      }
      const url = result.response.url;
      if (!isGoogleConsentURL(url)) return null;
      // Session refreshes and cookie caches also set cookies here. Forward only the state.
      const stateCookies = new Set(
        ["state", "oauth_state"].map((name) => context.createAuthCookie(name).name),
      );
      const cookies = result.headers
        .getSetCookie()
        .filter((cookie) => stateCookies.has(cookie.slice(0, cookie.indexOf("=")).trim()));
      if (!url || !cookies.length) return null;
      return { url, cookies };
    },
  };
}
export type GoogleLinkTickets = ReturnType<typeof createGoogleLinkTickets>;
