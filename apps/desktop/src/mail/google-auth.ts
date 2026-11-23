import { parseGrantedScopes } from "@substrate/contracts/integrations/google";

import type { GoogleClient } from "./google-client.ts";
import { ReconnectRequired } from "./provider.ts";
import { createAuthorizationURL } from "@better-auth/core/oauth2";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";

const readScope = "https://www.googleapis.com/auth/gmail.readonly";
type GoogleRequest = (url: string, init: RequestInit) => Promise<Response>;
const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});
async function tokens(
  client: GoogleClient,
  params: Record<string, string>,
  signal: AbortSignal,
  request: GoogleRequest = fetch,
) {
  const body = new URLSearchParams({ ...params, client_id: client.client_id });
  if (client.client_secret) body.set("client_secret", client.client_secret);
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) {
    const error = z
      .object({ error: z.string() })
      .safeParse(await response.json().catch(() => null));
    if (
      error.success &&
      ["invalid_grant", "invalid_client", "deleted_client", "unauthorized_client"].includes(
        error.data.error,
      )
    )
      throw new ReconnectRequired("Reconnect Gmail.");
    throw new Error("Google authorization unavailable.");
  }
  const result = tokenResponse.parse(await response.json());
  if (result.scope !== undefined) {
    const granted = parseGrantedScopes(result.scope);
    if (!granted.includes(readScope) || granted.some((s) => s !== readScope && s !== "openid"))
      throw new ReconnectRequired("Unexpected Gmail permissions.");
  }
  return result;
}

/** A native loopback PKCE grant; neither token nor authorization code crosses renderer IPC. */
export async function connectGoogle(
  client: GoogleClient,
  open: (url: string) => Promise<void>,
  parent: AbortSignal,
  request: GoogleRequest = fetch,
) {
  parent.throwIfAborted();
  const signal = AbortSignal.any([parent, AbortSignal.timeout(180_000)]);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) =>
      server.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    const addr = z.object({ port: z.int().positive() }).parse(server.address());
    const redirect = `http://127.0.0.1:${addr.port}/callback`;
    // Share Better Auth's request/PKCE builder with Calendar, but keep this callback
    // and the token exchange in Electron. No client config goes into a server link ticket.
    const auth = await createAuthorizationURL({
      id: "google",
      options: { clientId: client.client_id },
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      redirectURI: redirect,
      scopes: ["openid", readScope],
      accessType: "offline",
      prompt: "select_account consent",
      state,
      codeVerifier: verifier,
    });
    const code = await new Promise<string>((resolve, reject) => {
      signal.throwIfAborted();
      const cancel = () => reject(new Error("Google authorization ended."));
      signal.addEventListener("abort", cancel, { once: true });
      server.on("request", (req, res) => {
        const url = URL.parse(req.url ?? "", redirect);
        const localGet = req.method === "GET" && req.headers.host === `127.0.0.1:${addr.port}`;
        if (!localGet || url?.pathname !== "/callback" || url.searchParams.get("state") !== state) {
          res.writeHead(400).end();
          return;
        }
        const value = url.searchParams.get("code");
        res
          .writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" })
          .end("Return to Substrate. You can close this tab.");
        signal.removeEventListener("abort", cancel);
        if (value) resolve(value);
        else reject(new Error("Google connection cancelled."));
      });
      void open(auth.href).catch(reject);
    });
    const grant = await tokens(
      client,
      { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirect },
      signal,
      request,
    );
    if (!grant.refresh_token) throw new Error("Google did not grant offline access.");
    const readIdentity: RequestInit = {
      headers: { authorization: `Bearer ${grant.access_token}` },
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    };
    const [profile, identity] = await Promise.all([
      request("https://gmail.googleapis.com/gmail/v1/users/me/profile", readIdentity),
      request("https://openidconnect.googleapis.com/v1/userinfo", readIdentity),
    ]);
    if (!profile.ok || !identity.ok) throw new Error("Could not verify the Google mailbox.");
    const { emailAddress } = z.object({ emailAddress: z.email() }).parse(await profile.json());
    const { sub } = z.object({ sub: z.string().min(1) }).parse(await identity.json());
    return { address: emailAddress, providerAccountId: sub, refreshToken: grant.refresh_token };
  } finally {
    server.close();
    server.closeAllConnections();
  }
}
export function gmailAccess(
  client: GoogleClient,
  refresh: string,
  signal: AbortSignal,
  saveReplacement: (refreshToken: string) => Promise<void>,
  request: GoogleRequest = fetch,
) {
  let cached: { token: string; until: number } | undefined;
  let refreshing: Promise<string> | undefined;
  return async () => {
    if (cached && cached.until > Date.now()) return cached.token;
    return (refreshing ??= tokens(
      client,
      { grant_type: "refresh_token", refresh_token: refresh },
      signal,
      request,
    )
      .then(async (grant) => {
        if (grant.refresh_token && grant.refresh_token !== refresh) {
          await saveReplacement(grant.refresh_token);
          refresh = grant.refresh_token;
        }
        cached = {
          token: grant.access_token,
          until: Date.now() + grant.expires_in * 1000 - 60_000,
        };
        return cached.token;
      })
      .finally(() => {
        refreshing = undefined;
      }));
  };
}
